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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const username = url.searchParams.get("username");
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

  if (!username) {
    return Response.json(
      { error: "username query parameter is required" },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // Get season time bounds (first and latest ready snapshot)
    const bounds = await db
      .prepare(
        `SELECT MIN(fetched_at) AS start, MAX(fetched_at) AS end
         FROM snapshots
         WHERE season_id = ? AND status = 'ready'`
      )
      .bind(seasonId)
      .first<{ start: string | null; end: string | null }>();

    // Resolve username -> account_id via player_latest
    let player:
      | {
          account_id: string;
          estimated_games?: number;
          longest_win_streak?: number;
        }
      | null = null;
    try {
      player = await db
        .prepare(
          `SELECT account_id, estimated_games, longest_win_streak
           FROM player_latest
           WHERE season_id = ? AND username = ?`
        )
        .bind(seasonId, username)
        .first<{
          account_id: string;
          estimated_games: number;
          longest_win_streak: number;
        }>();
    } catch (err) {
      if (!isMissingProgressColumnError(err)) {
        throw err;
      }

      player = await db
        .prepare(
          `SELECT account_id
           FROM player_latest
           WHERE season_id = ? AND username = ?`
        )
        .bind(seasonId, username)
        .first<{ account_id: string }>();
    }

    // Try player_history first if we have an account_id
    let historyResults: { time: string; rating: number; position: number }[] = [];
    if (player) {
      const results = await db
        .prepare(
          `SELECT s.fetched_at AS time, h.rating, h.position
           FROM player_history h
           JOIN snapshots s ON s.id = h.snapshot_id
           WHERE h.account_id = ? AND h.season_id = ?
           ORDER BY h.snapshot_id ASC`
        )
        .bind(player.account_id, seasonId)
        .all<{ time: string; rating: number; position: number }>();
      historyResults = results.results;
    }

    // Fall back to entries table if player_history has insufficient data
    // (old seasons don't have player_latest/player_history data)
    if (historyResults.length <= 2) {
      const fallback = await db
        .prepare(
          `SELECT s.fetched_at AS time, e.rating, e.position
           FROM entries e
           JOIN snapshots s ON s.id = e.snapshot_id
           WHERE e.username = ? AND s.season_id = ?
           ORDER BY s.fetched_at ASC`
        )
        .bind(username, seasonId)
        .all<{ time: string; rating: number; position: number }>();

      if (fallback.results.length > historyResults.length) {
        historyResults = fallback.results;
      }
    }

    const fallbackProgress = computePlayerProgressFromHistory(historyResults);
    const estimatedGames =
      player?.estimated_games ?? fallbackProgress.estimatedGames;
    const longestWinStreak =
      player?.longest_win_streak ?? fallbackProgress.longestWinStreak;

    return Response.json(
      { history: historyResults, seasonStart: bounds?.start ?? null, seasonEnd: bounds?.end ?? null, estimatedGames, longestWinStreak },
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
