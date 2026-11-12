import assert from "node:assert/strict";
import test from "node:test";
import { loadPublishedSections } from "../public/intranet-content.js";

test("published section loading explains non-JSON server responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("<html>Server error</html>", {
      status: 500,
      headers: { "content-type": "text/html" }
    });
    await assert.rejects(loadPublishedSections(), error => {
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /text\/html/);
      assert.match(error.message, /migration 0012/);
      return true;
    });

    globalThis.fetch = async () => new Response("<html>Not JSON</html>", {
      headers: { "content-type": "text/html" }
    });
    await assert.rejects(loadPublishedSections(), /ogiltigt svar.*HTTP 200.*text\/html/);

    globalThis.fetch = async () => Response.json({ error: "Databasen svarade inte." }, { status: 500 });
    await assert.rejects(loadPublishedSections(), /Databasen svarade inte\./);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
