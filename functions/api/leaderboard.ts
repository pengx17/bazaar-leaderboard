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

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const search = url.searchParams.get("search")?.trim() ?? "";

  try {
    // Get the latest snapshot for this season
    const snapshot = await db
      .prepare(
        `SELECT id, total_entries FROM snapshots
         WHERE season_id = ?
         ORDER BY fetched_at DESC
         LIMIT 1`
      )
      .bind(seasonId)
      .first<{ id: number; total_entries: number }>();

    if (!snapshot) {
      return Response.json(
        { seasonId, total: 0, entries: [] },
        { headers: corsHeaders }
      );
    }

    let entries;
    let total: number;

    if (search) {
      // Search mode: filter by username (case-insensitive)
      const pattern = `%${search}%`;

      const countResult = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM entries
           WHERE snapshot_id = ? AND username LIKE ?`
        )
        .bind(snapshot.id, pattern)
        .first<{ cnt: number }>();
      total = countResult?.cnt ?? 0;

      entries = await db
        .prepare(
          `SELECT position, username, rating FROM entries
           WHERE snapshot_id = ? AND username LIKE ?
           ORDER BY position ASC
           LIMIT ? OFFSET ?`
        )
        .bind(snapshot.id, pattern, limit, offset)
        .all<{ position: number; username: string; rating: number }>();
    } else {
      total = snapshot.total_entries;

      entries = await db
        .prepare(
          `SELECT position, username, rating FROM entries
           WHERE snapshot_id = ?
           ORDER BY position ASC
           LIMIT ? OFFSET ?`
        )
        .bind(snapshot.id, limit, offset)
        .all<{ position: number; username: string; rating: number }>();
    }

    return Response.json(
      {
        seasonId,
        total,
        entries: entries.results,
      },
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
