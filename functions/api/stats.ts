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
    // Get the latest snapshot for this season
    const latestSnapshot = await db
      .prepare(
        `SELECT id, fetched_at, total_entries
         FROM snapshots
         WHERE season_id = ?
         ORDER BY fetched_at DESC
         LIMIT 1`
      )
      .bind(seasonId)
      .first<{ id: number; fetched_at: string; total_entries: number }>();

    if (!latestSnapshot) {
      return Response.json(
        { error: "No snapshots found for this season" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get top player (position = 1) from latest snapshot
    const topPlayer = await db
      .prepare(
        `SELECT username, rating
         FROM entries
         WHERE snapshot_id = ? AND position = 1`
      )
      .bind(latestSnapshot.id)
      .first<{ username: string; rating: number }>();

    // Get bottom player (max position) from latest snapshot
    const bottomPlayer = await db
      .prepare(
        `SELECT username, rating, position
         FROM entries
         WHERE snapshot_id = ?
         ORDER BY position DESC
         LIMIT 1`
      )
      .bind(latestSnapshot.id)
      .first<{ username: string; rating: number; position: number }>();

    // Daily change: compare top player's current rating vs ~24h ago
    // Find a snapshot from ~24h ago (skip single-player imports)
    const oldSnapshot = await db
      .prepare(
        `SELECT id FROM snapshots
         WHERE season_id = ?
           AND total_entries > 1
           AND fetched_at <= datetime(?, '-1 day')
         ORDER BY fetched_at DESC
         LIMIT 1`
      )
      .bind(seasonId, latestSnapshot.fetched_at)
      .first<{ id: number }>();

    let dailyTopChange: number | null = null;

    if (topPlayer && oldSnapshot) {
      const oldEntry = await db
        .prepare(
          `SELECT rating FROM entries
           WHERE snapshot_id = ? AND username = ?`
        )
        .bind(oldSnapshot.id, topPlayer.username)
        .first<{ rating: number }>();

      if (oldEntry) {
        dailyTopChange = topPlayer.rating - oldEntry.rating;
      }
    }

    // 24h movers: biggest rating gain, biggest rating drop, biggest rank climb
    type MoverRow = { username: string; rating: number; delta: number };
    let biggestGainer: MoverRow | null = null;
    let biggestLoser: MoverRow | null = null;
    let biggestClimber: { username: string; rating: number; positionDelta: number } | null = null;

    if (oldSnapshot) {
      const gainerResult = await db
        .prepare(
          `SELECT e.username, e.rating, (e.rating - p.rating) AS delta
           FROM entries e
           JOIN entries p ON p.snapshot_id = ? AND p.username = e.username
           WHERE e.snapshot_id = ?
           ORDER BY delta DESC
           LIMIT 1`
        )
        .bind(oldSnapshot.id, latestSnapshot.id)
        .first<MoverRow>();
      if (gainerResult && gainerResult.delta > 0) biggestGainer = gainerResult;

      const loserResult = await db
        .prepare(
          `SELECT e.username, e.rating, (e.rating - p.rating) AS delta
           FROM entries e
           JOIN entries p ON p.snapshot_id = ? AND p.username = e.username
           WHERE e.snapshot_id = ?
           ORDER BY delta ASC
           LIMIT 1`
        )
        .bind(oldSnapshot.id, latestSnapshot.id)
        .first<MoverRow>();
      if (loserResult && loserResult.delta < 0) biggestLoser = loserResult;

      const climberResult = await db
        .prepare(
          `SELECT e.username, e.rating, (p.position - e.position) AS positionDelta
           FROM entries e
           JOIN entries p ON p.snapshot_id = ? AND p.username = e.username
           WHERE e.snapshot_id = ?
           ORDER BY positionDelta DESC
           LIMIT 1`
        )
        .bind(oldSnapshot.id, latestSnapshot.id)
        .first<{ username: string; rating: number; positionDelta: number }>();
      if (climberResult && climberResult.positionDelta > 0) biggestClimber = climberResult;
    }

    // Get all seasons that have data
    const seasonRows = await db
      .prepare("SELECT DISTINCT season_id FROM snapshots ORDER BY season_id DESC")
      .all<{ season_id: number }>();
    const availableSeasons = seasonRows.results.map((r) => r.season_id);

    return Response.json(
      {
        seasonId,
        availableSeasons,
        topPlayer: topPlayer
          ? { username: topPlayer.username, rating: topPlayer.rating }
          : null,
        bottomPlayer: bottomPlayer
          ? { username: bottomPlayer.username, rating: bottomPlayer.rating }
          : null,
        totalEntries: latestSnapshot.total_entries,
        dailyTopChange,
        snapshotTime: latestSnapshot.fetched_at,
        biggestGainer: biggestGainer
          ? { username: biggestGainer.username, rating: biggestGainer.rating, delta: biggestGainer.delta }
          : null,
        biggestLoser: biggestLoser
          ? { username: biggestLoser.username, rating: biggestLoser.rating, delta: biggestLoser.delta }
          : null,
        biggestClimber: biggestClimber
          ? { username: biggestClimber.username, rating: biggestClimber.rating, positionDelta: biggestClimber.positionDelta }
          : null,
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
