interface Env {
  DB: D1Database;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const username = url.searchParams.get("username");
  const seasonId = Number(url.searchParams.get("seasonId") ?? 5);

  if (!username) {
    return Response.json(
      { error: "username query parameter is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const results = await db
      .prepare(
        `SELECT s.fetched_at AS time, e.rating, e.position
         FROM entries e
         JOIN snapshots s ON s.id = e.snapshot_id
         WHERE e.username LIKE ? AND s.season_id = ?
         ORDER BY s.fetched_at ASC`
      )
      .bind(username, seasonId)
      .all<{ time: string; rating: number; position: number }>();

    return Response.json(
      { history: results.results },
      { headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
};
