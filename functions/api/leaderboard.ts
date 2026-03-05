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
      .prepare("SELECT MAX(season_id) as latest FROM snapshots WHERE status = 'ready'")
      .first<{ latest: number | null }>();
    seasonId = latest?.latest ?? 1;
  }

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const search = url.searchParams.get("search")?.trim() ?? "";

  try {
    // Check if player_latest has data for this season
    const hasPlayerData = await db
      .prepare("SELECT 1 FROM player_latest WHERE season_id = ? LIMIT 1")
      .bind(seasonId)
      .first();

    type MappedEntry = {
      position: number;
      username: string;
      rating: number;
      ratingChange: number | null;
      positionChange: number | null;
    };

    let total: number;
    let mapped: MappedEntry[];

    if (hasPlayerData) {
      // New path: query player_latest
      type Row = {
        position: number;
        username: string;
        rating: number;
        prev_position_24h: number | null;
        prev_rating_24h: number | null;
      };

      let entries;
      if (search) {
        const pattern = `%${search}%`;
        const countResult = await db
          .prepare(
            `SELECT COUNT(*) as cnt FROM player_latest
             WHERE season_id = ? AND username LIKE ?`
          )
          .bind(seasonId, pattern)
          .first<{ cnt: number }>();
        total = countResult?.cnt ?? 0;

        entries = await db
          .prepare(
            `SELECT position, username, rating, prev_position_24h, prev_rating_24h
             FROM player_latest
             WHERE season_id = ? AND username LIKE ?
             ORDER BY position ASC
             LIMIT ? OFFSET ?`
          )
          .bind(seasonId, pattern, limit, offset)
          .all<Row>();
      } else {
        const snapshot = await db
          .prepare(
            `SELECT total_entries FROM snapshots
             WHERE season_id = ? AND status = 'ready'
             ORDER BY fetched_at DESC LIMIT 1`
          )
          .bind(seasonId)
          .first<{ total_entries: number }>();
        total = snapshot?.total_entries ?? 0;

        entries = await db
          .prepare(
            `SELECT position, username, rating, prev_position_24h, prev_rating_24h
             FROM player_latest
             WHERE season_id = ?
             ORDER BY position ASC
             LIMIT ? OFFSET ?`
          )
          .bind(seasonId, limit, offset)
          .all<Row>();
      }

      mapped = entries.results.map((e) => ({
        position: e.position,
        username: e.username,
        rating: e.rating,
        ratingChange:
          e.prev_rating_24h != null ? e.rating - e.prev_rating_24h : null,
        positionChange:
          e.prev_position_24h != null ? e.prev_position_24h - e.position : null,
      }));
    } else {
      // Fallback: query entries table for old seasons without player_latest data
      const snapshot = await db
        .prepare(
          `SELECT id, total_entries FROM snapshots
           WHERE season_id = ?
           ORDER BY fetched_at DESC LIMIT 1`
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
      if (search) {
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
            `SELECT position, username, rating
             FROM entries WHERE snapshot_id = ? AND username LIKE ?
             ORDER BY position ASC LIMIT ? OFFSET ?`
          )
          .bind(snapshot.id, pattern, limit, offset)
          .all<{ position: number; username: string; rating: number }>();
      } else {
        total = snapshot.total_entries;
        entries = await db
          .prepare(
            `SELECT position, username, rating
             FROM entries WHERE snapshot_id = ?
             ORDER BY position ASC LIMIT ? OFFSET ?`
          )
          .bind(snapshot.id, limit, offset)
          .all<{ position: number; username: string; rating: number }>();
      }

      mapped = entries.results.map((e) => ({
        position: e.position,
        username: e.username,
        rating: e.rating,
        ratingChange: null,
        positionChange: null,
      }));
    }

    return Response.json(
      { seasonId, total, entries: mapped },
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
