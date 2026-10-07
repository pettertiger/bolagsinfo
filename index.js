const SESSION_COOKIE = "bolagsinfo_session";
const SESSION_DAYS = 7;
const ACCESS_CODE_ITERATIONS = 100000;
const SCB_BASELINE_VERSION = "adjacent-employee-classes-v1";

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

function employeeCategory(code) {
  if (code === 0) return "unknown";
  if (code >= 1 && code <= 4) return "under_50";
  if (code === 5) return "20_49";
  if (code === 6) return "50_99";
  if (code === 7) return "100_199";
  if (code >= 8 && code <= 16) return "200_plus";
  return null;
}

function normalizeScbOrgNumber(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return /^\d{10}$/.test(digits) ? digits : null;
}

const compatibleComparisonQuery = `
  WITH ranked_batches AS (
    SELECT id, reference_month, fetched_at,
      ROW_NUMBER() OVER (
        PARTITION BY reference_month
        ORDER BY fetched_at DESC, id DESC
      ) AS month_rank
    FROM scb_import_batch
    WHERE status = 'ready' AND source_version = ?
  )
  SELECT current.id AS current_import_id,
         current.reference_month AS current_month,
         previous.id AS previous_import_id,
         previous.reference_month AS previous_month
  FROM ranked_batches current
  JOIN ranked_batches previous
    ON previous.reference_month = date(current.reference_month, '-1 month')
   AND previous.month_rank = 1
  WHERE current.month_rank = 1
  ORDER BY current.reference_month DESC, current.id DESC
  LIMIT 1
`;

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
      if (result.response) return result.response;
      return json({
        user: {
          email: result.session.email,
          displayName: result.session.display_name,
          role: result.session.role
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/api/statistics/current") {
      const result = await requireSession(request, env);
      if (result.response) return result.response;

      const summary = await env.D8.prepare(`
        SELECT id, month_start, revision, current_import_id, previous_import_id, published_at
        FROM monthly_summary
        WHERE status = 'published'
        ORDER BY month_start DESC, revision DESC
        LIMIT 1
      `).first();
      const baseline = await env.D8.prepare(`
        SELECT reference_month, record_count
        FROM scb_import_batch
        WHERE status = 'ready' AND source_version = ?
        ORDER BY reference_month DESC, fetched_at DESC, id DESC
        LIMIT 1
      `).bind(SCB_BASELINE_VERSION).first();
      const comparison = await env.D8.prepare(compatibleComparisonQuery)
        .bind(SCB_BASELINE_VERSION)
        .first();
      const comparisonAlreadyPublished = comparison
        ? Boolean(await env.D8.prepare(`
            SELECT 1
            FROM monthly_summary
            WHERE status = 'published'
              AND current_import_id = ? AND previous_import_id = ?
            LIMIT 1
          `).bind(comparison.current_import_id, comparison.previous_import_id).first())
        : false;

      let entries = [];
      if (summary) {
        const resultSet = await env.D8.prepare(`
          SELECT company_name_at_publication AS company_name,
                 previous_category, current_category, employee_count_at_publication
          FROM monthly_summary_entry
          WHERE summary_id = ?
          ORDER BY company_name_at_publication COLLATE NOCASE, company_id
        `).bind(summary.id).all();
        entries = resultSet.results;
      }
      return json({
        summary: summary ? { ...summary, entries } : null,
        baseline,
        comparisonAvailable: Boolean(comparison) && !comparisonAlreadyPublished,
        comparisonAlreadyPublished,
        comparison: comparison
          ? { previousMonth: comparison.previous_month, currentMonth: comparison.current_month }
          : null
      });
    }

    if (request.method === "GET" && url.pathname === "/api/statistics/months") {
      const result = await requireSession(request, env);
      if (result.response) return result.response;
      const resultSet = await env.D8.prepare(`
        WITH latest_summaries AS (
          SELECT id, month_start, revision, published_at,
                 ROW_NUMBER() OVER (
                   PARTITION BY month_start ORDER BY revision DESC
                 ) AS month_rank
          FROM monthly_summary
          WHERE status = 'published'
        )
        SELECT m.month_start, m.revision, m.published_at, COUNT(e.id) AS company_count
        FROM latest_summaries m
        LEFT JOIN monthly_summary_entry e ON e.summary_id = m.id
        WHERE m.month_rank = 1
        GROUP BY m.id
        ORDER BY m.month_start DESC
      `).all();
      return json({ months: resultSet.results });
    }

    const statisticsMonthMatch = url.pathname.match(/^\/api\/statistics\/months\/(\d{4}-\d{2})$/);
    if (request.method === "GET" && statisticsMonthMatch) {
      const result = await requireSession(request, env);
      if (result.response) return result.response;
      const monthStart = `${statisticsMonthMatch[1]}-01`;
      const validMonth = await env.D8.prepare("SELECT date(?) = ? AS valid")
        .bind(monthStart, monthStart)
        .first();
      if (!validMonth?.valid) return json({ error: "Ogiltig referensmånad." }, 400);
      const summary = await env.D8.prepare(`
        SELECT id, month_start, revision, current_import_id, previous_import_id, published_at
        FROM monthly_summary
        WHERE month_start = ? AND status = 'published'
        ORDER BY revision DESC
        LIMIT 1
      `).bind(monthStart).first();
      if (!summary) return json({ error: "Det finns ingen publicerad lista för månaden." }, 404);
      const resultSet = await env.D8.prepare(`
        SELECT company_name_at_publication AS company_name,
               previous_category, current_category, employee_count_at_publication
        FROM monthly_summary_entry
        WHERE summary_id = ?
        ORDER BY company_name_at_publication COLLATE NOCASE, company_id
      `).bind(summary.id).all();
      return json({ summary: { ...summary, entries: resultSet.results } });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/statistics/publish") {
      const result = await requireAdmin(request, env);
      if (result.response) return result.response;
      const comparison = await env.D8.prepare(compatibleComparisonQuery)
        .bind(SCB_BASELINE_VERSION)
        .first();
      if (!comparison) {
        return json({
          error: "Det finns ännu inga färdiga baslinjer för två på varandra följande månader med samma SCB-urval."
        }, 409);
      }

      const existing = await env.D8.prepare(`
        SELECT id, month_start, revision, published_at
        FROM monthly_summary
        WHERE status = 'published'
          AND current_import_id = ? AND previous_import_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `).bind(comparison.current_import_id, comparison.previous_import_id).first();
      if (existing) {
        const count = await env.D8.prepare(`
          SELECT COUNT(*) AS company_count FROM monthly_summary_entry WHERE summary_id = ?
        `).bind(existing.id).first();
        return json({
          alreadyPublished: true,
          summary: { ...existing, companyCount: count.company_count },
          previousMonth: comparison.previous_month
        });
      }

      const statements = [
        env.D8.prepare(`
          INSERT INTO monthly_summary (
            month_start, revision, current_import_id, previous_import_id,
            status, generated_at, created_by
          )
          SELECT
            ?, (SELECT COALESCE(MAX(revision), 0) + 1 FROM monthly_summary WHERE month_start = ?),
            ?, ?, 'draft', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?
          WHERE NOT EXISTS (
            SELECT 1 FROM monthly_summary
            WHERE status = 'published' AND current_import_id = ? AND previous_import_id = ?
          )
        `).bind(
          comparison.current_month,
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id,
          result.session.id,
          comparison.current_import_id,
          comparison.previous_import_id
        ),
        env.D8.prepare(`
          INSERT INTO monthly_summary_entry (
            summary_id, company_id, current_snapshot_id, previous_snapshot_id,
            company_name_at_publication, previous_category, current_category,
            employee_count_at_publication
          )
          SELECT
            (SELECT id FROM monthly_summary
             WHERE month_start = ? AND current_import_id = ? AND previous_import_id = ?
               AND status = 'draft'
             ORDER BY revision DESC LIMIT 1),
            current.company_id, current.id, previous.id, current.company_name,
            previous.employee_category, current.employee_category,
            CASE WHEN current.employee_count BETWEEN 50 AND 99 THEN current.employee_count ELSE NULL END
          FROM company_month_snapshot current
          JOIN company_month_snapshot previous ON previous.company_id = current.company_id
          WHERE current.import_batch_id = ?
            AND previous.import_batch_id = ?
            AND current.employee_category = '50_99'
            AND previous.employee_category IN ('20_49', '100_199')
            AND EXISTS (
              SELECT 1 FROM monthly_summary
              WHERE month_start = ? AND current_import_id = ? AND previous_import_id = ?
                AND status = 'draft'
            )
        `).bind(
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id,
          comparison.current_import_id,
          comparison.previous_import_id,
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id
        ),
        env.D8.prepare(`
          UPDATE monthly_summary
          SET status = 'published', published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE month_start = ? AND current_import_id = ? AND previous_import_id = ?
            AND status = 'draft'
            AND revision = (
              SELECT MAX(revision) FROM monthly_summary
              WHERE month_start = ? AND current_import_id = ? AND previous_import_id = ?
            )
        `).bind(
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id,
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id
        ),
        env.D8.prepare(`
          INSERT INTO audit_event (actor_id, action, entity_id, details_json)
          SELECT ?, 'summary_published', id,
                 json_object('month', month_start, 'revision', revision,
                             'currentImportId', current_import_id,
                             'previousImportId', previous_import_id)
          FROM monthly_summary
          WHERE month_start = ? AND current_import_id = ? AND previous_import_id = ?
            AND status = 'published'
            AND NOT EXISTS (
              SELECT 1 FROM audit_event
              WHERE action = 'summary_published' AND entity_id = monthly_summary.id
            )
            AND revision = (
              SELECT MAX(revision) FROM monthly_summary
              WHERE month_start = ? AND current_import_id = ? AND previous_import_id = ?
            )
        `).bind(
          result.session.id,
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id,
          comparison.current_month,
          comparison.current_import_id,
          comparison.previous_import_id
        )
      ];
      const publicationResults = await env.D8.batch(statements);

      const published = await env.D8.prepare(`
        SELECT id, month_start, revision, published_at
        FROM monthly_summary
        WHERE status = 'published'
          AND current_import_id = ? AND previous_import_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `).bind(comparison.current_import_id, comparison.previous_import_id).first();
      if (!published) {
        return json({ error: "Månadslistan kunde inte publiceras." }, 500);
      }
      const count = await env.D8.prepare(`
        SELECT COUNT(*) AS company_count FROM monthly_summary_entry WHERE summary_id = ?
      `).bind(published.id).first();
      const alreadyPublished = publicationResults[0].meta.changes === 0;
      return json({
        alreadyPublished,
        summary: { ...published, companyCount: count.company_count },
        previousMonth: comparison.previous_month
      }, alreadyPublished ? 200 : 201);
    }

    if (request.method === "POST" && url.pathname === "/api/admin/scb/check") {
      const result = await requireAdmin(request, env);
      if (result.response) return result.response;

      let apiKey;
      try {
        apiKey = await env.SCB_API_KEY.get();
      } catch {
        return json({ error: "SCB-nyckeln är inte tillgänglig för Workern." }, 503);
      }
      if (!apiKey) return json({ error: "SCB-nyckeln saknas i Secrets Store." }, 503);

      let response;
      try {
        response = await fetch("https://apiafr.scb.se/v1/api-info", {
          headers: { "X-API-Key": apiKey }
        });
      } catch {
        return json({ error: "Kunde inte nå SCB:s API." }, 502);
      }
      if (!response.ok) {
        const message = response.status === 401
          ? "SCB avvisade API-nyckeln."
          : response.status === 429
            ? "SCB begränsade anropet. Försök igen senare."
            : "SCB:s API svarade med ett fel.";
        return json({ error: message }, 502);
      }

      const data = await response.json();
      return json({
        connected: true,
        apiName: data.apiNamn || "SCB:s allmänna företagsregister API",
        latestUpdate: data.senasteUppdateringsDatum || null
      });
    }

    if (request.method === "POST" && url.pathname === "/api/admin/scb/import") {
      const result = await requireAdmin(request, env);
      if (result.response) return result.response;

      try {
        await env.D8.prepare("SELECT 1 FROM scb_import_progress LIMIT 1").first();
      } catch {
        return json({ error: "Kör SCB-importmigrering 0003 på D1 innan baslinjen startas." }, 500);
      }
      const snapshotSchema = await env.D8.prepare(`
        SELECT sql FROM sqlite_master
        WHERE type = 'table' AND name = 'company_month_snapshot'
      `).first();
      if (!snapshotSchema?.sql?.includes("'20_49'")) {
        return json({ error: "Kör SCB-importmigrering 0004 på D1 innan baslinjen startas." }, 500);
      }

      const referenceMonth = `${new Date().toISOString().slice(0, 7)}-01`;
      let batch = await env.D8.prepare(`
        SELECT id, reference_month, status, record_count, source_version
        FROM scb_import_batch
        WHERE reference_month = ? AND status = 'staging'
        ORDER BY id DESC LIMIT 1
      `).bind(referenceMonth).first();

      if (batch && batch.source_version !== SCB_BASELINE_VERSION) {
        await env.D8.prepare(`
          UPDATE scb_import_batch
          SET status = 'failed', error_message = 'Baslinjeurvalet ändrades till SCB-klasserna 5–7.'
          WHERE id = ? AND status = 'staging'
        `).bind(batch.id).run();
        batch = null;
      }

      if (!batch) {
        batch = await env.D8.prepare(`
          SELECT id, reference_month, status, record_count
          FROM scb_import_batch
          WHERE reference_month = ? AND status = 'ready' AND source_version = ?
          ORDER BY id DESC LIMIT 1
        `).bind(referenceMonth, SCB_BASELINE_VERSION).first();
        if (batch) {
          return json({ status: "ready", referenceMonth, recordCount: batch.record_count, alreadyImported: true });
        }

        const inserted = await env.D8.prepare(`
          INSERT INTO scb_import_batch (reference_month, status, source_version, created_by)
          VALUES (?, 'staging', ?, ?)
        `).bind(referenceMonth, SCB_BASELINE_VERSION, result.session.id).run();
        batch = { id: inserted.meta.last_row_id, reference_month: referenceMonth, status: "staging" };
        await env.D8.prepare(`
          INSERT INTO scb_import_progress (import_batch_id, employee_class)
          VALUES (?, 5)
        `).bind(batch.id).run();
      }

      const progress = await env.D8.prepare(`
        SELECT employee_class, cursor_id, page_count, stored_count, skipped_count
        FROM scb_import_progress
        WHERE import_batch_id = ?
      `).bind(batch.id).first();
      if (!progress) return json({ error: "SCB-importmigreringen saknas i databasen." }, 500);

      const lease = await env.D8.prepare(`
        UPDATE scb_import_progress
        SET lease_until = datetime('now', '+2 minutes')
        WHERE import_batch_id = ?
          AND (lease_until IS NULL OR datetime(lease_until) <= datetime('now'))
      `).bind(batch.id).run();
      if (!lease.meta.changes) return json({ error: "En SCB-import körs redan." }, 409);

      const releaseLease = () => env.D8.prepare(`
        UPDATE scb_import_progress SET lease_until = NULL WHERE import_batch_id = ?
      `).bind(batch.id).run();

      let apiKey;
      try {
        apiKey = await env.SCB_API_KEY.get();
      } catch {
        await releaseLease();
        return json({ error: "SCB-nyckeln är inte tillgänglig för Workern." }, 500);
      }
      if (!apiKey) {
        await releaseLease();
        return json({ error: "SCB-nyckeln saknas i Secrets Store." }, 500);
      }

      const scbUrl = new URL(`https://apiafr.scb.se/v1/juridiskaenheter/anstalldaklass/${progress.employee_class}`);
      scbUrl.searchParams.set("limit", "100");
      if (progress.cursor_id !== null) scbUrl.searchParams.set("cursorId", String(progress.cursor_id));

      let scbResponse;
      try {
        scbResponse = await fetch(scbUrl, { headers: { "X-API-Key": apiKey } });
      } catch {
        await releaseLease();
        return json({ error: "Kunde inte nå SCB. Importen kan återupptas." }, 503, { "retry-after": "2" });
      }
      if (!scbResponse.ok) {
        await releaseLease();
        if (scbResponse.status === 429) {
          return json(
            { error: "SCB begränsade anropet. Importen kan återupptas." },
            429,
            { "retry-after": scbResponse.headers.get("retry-after") || "2" }
          );
        }
        if (scbResponse.status >= 500) {
          return json(
            { error: "SCB är tillfälligt otillgängligt. Importen kan återupptas." },
            503,
            { "retry-after": scbResponse.headers.get("retry-after") || "2" }
          );
        }
        let problemText = "";
        try {
          const problem = await scbResponse.json();
          problemText = [problem?.title, problem?.detail]
            .filter(value => typeof value === "string" && value.trim())
            .join(": ")
            .slice(0, 400);
        } catch {
          problemText = "";
        }
        const failure = `SCB svarade med HTTP ${scbResponse.status}${problemText ? `: ${problemText}` : "."}`;
        if (scbResponse.status < 500) {
          await env.D8.prepare(`
            UPDATE scb_import_batch SET status = 'failed', error_message = ? WHERE id = ?
          `).bind(failure, batch.id).run();
        }
        return json({ error: failure }, 502);
      }

      let scbData;
      try {
        scbData = await scbResponse.json();
      } catch {
        await releaseLease();
        await env.D8.prepare(`
          UPDATE scb_import_batch SET status = 'failed', error_message = 'Ogiltigt JSON-svar från SCB.' WHERE id = ?
        `).bind(batch.id).run();
        return json({ error: "SCB:s svar kunde inte läsas. Importbatchen har markerats som misslyckad." }, 502);
      }

      const page = scbData?.jes;
      const pagination = scbData?.pagination;
      const hasMore = pagination?.hasMore;
      const nextCursorId = pagination?.nextCursorId;
      if (!Array.isArray(page) || page.length > 100 || typeof hasMore !== "boolean" ||
          (hasMore && (!Number.isInteger(nextCursorId) || nextCursorId === progress.cursor_id))) {
        await releaseLease();
        await env.D8.prepare(`
          UPDATE scb_import_batch SET status = 'failed', error_message = 'Ogiltigt sid- eller pagineringssvar från SCB.' WHERE id = ?
        `).bind(batch.id).run();
        return json({ error: "SCB:s sid- eller pagineringssvar var ogiltigt. Importbatchen har markerats som misslyckad." }, 502);
      }

      const category = employeeCategory(progress.employee_class);
      const statements = [];
      let skipped = 0;
      for (const record of page) {
        const recordClass = typeof record?.anstKl === "string" ? record.anstKl : String(record?.anstKl ?? "");
        if (!/^\d+$/.test(recordClass) || Number(recordClass) !== progress.employee_class) {
          await releaseLease();
          await env.D8.prepare(`
            UPDATE scb_import_batch SET status = 'failed', error_message = 'Ov e4ntad anst e4lldaklass i SCB-svaret.' WHERE id = ?
          `).bind(batch.id).run();
          return json({ error: "SCB returnerade en oväntad anställdaklass. Importbatchen har markerats som misslyckad." }, 502);
        }
        const organizationNumber = normalizeScbOrgNumber(record.orgNr);
        const companyName = typeof record.namn === "string" ? record.namn.trim() : "";
        if (!organizationNumber || !companyName) {
          skipped += 1;
          continue;
        }
        statements.push(env.D8.prepare(`
          INSERT INTO company (organization_number) VALUES (?)
          ON CONFLICT (organization_number) DO NOTHING
        `).bind(organizationNumber));
        statements.push(env.D8.prepare(`
          INSERT INTO company_month_snapshot (
            import_batch_id, company_id, company_name, employee_category, employee_count, source_record_id
          )
          SELECT ?, id, ?, ?, NULL, NULL
          FROM company WHERE organization_number = ?
          ON CONFLICT (import_batch_id, company_id) DO UPDATE SET
            company_name = excluded.company_name,
            employee_category = excluded.employee_category,
            employee_count = NULL
        `).bind(batch.id, companyName, category, organizationNumber));
      }

      const nextClass = hasMore ? progress.employee_class : progress.employee_class + 1;
      const completed = !hasMore && progress.employee_class === 7;
      statements.push(env.D8.prepare(`
        UPDATE scb_import_progress
        SET employee_class = ?, cursor_id = ?, page_count = page_count + 1,
            stored_count = (SELECT COUNT(*) FROM company_month_snapshot WHERE import_batch_id = ?),
            skipped_count = skipped_count + ?, lease_until = NULL,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE import_batch_id = ?
      `).bind(nextClass, hasMore ? nextCursorId : null, batch.id, skipped, batch.id));
      statements.push(env.D8.prepare(`
        UPDATE scb_import_batch
        SET status = ?,
            record_count = (SELECT COUNT(*) FROM company_month_snapshot WHERE import_batch_id = ?),
            completed_at = CASE WHEN ? = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NULL END,
            error_message = NULL
        WHERE id = ?
      `).bind(completed ? "ready" : "staging", batch.id, completed ? 1 : 0, batch.id));
      if (completed) {
        const audit = mutationAudit("scb_imported", result.session.id, batch.id, {
          referenceMonth,
          sourceVersion: SCB_BASELINE_VERSION
        });
        statements.push(env.D8.prepare(audit[0]).bind(...audit[1]));
      }

      try {
        await env.D8.batch(statements);
      } catch {
        await releaseLease();
        return json({ error: "Kunde inte spara SCB-sidan. Importen kan återupptas." }, 503);
      }

      const updated = await env.D8.prepare(`
        SELECT b.status, b.reference_month, b.record_count, p.employee_class, p.page_count, p.stored_count, p.skipped_count
        FROM scb_import_batch b
        JOIN scb_import_progress p ON p.import_batch_id = b.id
        WHERE b.id = ?
      `).bind(batch.id).first();
      return json({
        status: updated.status,
        referenceMonth: updated.reference_month,
        recordCount: updated.record_count || 0,
        employeeClass: updated.employee_class,
        pageCount: updated.page_count,
        skippedCount: updated.skipped_count,
        completed
      });
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

    return env.ASSETS.fetch(request);
  }
};
