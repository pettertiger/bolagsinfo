export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/contracts" && request.method === "GET") {
      try {
        const result = await env.D8
          .prepare(`
            SELECT id, company_name, due_date, note
            FROM contract
            WHERE deleted_at IS NULL
            ORDER BY due_date ASC, company_name ASC
          `)
          .all();

        return Response.json(result.results);
      } catch (error) {
        return Response.json(
          { error: "Kunde inte läsa avtalen från databasen." },
          { status: 500 }
        );
      }
    }

    return new Response("Bolagsinfo Worker fungerar", {
      headers: {
        "content-type": "text/plain; charset=UTF-8"
      }
    });
  }
};