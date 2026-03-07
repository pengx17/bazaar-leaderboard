import { computePlayerProgressFromHistory } from "../../shared/player-progress";

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

function isMissingProgressColumnError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /no such column: (estimated_games|longest_win_streak)/i.test(err.message)
  );
}

async function loadFallbackProgressMetrics(
  db: D1Database,
  seasonId: number
): Promise<{
  mostActive: { username: string; games: number } | null;
  longestWinStreak: { username: string; streak: number } | null;
}> {
  const results = await db
    .prepare(
      `SELECT h.account_id, p.username, p.position, h.rating
       FROM player_history h
       JOIN player_latest p ON p.season_id = h.season_id AND p.account_id = h.account_id
       WHERE h.season_id = ?
       ORDER BY h.account_id ASC, h.snapshot_id ASC`
    )
    .bind(seasonId)
    .all<{ account_id: string; username: string; position: number; rating: number }>();

  let mostActive:
    | { username: string; games: number; position: number }
    | null = null;
  let longestWinStreak:
    | { username: string; streak: number; position: number }
    | null = null;
  let currentAccountId: string | null = null;
  let currentUsername = "";
  let currentPosition = Number.MAX_SAFE_INTEGER;
  let currentHistory: Array<{ rating: number }> = [];

  const flushCurrentHistory = () => {
    if (!currentAccountId) return;

    const progress = computePlayerProgressFromHistory(currentHistory);
    if (
      progress.estimatedGames > (mostActive?.games ?? 0) ||
      (progress.estimatedGames === (mostActive?.games ?? -1) &&
        currentPosition < (mostActive?.position ?? Number.MAX_SAFE_INTEGER))
    ) {
      mostActive = {
        username: currentUsername,
        games: progress.estimatedGames,
        position: currentPosition,
      };
    }

    if (
      progress.longestWinStreak > (longestWinStreak?.streak ?? 0) ||
      (progress.longestWinStreak === (longestWinStreak?.streak ?? -1) &&
        currentPosition <
          (longestWinStreak?.position ?? Number.MAX_SAFE_INTEGER))
    ) {
      longestWinStreak = {
        username: currentUsername,
        streak: progress.longestWinStreak,
        position: currentPosition,
      };
    }
  };

  for (const row of results.results) {
    if (row.account_id !== currentAccountId) {
      flushCurrentHistory();
      currentAccountId = row.account_id;
      currentUsername = row.username;
      currentPosition = row.position;
      currentHistory = [{ rating: row.rating }];
      continue;
    }

    currentHistory.push({ rating: row.rating });
  }
  flushCurrentHistory();

  return {
    mostActive:
      mostActive && mostActive.games > 0
        ? { username: mostActive.username, games: mostActive.games }
        : null,
    longestWinStreak:
      longestWinStreak && longestWinStreak.streak > 1
        ? {
            username: longestWinStreak.username,
            streak: longestWinStreak.streak,
          }
        : null,
  };
}

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

      try {
        const active = await db
          .prepare(
            `SELECT username, estimated_games AS games
             FROM player_latest
             WHERE season_id = ?
             ORDER BY estimated_games DESC, position ASC
             LIMIT 1`
          )
          .bind(seasonId)
          .first<{ username: string; games: number }>();
        if (active && active.games > 0) mostActive = active;

        const streak = await db
          .prepare(
            `SELECT username, longest_win_streak AS streak
             FROM player_latest
             WHERE season_id = ?
             ORDER BY longest_win_streak DESC, position ASC
             LIMIT 1`
          )
          .bind(seasonId)
          .first<{ username: string; streak: number }>();
        if (streak && streak.streak > 1) longestWinStreak = streak;
      } catch (err) {
        if (!isMissingProgressColumnError(err)) {
          throw err;
        }

        const fallback = await loadFallbackProgressMetrics(db, seasonId);
        mostActive = fallback.mostActive;
        longestWinStreak = fallback.longestWinStreak;
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
