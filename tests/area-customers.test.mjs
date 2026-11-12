import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../index.js";
import { MUNICIPALITIES } from "../municipalities.js";
import { MUNICIPALITY_ORGANISATIONS } from "../municipality-organisations.js";

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(new URL("../database/schema.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../database/migrations/0006_municipality_customers.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../database/migrations/0007_region_customers_and_customer_import.sql", import.meta.url), "utf8"));
  db.exec(`
    INSERT INTO app_user (id, email, role) VALUES
      (1, 'admin@example.test', 'admin'),
      (2, 'viewer@example.test', 'viewer');
  `);
  for (const [userId, token] of [[1, "admin-token"], [2, "viewer-token"]]) {
    const hash = createHash("sha256").update(token).digest("base64url");
    db.prepare("INSERT INTO auth_session (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
      .run(token, userId, hash, "2999-01-01T00:00:00.000Z");
  }
  const binding = {
    prepare(sql) {
      return {
        bind(...parameters) {
          return {
            async first() { return db.prepare(sql).get(...parameters) || null; },
            async all() { return { results: db.prepare(sql).all(...parameters) }; },
            async run() { return { meta: { changes: Number(db.prepare(sql).run(...parameters).changes) } }; }
          };
        },
        async all() { return { results: db.prepare(sql).all() }; },
        async first() { return db.prepare(sql).get() || null; }
      };
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  };
  return { db, env: { D8: binding } };
}

async function request(env, path, token, body) {
  return worker.fetch(new Request(`https://example.test${path}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      ...(token ? { cookie: `bolagsinfo_session=${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}

test("employee information assets require an active session", async () => {
  const { db, env } = createDatabase();
  env.ASSETS = {
    async fetch(request) {
      return new Response(new URL(request.url).pathname);
    }
  };
  try {
    for (const path of ["/anstalld.html", "/anstalld.js", "/helgdagar.mjs"]) {
      const anonymousResponse = await request(env, path);
      assert.equal(anonymousResponse.status, 302);
      assert.equal(anonymousResponse.headers.get("location"), "/");

      const signedInResponse = await request(env, path, "viewer-token");
      assert.equal(signedInResponse.status, 200);
      assert.equal(await signedInResponse.text(), path);
    }
  } finally {
    db.close();
  }
});

test("region and municipality APIs enforce access and keep assignments separate", async () => {
  const { db, env } = createDatabase();
  try {
    assert.equal((await request(env, "/api/region-customers")).status, 401);
    assert.equal((await request(env, "/api/admin/regions/23/products", "viewer-token", { products: [] })).status, 403);
    const municipalities = await (await request(env, "/api/municipality-customers", "viewer-token")).json();
    const regionResponse = await request(env, "/api/region-customers", "viewer-token");
    assert.equal(regionResponse.status, 200);
    const regions = await regionResponse.json();
    assert.equal(municipalities.municipalities.length, 290);
    assert.equal(regions.regions.length, 21);
    assert.deepEqual(regions.regions.find(region => region.code === "23").products, ["visselblasarkanal"]);
    assert.deepEqual(municipalities.municipalities.find(area => area.code === "0305").products, ["visselblasarkanal"]);
    assert.equal((await request(env, "/api/admin/regions/99/products", "admin-token", { products: [] })).status, 404);
    assert.equal((await request(env, "/api/admin/regions/23/products", "admin-token", { products: ["unknown"] })).status, 400);
    assert.equal((await request(env, "/api/admin/regions/23/products", "admin-token", { products: ["redact", "redact"] })).status, 400);
    assert.equal((await request(env, "/api/admin/regions/23/products", "admin-token", { products: ["redact"] })).status, 200);
    const updatedRegions = await (await request(env, "/api/region-customers", "viewer-token")).json();
    assert.deepEqual(updatedRegions.regions.find(region => region.code === "23").products, ["redact"]);
    assert.deepEqual(
      await (await request(env, "/api/municipality-customers", "viewer-token")).json(),
      municipalities
    );
    assert.equal(db.prepare("SELECT count(*) AS count FROM region_customer_change WHERE region_code = '23' AND actor_id = 1").get().count, 1);
  } finally {
    db.close();
  }
});

test("customer import merges without restoring subsequently removed assignments", () => {
  const { db } = createDatabase();
  try {
    assert.equal(db.prepare("SELECT count(*) AS count FROM region_customer_product").get().count, 4);
    assert.equal(db.prepare("SELECT count(*) AS count FROM municipality_customer_product WHERE municipality_code = '1962' AND product_id = 'redact'").get().count, 1);
    db.exec("DELETE FROM municipality_customer_product WHERE municipality_code = '0305'");
    db.exec("DELETE FROM region_customer_product WHERE region_code = '23'");
    db.exec(readFileSync(new URL("../database/migrations/0007_region_customers_and_customer_import.sql", import.meta.url), "utf8"));
    assert.equal(db.prepare("SELECT count(*) AS count FROM municipality_customer_product WHERE municipality_code = '0305'").get().count, 0);
    assert.equal(db.prepare("SELECT count(*) AS count FROM region_customer_product WHERE region_code = '23'").get().count, 0);
  } finally {
    db.close();
  }
});

test("Sellfinity sync matches only known municipality organisations and preserves the last successful snapshot on failure", async () => {
  const { db, env } = createDatabase();
  const originalFetch = globalThis.fetch;
  const contacts = [
    { id: 1, orgnr: "212000-2742", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "customer" }] },
    { id: 2, orgnr: "212000-1462", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "ex_customer" }] },
    { id: 3, orgnr: "212000-0191", is_company: true, removed: false, fields: [{ field_id: 999, relationship: "customer" }] },
    { id: 4, orgnr: "212000-2890", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "customer" }] },
    { id: 5, orgnr: "212000-2890", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "customer" }] },
    { id: 6, orgnr: "212000-2270", is_company: true, removed: true, fields: [{ field_id: 301, relationship: "customer" }] },
    { id: 7, orgnr: "212000-0043", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "in_progress" }] },
    { id: 8, orgnr: "212000-0811", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "unknown" }] },
    { id: 9, orgnr: "212000-0282", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "customer" }, { field_id: 301, relationship: "none" }] },
    { id: 10, orgnr: "212000-0704", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "none" }] },
    { id: 11, orgnr: "212000-2734", is_company: true, removed: false, fields: [{ field_id: 301, relationship: "contacted" }] }
  ];
  try {
    env.SELLFINITY_API_TOKEN = "test-token";
    const offsets = [];
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.authorization, "Bearer test-token");
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      return Response.json({ contacts: contacts.slice(offset, offset + 4) });
    };
    await worker.scheduled({}, env);
    assert.deepEqual(offsets, [0, 4, 8, 11]);
    const data = await (await request(env, "/api/municipality-customers", "viewer-token")).json();
    const status = name => data.municipalities.find(municipality => municipality.name === name).sellfinityStatus;
    assert.equal(status("Luleå"), "customer");
    assert.equal(status("Tranemo"), "ex_customer");
    assert.equal(status("Lidingö"), "uncertain");
    assert.equal(status("Österåker"), "uncertain");
    assert.equal(status("Ludvika"), "unmatched");
    assert.equal(status("Järfälla"), "not_customer");
    assert.equal(status("Olofström"), "uncertain");
    assert.equal(status("Enköping"), "uncertain");
    assert.equal(status("Mörbylånga"), "not_customer");
    assert.equal(status("Älvsbyn"), "not_customer");
    assert.equal(status("Stockholm"), "unmatched");
    assert.ok(data.sellfinitySync.last_success_at);
    assert.equal(data.sellfinitySync.last_error, null);

    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(worker.scheduled({}, env), /HTTP 503/);
    const afterFailure = await (await request(env, "/api/municipality-customers", "viewer-token")).json();
    assert.equal(afterFailure.municipalities.find(area => area.name === "Luleå").sellfinityStatus, "customer");
    assert.equal(afterFailure.sellfinitySync.last_success_at, data.sellfinitySync.last_success_at);
    assert.match(afterFailure.sellfinitySync.last_error, /503/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("former customer migration preserves known statuses and invalidates ambiguous old non-customer statuses", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../database/migrations/0008_sellfinity_municipality_status.sql", import.meta.url), "utf8"));
    db.exec(`
      INSERT INTO sellfinity_municipality_status (municipality_code, status) VALUES
        ('0117', 'customer'), ('0181', 'not_customer'), ('0881', 'unmatched');
    `);
    db.exec(readFileSync(new URL("../database/migrations/0009_sellfinity_former_customers.sql", import.meta.url), "utf8"));
    assert.deepEqual(
      db.prepare("SELECT municipality_code, status FROM sellfinity_municipality_status ORDER BY municipality_code").all()
        .map(row => ({ ...row })),
      [
        { municipality_code: "0117", status: "customer" },
        { municipality_code: "0181", status: "uncertain" },
        { municipality_code: "0881", status: "unmatched" }
      ]
    );
    db.prepare("INSERT INTO sellfinity_municipality_status (municipality_code, status) VALUES (?, ?)")
      .run("1485", "ex_customer");
  } finally {
    db.close();
  }
});

test("Sellfinity reports unavailable until a sync succeeds and rejects repeated pages", async () => {
  const { db, env } = createDatabase();
  const originalFetch = globalThis.fetch;
  try {
    const before = await (await request(env, "/api/municipality-customers", "viewer-token")).json();
    assert.equal(before.municipalities.find(area => area.name === "Luleå").sellfinityStatus, "unavailable");
    await assert.rejects(worker.scheduled({}, env), /token/);
    env.SELLFINITY_API_TOKEN = "test-token";
    globalThis.fetch = async () => Response.json({
      contacts: [{ id: 1, orgnr: "2120002742", is_company: true, removed: false, fields: [] }]
    });
    await assert.rejects(worker.scheduled({}, env), /upprepade ID/);
    const after = await (await request(env, "/api/municipality-customers", "viewer-token")).json();
    assert.equal(after.municipalities.find(area => area.name === "Luleå").sellfinityStatus, "unavailable");
    assert.match(after.sellfinitySync.last_error, /upprepade ID/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("initial organisation mappings reference distinct municipalities and organisation numbers", () => {
  const names = new Set(MUNICIPALITIES.map(municipality => municipality.name));
  const mappings = Object.entries(MUNICIPALITY_ORGANISATIONS);
  assert.ok(mappings.every(([name, number]) => names.has(name) && /^\d{10}$/.test(number)));
  assert.equal(new Set(mappings.map(([, number]) => number)).size, mappings.length);
});
