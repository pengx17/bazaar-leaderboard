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

  try {
    // Get latest snapshot metadata (try ready first, fall back to any)
    const latestSnapshot = await db
      .prepare(
        `SELECT id, fetched_at, total_entries FROM snapshots
         WHERE season_id = ? AND status = 'ready'
         ORDER BY fetched_at DESC LIMIT 1`
      )
      .bind(seasonId)
      .first<{ id: number; fetched_at: string; total_entries: number }>()
      ?? await db
        .prepare(
          `SELECT id, fetched_at, total_entries FROM snapshots
           WHERE season_id = ?
           ORDER BY fetched_at DESC LIMIT 1`
        )
        .bind(seasonId)
        .first<{ id: number; fetched_at: string; total_entries: number }>();

    if (!latestSnapshot) {
      return Response.json(
        { error: "No snapshots found for this season" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get season start time
    const firstSnapshot = await db
      .prepare(
        `SELECT fetched_at FROM snapshots
         WHERE season_id = ?
         ORDER BY fetched_at ASC LIMIT 1`
      )
      .bind(seasonId)
      .first<{ fetched_at: string }>();

    // Check if player_latest has data for this season
    const hasPlayerData = await db
      .prepare("SELECT 1 FROM player_latest WHERE season_id = ? LIMIT 1")
      .bind(seasonId)
      .first();

    let topPlayer: { username: string; rating: number } | null = null;
    let bottomPlayer: { username: string; rating: number } | null = null;
    let dailyTopChange: number | null = null;
    let biggestGainer: { username: string; rating: number; delta: number } | null = null;
    let biggestLoser: { username: string; rating: number; delta: number } | null = null;
    let biggestClimber: { username: string; rating: number; positionDelta: number } | null = null;
    let biggestFaller: { username: string; rating: number; positionDelta: number } | null = null;
    let newEntries: number | null = null;
    let activePlayers: number | null = null;
    let activeRatio: number | null = null;
    let medianRating: number | null = null;
    let mostActive: { username: string; games: number } | null = null;
    let longestWinStreak: { username: string; streak: number } | null = null;

    if (hasPlayerData) {
      // New path: query player_latest
      const top = await db
        .prepare(
          `SELECT username, rating, prev_rating_24h
           FROM player_latest
           WHERE season_id = ?
           ORDER BY position ASC LIMIT 1`
        )
        .bind(seasonId)
        .first<{ username: string; rating: number; prev_rating_24h: number | null }>();

      const bottom = await db
        .prepare(
          `SELECT username, rating
           FROM player_latest
           WHERE season_id = ?
           ORDER BY position DESC LIMIT 1`
        )
        .bind(seasonId)
        .first<{ username: string; rating: number }>();

      if (top) {
        topPlayer = { username: top.username, rating: top.rating };
        if (top.prev_rating_24h != null) {
          dailyTopChange = top.rating - top.prev_rating_24h;
        }
      }
      if (bottom) bottomPlayer = { username: bottom.username, rating: bottom.rating };

      type MoverRow = { username: string; rating: number; delta: number };
      const gainer = await db
        .prepare(
          `SELECT username, rating, (rating - prev_rating_24h) AS delta
           FROM player_latest
           WHERE season_id = ? AND prev_rating_24h IS NOT NULL
           ORDER BY delta DESC LIMIT 1`
        )
        .bind(seasonId)
        .first<MoverRow>();
      if (gainer && gainer.delta > 0) biggestGainer = gainer;

      const loser = await db
        .prepare(
          `SELECT username, rating, (rating - prev_rating_24h) AS delta
           FROM player_latest
           WHERE season_id = ? AND prev_rating_24h IS NOT NULL
           ORDER BY delta ASC LIMIT 1`
        )
        .bind(seasonId)
        .first<MoverRow>();
      if (loser && loser.delta < 0) biggestLoser = loser;

      const climber = await db
        .prepare(
          `SELECT username, rating, (prev_position_24h - position) AS positionDelta
           FROM player_latest
           WHERE season_id = ? AND prev_position_24h IS NOT NULL
           ORDER BY positionDelta DESC LIMIT 1`
        )
        .bind(seasonId)
        .first<{ username: string; rating: number; positionDelta: number }>();
      if (climber && climber.positionDelta > 0) biggestClimber = climber;

      // Biggest faller (opposite of climber — biggest position drop)
      const faller = await db
        .prepare(
          `SELECT username, rating, (prev_position_24h - position) AS positionDelta
           FROM player_latest
           WHERE season_id = ? AND prev_position_24h IS NOT NULL
           ORDER BY positionDelta ASC LIMIT 1`
        )
        .bind(seasonId)
        .first<{ username: string; rating: number; positionDelta: number }>();
      if (faller && faller.positionDelta < 0) biggestFaller = faller;

      // Check how many players have a baseline (prev_rating_24h set)
      // If nobody does, delta-based stats are meaningless
      const baselineCount = await db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM player_latest
           WHERE season_id = ? AND prev_rating_24h IS NOT NULL`
        )
        .bind(seasonId)
        .first<{ cnt: number }>();
      const hasBaseline = (baselineCount?.cnt ?? 0) > 0;

      if (hasBaseline) {
        // New entries (players without a baseline = new to leaderboard since last baseline)
        const newCount = await db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM player_latest
             WHERE season_id = ? AND prev_rating_24h IS NULL`
          )
          .bind(seasonId)
          .first<{ cnt: number }>();
        newEntries = newCount?.cnt ?? 0;

        // Active ratio (players with rating change since baseline)
        // Denominator = players who have a baseline, not total entries
        // (unchanged players never get prev_rating_24h set by sync)
        const trackedCount = baselineCount!.cnt;
        const activeCount = await db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM player_latest
             WHERE season_id = ? AND prev_rating_24h IS NOT NULL AND rating != prev_rating_24h`
          )
          .bind(seasonId)
          .first<{ cnt: number }>();
        if (trackedCount > 0 && activeCount) {
          activePlayers = activeCount.cnt;
          activeRatio = Math.round((activeCount.cnt / trackedCount) * 100);
        }
      }

      // Median rating
      const median = await db
        .prepare(
          `SELECT rating FROM player_latest
           WHERE season_id = ?
           ORDER BY rating ASC
           LIMIT 1 OFFSET (SELECT COUNT(*) / 2 FROM player_latest WHERE season_id = ?)`
        )
        .bind(seasonId, seasonId)
        .first<{ rating: number }>();
      if (median) medianRating = median.rating;

      // Most active player (most history entries = most games played)
      const active = await db
        .prepare(
          `SELECT p.username, COUNT(*) AS games
           FROM player_history h
           JOIN player_latest p ON p.season_id = h.season_id AND p.account_id = h.account_id
           WHERE h.season_id = ?
           GROUP BY h.account_id
           ORDER BY games DESC LIMIT 1`
        )
        .bind(seasonId)
        .first<{ username: string; games: number }>();
      if (active && active.games > 1) mostActive = active;

      // Longest win streak across all players
      // Scan top 20 most active players (most likely to have long streaks)
      const topActive = await db
        .prepare(
          `SELECT h.account_id, p.username
           FROM player_history h
           JOIN player_latest p ON p.season_id = h.season_id AND p.account_id = h.account_id
           WHERE h.season_id = ?
           GROUP BY h.account_id
           HAVING COUNT(*) > 2
           ORDER BY COUNT(*) DESC LIMIT 20`
        )
        .bind(seasonId)
        .all<{ account_id: string; username: string }>();

      for (const candidate of topActive.results) {
        const hist = await db
          .prepare(
            `SELECT h.rating FROM player_history h
             WHERE h.season_id = ? AND h.account_id = ?
             ORDER BY h.snapshot_id ASC`
          )
          .bind(seasonId, candidate.account_id)
          .all<{ rating: number }>();

        let streak = 0;
        let maxStreak = 0;
        const rows = hist.results;
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].rating > rows[i - 1].rating) {
            streak++;
            if (streak > maxStreak) maxStreak = streak;
          } else {
            streak = 0;
          }
        }
        if (maxStreak > (longestWinStreak?.streak ?? 0)) {
          longestWinStreak = { username: candidate.username, streak: maxStreak };
        }
      }
    } else {
      // Fallback: query entries table for old seasons
      const top = await db
        .prepare(
          `SELECT username, rating FROM entries
           WHERE snapshot_id = ? AND position = 1`
        )
        .bind(latestSnapshot.id)
        .first<{ username: string; rating: number }>();
      if (top) topPlayer = top;

      const bottom = await db
        .prepare(
          `SELECT username, rating FROM entries
           WHERE snapshot_id = ?
           ORDER BY position DESC LIMIT 1`
        )
        .bind(latestSnapshot.id)
        .first<{ username: string; rating: number }>();
      if (bottom) bottomPlayer = bottom;
    }

    // Available seasons
    const seasonRows = await db
      .prepare("SELECT DISTINCT season_id FROM snapshots ORDER BY season_id DESC")
      .all<{ season_id: number }>();
    const availableSeasons = seasonRows.results.map((r) => r.season_id);

    return Response.json(
      {
        seasonId,
        availableSeasons,
        topPlayer,
        bottomPlayer,
        totalEntries: latestSnapshot.total_entries,
        dailyTopChange,
        seasonStart: firstSnapshot?.fetched_at ?? null,
        snapshotTime: latestSnapshot.fetched_at,
        biggestGainer,
        biggestLoser,
        biggestClimber,
        biggestFaller,
        newEntries,
        activePlayers,
        activeRatio,
        medianRating,
        mostActive,
        longestWinStreak,
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
