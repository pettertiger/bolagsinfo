const SESSION_COOKIE = "bolagsinfo_session";
const SESSION_DAYS = 7;
const ACCESS_CODE_ITERATIONS = 100000;

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      ...headers
    }
  });
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map(cookie => cookie.trim().split("="))
      .filter(parts => parts.length === 2)
      .map(([name, ...value]) => [name, decodeURIComponent(value.join("="))])
  );
}

function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function deriveAccessCodeHash(code, salt, iterations = ACCESS_CODE_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(code),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64Url(salt), iterations, hash: "SHA-256" },
    key,
    256
  );
  return toBase64Url(new Uint8Array(bits));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function createSession(env, userId) {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = toBase64Url(await digest(token));
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.D8.prepare(`
    INSERT INTO auth_session (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(sessionId, userId, tokenHash, expiresAt).run();
  return { token, expiresAt };
}

function sessionCookie(token, expiresAt) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_DAYS * 86400}; Expires=${new Date(expiresAt).toUTCString()}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function getSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = toBase64Url(await digest(token));
  const result = await env.D8.prepare(`
    SELECT s.id AS session_id, u.id, u.email, u.display_name, u.role
    FROM auth_session s
    JOIN app_user u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      AND u.is_active = 1
  `).bind(tokenHash).first();
  return result ? { ...result, token } : null;
}

async function requireSession(request, env) {
  const session = await getSession(request, env);
  return session ? { session } : { response: json({ error: "Inloggning krävs." }, 401) };
}

async function requireAdmin(request, env) {
  const result = await requireSession(request, env);
  if (result.response) return result;
  return result.session.role === "admin"
    ? result
    : { response: json({ error: "Administratörsbehörighet krävs." }, 403) };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function loginIdentifier(request, email) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  return toBase64Url(await digest(`${email}|${ip}`));
}

async function isLoginLocked(env, identifier) {
  const attempt = await env.D8.prepare(`
    SELECT locked_until
    FROM auth_login_attempt
    WHERE identifier = ? AND locked_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(identifier).first();
  return Boolean(attempt);
}

async function recordFailedLogin(env, identifier) {
  await env.D8.prepare(`
    INSERT INTO auth_login_attempt (identifier, failed_count, locked_until)
    VALUES (?, 1, NULL)
    ON CONFLICT(identifier) DO UPDATE SET
      failed_count = auth_login_attempt.failed_count + 1,
      locked_until = CASE
        WHEN auth_login_attempt.failed_count + 1 >= 5 THEN datetime('now', '+15 minutes')
        ELSE auth_login_attempt.locked_until
      END,
      last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).bind(identifier).run();
}

async function clearFailedLogins(env, identifier) {
  await env.D8.prepare("DELETE FROM auth_login_attempt WHERE identifier = ?").bind(identifier).run();
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function mutationAudit(action, actorId, entityId, details = {}) {
  return [
    "INSERT INTO audit_event (actor_id, action, entity_id, details_json) VALUES (?, ?, ?, ?)",
    [actorId, action, entityId, JSON.stringify(details)]
  ];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/login") {
      const body = await readJson(request);
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const code = typeof body?.code === "string" ? body.code : "";
      const identifier = await loginIdentifier(request, email);
      if (await isLoginLocked(env, identifier)) return json({ error: "För många försök. Försök igen senare." }, 429);
      const user = await env.D8.prepare(`
        SELECT id, email, display_name, role, access_code_salt, access_code_hash, access_code_iterations
        FROM app_user
        WHERE email = ? AND is_active = 1
      `).bind(email).first();

      const suppliedHash = user?.access_code_salt && user?.access_code_hash
        ? await deriveAccessCodeHash(code, user.access_code_salt, user.access_code_iterations)
        : "";
      const valid = Boolean(user && suppliedHash && constantTimeEqual(suppliedHash, user.access_code_hash));
      if (!valid) {
        await recordFailedLogin(env, identifier);
        return json({ error: "Felaktig e-postadress eller kod." }, 401);
      }

      await clearFailedLogins(env, identifier);
      const session = await createSession(env, user.id);
      await env.D8.prepare(`
        UPDATE app_user
        SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?
      `).bind(user.id).run();
      return json(
        { user: { email: user.email, displayName: user.display_name, role: user.role } },
        200,
        { "set-cookie": sessionCookie(session.token, session.expiresAt) }
      );
    }

    if (request.method === "POST" && url.pathname === "/api/logout") {
      const session = await getSession(request, env);
      if (session) {
        await env.D8.prepare(`UPDATE auth_session SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(session.session_id).run();
      }
      return json({ ok: true }, 200, { "set-cookie": `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` });
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      const result = await requireSession(request, env);
      return result.response || json({ user: result.session });
    }

    if (request.method === "GET" && url.pathname === "/api/contracts") {
      const result = await requireSession(request, env);
      if (result.response) return result.response;
      const status = url.searchParams.get("status") || "all";
      const query = url.searchParams.get("q")?.trim() || "";
      const resultSet = await env.D8.prepare(`
        SELECT id, company_name, due_date, note, version
        FROM contract
        WHERE deleted_at IS NULL
          AND (? = '' OR company_name LIKE ? OR note LIKE ?)
          AND (
            ? = 'all'
            OR (? = 'expired' AND due_date < date('now'))
            OR (? = 'upcoming' AND due_date >= date('now'))
          )
        ORDER BY due_date ASC, company_name ASC
      `).bind(query, `%${query}%`, `%${query}%`, status, status, status).all();
      return json({ contracts: resultSet.results });
    }

    const contractMatch = url.pathname.match(/^\/api\/contracts\/(\d+)$/);
    if (contractMatch && ["PATCH", "DELETE"].includes(request.method)) {
      const result = await requireAdmin(request, env);
      if (result.response) return result.response;
      const contractId = Number(contractMatch[1]);

      if (request.method === "DELETE") {
        const deleted = await env.D8.prepare(`
          UPDATE contract
          SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), deleted_by = ?, version = version + 1
          WHERE id = ? AND deleted_at IS NULL
        `).bind(result.session.id, contractId).run();
        if (!deleted.meta.changes) return json({ error: "Avtalet hittades inte." }, 404);
        const audit = mutationAudit("contract_deleted", result.session.id, contractId);
        await env.D8.prepare(audit[0]).bind(...audit[1]).run();
        return json({ ok: true });
      }

      const body = await readJson(request);
      const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
      const dueDate = body?.dueDate;
      const note = typeof body?.note === "string" ? body.note.trim() || null : null;
      const expectedVersion = Number(body?.version);
      if (!companyName || companyName.length > 180 || !validDate(dueDate) || !Number.isInteger(expectedVersion)) {
        return json({ error: "Ogiltiga avtalsuppgifter." }, 400);
      }
      const updated = await env.D8.prepare(`
        UPDATE contract
        SET company_name = ?, due_date = ?, note = ?, version = version + 1,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_by = ?
        WHERE id = ? AND version = ? AND deleted_at IS NULL
      `).bind(companyName, dueDate, note, result.session.id, contractId, expectedVersion).run();
      if (!updated.meta.changes) return json({ error: "Avtalet är ändrat av någon annan eller saknas." }, 409);
      const audit = mutationAudit("contract_updated", result.session.id, contractId, { companyName, dueDate });
      await env.D8.prepare(audit[0]).bind(...audit[1]).run();
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/contracts") {
      const result = await requireAdmin(request, env);
      if (result.response) return result.response;
      const body = await readJson(request);
      const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
      const dueDate = body?.dueDate;
      const note = typeof body?.note === "string" ? body.note.trim() || null : null;
      if (!companyName || companyName.length > 180 || !validDate(dueDate)) return json({ error: "Ogiltiga avtalsuppgifter." }, 400);
      const inserted = await env.D8.prepare(`
        INSERT INTO contract (company_name, due_date, note, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?)
      `).bind(companyName, dueDate, note, result.session.id, result.session.id).run();
      const contractId = inserted.meta.last_row_id;
      const audit = mutationAudit("contract_created", result.session.id, contractId, { companyName, dueDate });
      await env.D8.prepare(audit[0]).bind(...audit[1]).run();
      return json({ id: contractId }, 201);
    }

    return new Response("Bolagsinfo Worker fungerar", {
      headers: { "content-type": "text/plain; charset=UTF-8" }
    });
  }
};
