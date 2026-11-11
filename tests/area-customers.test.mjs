import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../index.js";

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
