interface Env {
  DB: D1Database;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300",
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const seasonIdParam = url.searchParams.get("seasonId");
    let seasonId: number;

    if (seasonIdParam) {
      seasonId = Number(seasonIdParam);
    } else {
      const latest = await db
        .prepare("SELECT MAX(season_id) as latest FROM snapshots")
        .first<{ latest: number | null }>();
      seasonId = latest?.latest ?? 1;
    }
  try {
    // For each snapshot in the season, get the rating at the boundary
    // positions (10th, 100th, 1000th). Returns the full season history.
    // Skip snapshots with very few entries (e.g. old single-player imports).
    const results = await db
      .prepare(
        `SELECT
           s.fetched_at AS time,
           (SELECT e.rating FROM entries e
            WHERE e.snapshot_id = s.id AND e.position <= 10
            ORDER BY e.position DESC LIMIT 1) AS top10,
           (SELECT e.rating FROM entries e
            WHERE e.snapshot_id = s.id AND e.position <= 100
            ORDER BY e.position DESC LIMIT 1) AS top100,
           (SELECT e.rating FROM entries e
            WHERE e.snapshot_id = s.id AND e.position <= 1000
            ORDER BY e.position DESC LIMIT 1) AS top1000
         FROM snapshots s
         WHERE s.season_id = ? AND s.total_entries > 1
         ORDER BY s.fetched_at ASC`
      )
      .bind(seasonId)
      .all<{
        time: string;
        top10: number | null;
        top100: number | null;
        top1000: number | null;
      }>();

    // Filter out snapshots where all values are null
    const history = results.results
      .filter((row) => row.top10 != null || row.top100 != null || row.top1000 != null)
      .map((row) => ({
        time: row.time,
        top10: row.top10 ?? null,
        top100: row.top100 ?? null,
        top1000: row.top1000 ?? null,
      }));

    return Response.json({ history }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
};
