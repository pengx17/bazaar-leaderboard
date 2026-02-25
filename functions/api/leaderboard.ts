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

    // Find a snapshot from ~24h ago to compute deltas
    const prevSnapshot = await db
      .prepare(
        `SELECT id FROM snapshots
         WHERE season_id = ?
           AND fetched_at <= datetime((SELECT fetched_at FROM snapshots WHERE id = ?), '-1 day')
         ORDER BY fetched_at DESC
         LIMIT 1`
      )
      .bind(seasonId, snapshot.id)
      .first<{ id: number }>();

    type EntryRow = {
      position: number;
      username: string;
      rating: number;
      prev_position: number | null;
      prev_rating: number | null;
    };

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

      if (prevSnapshot) {
        entries = await db
          .prepare(
            `SELECT e.position, e.username, e.rating,
                    p.position AS prev_position, p.rating AS prev_rating
             FROM entries e
             LEFT JOIN entries p ON p.snapshot_id = ? AND p.username = e.username
             WHERE e.snapshot_id = ? AND e.username LIKE ?
             ORDER BY e.position ASC
             LIMIT ? OFFSET ?`
          )
          .bind(prevSnapshot.id, snapshot.id, pattern, limit, offset)
          .all<EntryRow>();
      } else {
        entries = await db
          .prepare(
            `SELECT position, username, rating, NULL AS prev_position, NULL AS prev_rating
             FROM entries
             WHERE snapshot_id = ? AND username LIKE ?
             ORDER BY position ASC
             LIMIT ? OFFSET ?`
          )
          .bind(snapshot.id, pattern, limit, offset)
          .all<EntryRow>();
      }
    } else {
      total = snapshot.total_entries;

      if (prevSnapshot) {
        entries = await db
          .prepare(
            `SELECT e.position, e.username, e.rating,
                    p.position AS prev_position, p.rating AS prev_rating
             FROM entries e
             LEFT JOIN entries p ON p.snapshot_id = ? AND p.username = e.username
             WHERE e.snapshot_id = ?
             ORDER BY e.position ASC
             LIMIT ? OFFSET ?`
          )
          .bind(prevSnapshot.id, snapshot.id, limit, offset)
          .all<EntryRow>();
      } else {
        entries = await db
          .prepare(
            `SELECT position, username, rating, NULL AS prev_position, NULL AS prev_rating
             FROM entries
             WHERE snapshot_id = ?
             ORDER BY position ASC
             LIMIT ? OFFSET ?`
          )
          .bind(snapshot.id, limit, offset)
          .all<EntryRow>();
      }
    }

    const mapped = entries.results.map((e) => ({
      position: e.position,
      username: e.username,
      rating: e.rating,
      ratingChange:
        e.prev_rating != null ? e.rating - e.prev_rating : null,
      positionChange:
        e.prev_position != null ? e.prev_position - e.position : null,
    }));

    return Response.json(
      {
        seasonId,
        total,
        entries: mapped,
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
