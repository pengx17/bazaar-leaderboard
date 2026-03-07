// scripts/fetch-leaderboard.ts
// Fetches The Bazaar leaderboard data and stores it in Cloudflare D1.
// Run via: npx tsx scripts/fetch-leaderboard.ts

import {
  advancePlayerProgress,
  computePlayerProgressFromHistory,
} from "../shared/player-progress";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface D1Response<T = unknown> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: Array<{
    success: boolean;
    results: T[];
    meta: Record<string, unknown>;
  }>;
}

interface AuthTokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

interface LeaderboardEntry {
  AccountId: string;
  Username: string;
  Position: number;
  Rating: number;
}

interface LeaderboardResponse {
  seasonId: number;
  totalEntries: number;
  entries: LeaderboardEntry[];
}

interface D1Statement {
  sql: string;
  params?: unknown[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CF_API_TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");
const CF_ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const D1_DATABASE_ID = requireEnv("D1_DATABASE_ID");
const SEASON_ID_OVERRIDE = process.env.SEASON_ID
  ? Number(process.env.SEASON_ID)
  : null;

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
const GAME_API_BASE = "https://playthebazaar.com/api";

/** Number of recent seasons to keep in the database. */
const KEEP_SEASONS = 3;

/** Refresh the access token if it expires within this many minutes. */
const TOKEN_REFRESH_THRESHOLD_MINUTES = 10;

/** Number of entries to insert per D1 batch statement.
 * D1 HTTP API limits bound params to 100, so we inline values instead.
 * Keep batch small enough for D1's 100KB SQL statement limit. */
const BATCH_SIZE = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

function isDuplicateColumnError(err: unknown, columnName: string): boolean {
  return err instanceof Error &&
    new RegExp(`duplicate column name: ${columnName}`, "i").test(err.message);
}

async function addColumnIfMissing(
  columnName: string,
  sql: string,
  successMessage: string
): Promise<boolean> {
  try {
    await queryD1({ sql });
    log(successMessage);
    return true;
  } catch (err) {
    if (!isDuplicateColumnError(err, columnName)) {
      throw err;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// D1 HTTP helpers
// ---------------------------------------------------------------------------

async function queryD1<T = unknown>(
  statements: D1Statement | D1Statement[]
): Promise<D1Response<T>> {
  const body = Array.isArray(statements)
    ? JSON.stringify(statements)
    : JSON.stringify(statements);

  const res = await fetch(D1_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as D1Response<T>;

  if (!json.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  }

  return json;
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

async function migrateSchema(): Promise<void> {
  log("Running schema migrations...");

  // Add status column to snapshots (idempotent: ignore if exists)
  await addColumnIfMissing(
    "status",
    `ALTER TABLE snapshots ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`,
    "Added status column to snapshots."
  );

  await queryD1({
    sql: `CREATE TABLE IF NOT EXISTS player_latest (
      season_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      username TEXT NOT NULL,
      position INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      fetched_at TEXT NOT NULL,
      prev_position_24h INTEGER,
      prev_rating_24h INTEGER,
      estimated_games INTEGER NOT NULL DEFAULT 0,
      current_win_streak INTEGER NOT NULL DEFAULT 0,
      longest_win_streak INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (season_id, account_id)
    )`,
  });

  await addColumnIfMissing(
    "estimated_games",
    `ALTER TABLE player_latest ADD COLUMN estimated_games INTEGER NOT NULL DEFAULT 0`,
    "Added estimated_games column to player_latest."
  );
  await addColumnIfMissing(
    "current_win_streak",
    `ALTER TABLE player_latest ADD COLUMN current_win_streak INTEGER NOT NULL DEFAULT 0`,
    "Added current_win_streak column to player_latest."
  );
  await addColumnIfMissing(
    "longest_win_streak",
    `ALTER TABLE player_latest ADD COLUMN longest_win_streak INTEGER NOT NULL DEFAULT 0`,
    "Added longest_win_streak column to player_latest."
  );

  await queryD1({
    sql: `CREATE INDEX IF NOT EXISTS idx_player_latest_position ON player_latest(season_id, position)`,
  });
  await queryD1({
    sql: `CREATE INDEX IF NOT EXISTS idx_player_latest_username ON player_latest(season_id, username)`,
  });

  await queryD1({
    sql: `CREATE TABLE IF NOT EXISTS player_history (
      season_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
      username TEXT NOT NULL,
      position INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      PRIMARY KEY (season_id, account_id, snapshot_id)
    )`,
  });

  await queryD1({
    sql: `CREATE TABLE IF NOT EXISTS player_progress (
      season_id INTEGER NOT NULL,
      account_id TEXT NOT NULL,
      username TEXT NOT NULL,
      last_rating INTEGER,
      estimated_games INTEGER NOT NULL DEFAULT 0,
      current_win_streak INTEGER NOT NULL DEFAULT 0,
      longest_win_streak INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (season_id, account_id)
    )`,
  });

  log("Schema migrations complete.");
}

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------

async function getAuthTokens(): Promise<AuthTokenRow> {
  log("Reading auth tokens from D1...");

  const resp = await queryD1<AuthTokenRow>({
    sql: "SELECT access_token, refresh_token, expires_at FROM auth_tokens WHERE id = 1",
  });

  const rows = resp.result[0]?.results;
  if (!rows || rows.length === 0) {
    throw new Error(
      "No auth tokens found in D1. Seed the auth_tokens table first."
    );
  }

  return rows[0];
}

function isTokenExpiringSoon(expiresAt: string): boolean {
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const minutesRemaining = (expiryTime - now) / 1000 / 60;

  log(
    `Token expires at ${expiresAt} (${minutesRemaining.toFixed(1)} min remaining)`
  );

  return minutesRemaining < TOKEN_REFRESH_THRESHOLD_MINUTES;
}

async function refreshAuthTokens(
  currentAccessToken: string,
  currentRefreshToken: string
): Promise<AuthTokenRow> {
  log("Refreshing auth tokens...");

  const res = await fetch(`${GAME_API_BASE}/auth/refreshtokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: currentAccessToken,
      refreshToken: currentRefreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as RefreshTokenResponse;
  const now = new Date().toISOString();

  log("Saving refreshed tokens to D1...");

  await queryD1({
    sql: `UPDATE auth_tokens
          SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = ?
          WHERE id = 1`,
    params: [
      data.accessToken,
      data.refreshToken,
      data.accessTokenExpiresAt,
      now,
    ],
  });

  log("Tokens refreshed and saved.");

  return {
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    expires_at: data.accessTokenExpiresAt,
  };
}

async function ensureValidToken(): Promise<string> {
  let tokens = await getAuthTokens();

  if (isTokenExpiringSoon(tokens.expires_at)) {
    tokens = await refreshAuthTokens(
      tokens.access_token,
      tokens.refresh_token
    );
  } else {
    log("Token is still valid, no refresh needed.");
  }

  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// Leaderboard fetching
// ---------------------------------------------------------------------------

async function fetchLeaderboard(
  accessToken: string,
  seasonId: number
): Promise<LeaderboardResponse> {
  log(`Fetching leaderboard for season ${seasonId}...`);

  const url = `${GAME_API_BASE}/Leaderboards?seasonId=${seasonId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-clientflavor": "Web",
      "x-platform": "Tempo",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Leaderboard API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as LeaderboardResponse;

  log(
    `Fetched ${data.entries.length} entries (totalEntries: ${data.totalEntries})`
  );

  return data;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedupEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const map = new Map<string, LeaderboardEntry>();
  for (const entry of entries) {
    const existing = map.get(entry.AccountId);
    if (!existing || entry.Position < existing.Position) {
      map.set(entry.AccountId, entry);
    }
  }
  const deduped = Array.from(map.values());
  if (deduped.length < entries.length) {
    log(`Deduped ${entries.length} -> ${deduped.length} entries (removed ${entries.length - deduped.length} duplicate account_ids)`);
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Data storage
// ---------------------------------------------------------------------------

async function createSnapshot(
  seasonId: number,
  totalEntries: number,
  fetchedAt: string
): Promise<number> {
  log("Creating snapshot record...");

  const resp = await queryD1<{ id: number }>({
    sql: `INSERT INTO snapshots (season_id, fetched_at, total_entries, status)
          VALUES (?, ?, ?, 'building')
          RETURNING id`,
    params: [seasonId, fetchedAt, totalEntries],
  });

  const snapshotId = resp.result[0]?.results[0]?.id;
  if (snapshotId == null) {
    throw new Error("Failed to create snapshot: no id returned");
  }

  log(`Created snapshot #${snapshotId}`);
  return snapshotId;
}

/** Escape a string for safe inline SQL (double single-quotes). */
function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

// ---------------------------------------------------------------------------
// Derived tables (precomputation)
// ---------------------------------------------------------------------------

async function computeSnapshotMetricsFromMemory(
  snapshotId: number,
  entries: LeaderboardEntry[]
): Promise<void> {
  log("Computing snapshot metrics from memory...");

  // entries are already sorted by Position (from API)
  const sorted = [...entries].sort((a, b) => a.Position - b.Position);
  const top1 = sorted[0]?.Rating ?? null;
  const top10 = sorted.length >= 10 ? sorted[9].Rating : sorted[sorted.length - 1]?.Rating ?? null;
  const top100 = sorted.length >= 100 ? sorted[99].Rating : sorted[sorted.length - 1]?.Rating ?? null;
  const top1000 = sorted.length >= 1000 ? sorted[999].Rating : sorted[sorted.length - 1]?.Rating ?? null;

  await queryD1({
    sql: `INSERT OR REPLACE INTO snapshot_metrics (snapshot_id, top1_rating, top10_rating, top100_rating, top1000_rating)
          VALUES (?, ?, ?, ?, ?)`,
    params: [snapshotId, top1, top10, top100, top1000],
  });

  log("Snapshot metrics saved.");
}

interface PlayerLatestRow {
  account_id: string;
  username: string;
  position: number;
  rating: number;
  estimated_games: number;
  current_win_streak: number;
  longest_win_streak: number;
}

interface PlayerProgressRow {
  account_id: string;
  username: string;
  last_rating: number | null;
  estimated_games: number;
  current_win_streak: number;
  longest_win_streak: number;
}

async function backfillPlayerProgress(seasonId: number): Promise<void> {
  log("Backfilling player progress stats...");

  const currentResp = await queryD1<{
    account_id: string;
    username: string;
    rating: number;
  }>({
    sql: `SELECT account_id, username, rating FROM player_latest WHERE season_id = ?`,
    params: [seasonId],
  });
  const currentRows = currentResp.result[0]?.results ?? [];
  const activeAccountIds = new Set(currentRows.map((row) => row.account_id));

  const progressMap = new Map(
    currentRows.map((row) => [
      row.account_id,
      {
        username: row.username,
        lastRating: row.rating,
        estimatedGames: 0,
        currentWinStreak: 0,
        longestWinStreak: 0,
      },
    ])
  );

  const historyResp = await queryD1<{
    account_id: string;
    username: string;
    rating: number;
  }>({
    sql: `SELECT account_id, username, rating
          FROM player_history
          WHERE season_id = ?
          ORDER BY account_id ASC, snapshot_id ASC`,
    params: [seasonId],
  });
  const historyRows = historyResp.result[0]?.results ?? [];

  let currentAccountId: string | null = null;
  let currentUsername = "";
  let currentHistory: Array<{ rating: number }> = [];

  const flushCurrentHistory = () => {
    if (!currentAccountId) {
      return;
    }

    const progress = computePlayerProgressFromHistory(currentHistory);
    progressMap.set(currentAccountId, {
      username: currentUsername,
      lastRating: currentHistory[currentHistory.length - 1]?.rating ?? null,
      estimatedGames: progress.estimatedGames,
      currentWinStreak: progress.currentWinStreak,
      longestWinStreak: progress.longestWinStreak,
    });
  };

  for (const row of historyRows) {
    if (row.account_id !== currentAccountId) {
      flushCurrentHistory();
      currentAccountId = row.account_id;
      currentUsername = row.username;
      currentHistory = [{ rating: row.rating }];
      continue;
    }

    currentUsername = row.username;
    currentHistory.push({ rating: row.rating });
  }
  flushCurrentHistory();

  const progressEntries = Array.from(progressMap.entries());
  for (let i = 0; i < progressEntries.length; i += BATCH_SIZE) {
    const batch = progressEntries.slice(i, i + BATCH_SIZE);
    await queryD1(
      batch.map(([accountId, progress]) => ({
        sql: `INSERT OR REPLACE INTO player_progress
              (season_id, account_id, username, last_rating, estimated_games, current_win_streak, longest_win_streak)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [
          seasonId,
          accountId,
          progress.username,
          progress.lastRating,
          progress.estimatedGames,
          progress.currentWinStreak,
          progress.longestWinStreak,
        ],
      }))
    );
  }

  const activeProgressEntries = progressEntries.filter(([accountId]) =>
    activeAccountIds.has(accountId)
  );
  for (let i = 0; i < activeProgressEntries.length; i += BATCH_SIZE) {
    const batch = activeProgressEntries.slice(i, i + BATCH_SIZE);
    await queryD1(
      batch.map(([accountId, progress]) => ({
        sql: `UPDATE player_latest
              SET estimated_games = ?, current_win_streak = ?, longest_win_streak = ?
              WHERE season_id = ? AND account_id = ?`,
        params: [
          progress.estimatedGames,
          progress.currentWinStreak,
          progress.longestWinStreak,
          seasonId,
          accountId,
        ],
      }))
    );
  }

  log(`  Backfilled progress for ${progressEntries.length} players.`);
}

async function syncPlayerTables(
  snapshotId: number,
  seasonId: number,
  fetchedAt: string,
  entries: LeaderboardEntry[]
): Promise<{ needsPlayerProgressBackfill: boolean }> {
  log("Syncing player tables...");

  // 1. Read current player_latest for this season
  const prevResp = await queryD1<PlayerLatestRow>({
    sql: `SELECT account_id, username, position, rating, estimated_games, current_win_streak, longest_win_streak
          FROM player_latest
          WHERE season_id = ?`,
    params: [seasonId],
  });
  const prevRows = prevResp.result[0]?.results ?? [];
  const prevMap = new Map<string, PlayerLatestRow>();
  for (const row of prevRows) {
    prevMap.set(row.account_id, row);
  }

  const progressResp = await queryD1<PlayerProgressRow>({
    sql: `SELECT account_id, username, last_rating, estimated_games, current_win_streak, longest_win_streak
          FROM player_progress
          WHERE season_id = ?`,
    params: [seasonId],
  });
  const progressRows = progressResp.result[0]?.results ?? [];
  const progressMap = new Map<string, PlayerProgressRow>();
  for (const row of progressRows) {
    progressMap.set(row.account_id, row);
  }
  const needsPlayerProgressBackfill = prevRows.some(
    (row) => !progressMap.has(row.account_id)
  );

  // 2. Find 24h-ago baseline snapshot (or earliest snapshot if season < 24h old)
  const baselineResp = await queryD1<{ id: number }>({
    sql: `SELECT id FROM snapshots
          WHERE season_id = ? AND status = 'ready'
            AND total_entries > 1
            AND fetched_at <= datetime(?, '-1 day')
          ORDER BY fetched_at DESC LIMIT 1`,
    params: [seasonId, fetchedAt],
  });
  let baselineSnapshotId = baselineResp.result[0]?.results[0]?.id ?? null;

  // If no 24h-ago snapshot exists (season < 24h old), use the earliest snapshot
  if (!baselineSnapshotId) {
    const earliestResp = await queryD1<{ id: number }>({
      sql: `SELECT id FROM snapshots
            WHERE season_id = ? AND status = 'ready'
              AND total_entries > 1
            ORDER BY fetched_at ASC LIMIT 1`,
      params: [seasonId],
    });
    baselineSnapshotId = earliestResp.result[0]?.results[0]?.id ?? null;
  }

  // 3. Detect changes and build batches
  const changed: LeaderboardEntry[] = [];
  const currentAccountIds = new Set<string>();

  for (const entry of entries) {
    currentAccountIds.add(entry.AccountId);
    const prev = prevMap.get(entry.AccountId);
    if (
      !prev ||
      prev.rating !== entry.Rating ||
      prev.position !== entry.Position ||
      prev.username !== entry.Username
    ) {
      changed.push(entry);
    }
  }

  log(`  ${changed.length} changed/new out of ${entries.length} total`);

  // 4. Batch INSERT changed rows to player_history
  if (changed.length > 0) {
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const batch = changed.slice(i, i + BATCH_SIZE);
      const values = batch
        .map(
          (e) =>
            `(${seasonId}, '${sqlEscape(e.AccountId)}', ${snapshotId}, '${sqlEscape(e.Username)}', ${e.Position}, ${e.Rating})`
        )
        .join(", ");

      await queryD1({
        sql: `INSERT OR IGNORE INTO player_history (season_id, account_id, snapshot_id, username, position, rating) VALUES ${values}`,
      });
    }
    log(`  Inserted ${changed.length} rows to player_history`);
  }

  // 5. Compute 24h baselines for ALL players and UPSERT/UPDATE player_latest
  // Build baseline map for ALL players (not just changed ones)
  const deltaMap = new Map<string, { position: number; rating: number }>();

  if (baselineSnapshotId) {
    // Query baselines from player_history for ALL players in batches
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const accountIds = batch.map((e) => `'${sqlEscape(e.AccountId)}'`).join(", ");
      const deltaResp = await queryD1<{
        account_id: string;
        position: number;
        rating: number;
      }>({
        sql: `SELECT h.account_id, h.position, h.rating
              FROM player_history h
              WHERE h.season_id = ? AND h.account_id IN (${accountIds})
                AND h.snapshot_id <= ?
              ORDER BY h.snapshot_id DESC`,
        params: [seasonId, baselineSnapshotId],
      });

      // Take only the latest row per account_id (results are ordered by snapshot_id DESC)
      const rows = deltaResp.result[0]?.results ?? [];
      for (const row of rows) {
        if (!deltaMap.has(row.account_id)) {
          deltaMap.set(row.account_id, {
            position: row.position,
            rating: row.rating,
          });
        }
      }
    }

    // For players with no history entry at/before baseline, use their
    // current player_latest values (they've been unchanged since before baseline)
    for (const entry of entries) {
      if (!deltaMap.has(entry.AccountId)) {
        const prev = prevMap.get(entry.AccountId);
        if (prev) {
          deltaMap.set(entry.AccountId, {
            position: prev.position,
            rating: prev.rating,
          });
        }
      }
    }
  }

  // 5a. UPSERT changed players to player_latest (updates all fields + baselines)
  if (changed.length > 0) {
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const batch = changed.slice(i, i + BATCH_SIZE);
      const computedBatch = batch.map((e) => {
        const delta = deltaMap.get(e.AccountId);
        const prev = progressMap.get(e.AccountId);
        const progress = advancePlayerProgress(
          prev
            ? {
                estimatedGames: prev.estimated_games,
                currentWinStreak: prev.current_win_streak,
                longestWinStreak: prev.longest_win_streak,
              }
            : {
                estimatedGames: 0,
                currentWinStreak: 0,
                longestWinStreak: 0,
              },
          prev?.last_rating ?? null,
          e.Rating
        );
        return { entry: e, delta, progress };
      });

      const latestValues = computedBatch
        .map(({ entry, delta, progress }) => {
          const e = entry;
          const prevPos = delta ? delta.position : "NULL";
          const prevRat = delta ? delta.rating : "NULL";
          return `(${seasonId}, '${sqlEscape(e.AccountId)}', '${sqlEscape(e.Username)}', ${e.Position}, ${e.Rating}, '${sqlEscape(fetchedAt)}', ${prevPos}, ${prevRat}, ${progress.estimatedGames}, ${progress.currentWinStreak}, ${progress.longestWinStreak})`;
        })
        .join(", ");

      await queryD1({
        sql: `INSERT OR REPLACE INTO player_latest (season_id, account_id, username, position, rating, fetched_at, prev_position_24h, prev_rating_24h, estimated_games, current_win_streak, longest_win_streak) VALUES ${latestValues}`,
      });

      const progressValues = computedBatch
        .map(({ entry, progress }) => {
          const e = entry;
          progressMap.set(e.AccountId, {
            account_id: e.AccountId,
            username: e.Username,
            last_rating: e.Rating,
            estimated_games: progress.estimatedGames,
            current_win_streak: progress.currentWinStreak,
            longest_win_streak: progress.longestWinStreak,
          });
          return `(${seasonId}, '${sqlEscape(e.AccountId)}', '${sqlEscape(e.Username)}', ${e.Rating}, ${progress.estimatedGames}, ${progress.currentWinStreak}, ${progress.longestWinStreak})`;
        })
        .join(", ");

      await queryD1({
        sql: `INSERT OR REPLACE INTO player_progress
              (season_id, account_id, username, last_rating, estimated_games, current_win_streak, longest_win_streak)
              VALUES ${progressValues}`,
      });
    }
    log(`  Upserted ${changed.length} changed rows to player_latest`);
    log(`  Upserted ${changed.length} changed rows to player_progress`);
  }

  // 5b. UPDATE baselines for unchanged players
  // These players already exist in player_latest but their prev_*_24h may be stale/NULL
  if (baselineSnapshotId) {
    const changedIds = new Set(changed.map((c) => c.AccountId));
    const unchanged = entries.filter((e) => !changedIds.has(e.AccountId));
    let updatedCount = 0;
    for (let i = 0; i < unchanged.length; i += BATCH_SIZE) {
      const batch = unchanged.slice(i, i + BATCH_SIZE);
      // Use CASE expressions to update multiple rows in one query
      const posCases: string[] = [];
      const ratCases: string[] = [];
      const ids: string[] = [];
      for (const e of batch) {
        const delta = deltaMap.get(e.AccountId);
        if (delta) {
          const escapedId = sqlEscape(e.AccountId);
          ids.push(`'${escapedId}'`);
          posCases.push(`WHEN '${escapedId}' THEN ${delta.position}`);
          ratCases.push(`WHEN '${escapedId}' THEN ${delta.rating}`);
        }
      }
      if (ids.length > 0) {
        await queryD1({
          sql: `UPDATE player_latest
                SET prev_position_24h = CASE account_id ${posCases.join(" ")} ELSE prev_position_24h END,
                    prev_rating_24h = CASE account_id ${ratCases.join(" ")} ELSE prev_rating_24h END
                WHERE season_id = ? AND account_id IN (${ids.join(", ")})`,
          params: [seasonId],
        });
        updatedCount += ids.length;
      }
    }
    if (updatedCount > 0) {
      log(`  Updated baselines for ${updatedCount} unchanged players`);
    }
  }

  // 6. Delete delisted players
  const delistedIds: string[] = [];
  for (const accountId of prevMap.keys()) {
    if (!currentAccountIds.has(accountId)) {
      delistedIds.push(accountId);
    }
  }
  if (delistedIds.length > 0) {
    for (let i = 0; i < delistedIds.length; i += BATCH_SIZE) {
      const batch = delistedIds.slice(i, i + BATCH_SIZE);
      const ids = batch.map((id) => `'${sqlEscape(id)}'`).join(", ");
      await queryD1({
        sql: `DELETE FROM player_latest WHERE season_id = ? AND account_id IN (${ids})`,
        params: [seasonId],
      });
    }
    log(`  Deleted ${delistedIds.length} delisted players from player_latest`);
  }

  log("Player tables synced.");
  return { needsPlayerProgressBackfill };
}

async function markSnapshotReady(snapshotId: number): Promise<void> {
  await queryD1({
    sql: `UPDATE snapshots SET status = 'ready' WHERE id = ?`,
    params: [snapshotId],
  });
  log(`Snapshot #${snapshotId} marked as ready.`);
}

// ---------------------------------------------------------------------------
// Season detection
// ---------------------------------------------------------------------------

async function getKnownMaxSeason(): Promise<number> {
  const resp = await queryD1<{ max_season: number | null }>({
    sql: "SELECT MAX(season_id) as max_season FROM snapshots",
  });
  return resp.result[0]?.results[0]?.max_season ?? 1;
}

async function detectLatestSeason(accessToken: string): Promise<number> {
  log("Auto-detecting latest season...");

  let seasonId = await getKnownMaxSeason();
  log(`Last known season in DB: ${seasonId}`);

  // Probe upward: if current season has entries, try the next one
  while (true) {
    const probe = await fetchLeaderboard(accessToken, seasonId + 1);
    if (probe.totalEntries > 0) {
      seasonId = seasonId + 1;
      log(`Season ${seasonId} has ${probe.totalEntries} entries, trying next...`);
    } else {
      break;
    }
  }

  log(`Latest season detected: ${seasonId}`);
  return seasonId;
}

// ---------------------------------------------------------------------------
// Cleanup old seasons
// ---------------------------------------------------------------------------

async function cleanupOldSeasons(): Promise<void> {
  const resp = await queryD1<{ season_id: number }>({
    sql: "SELECT DISTINCT season_id FROM snapshots ORDER BY season_id DESC",
  });

  const allSeasons = resp.result[0]?.results.map((r) => r.season_id) ?? [];

  if (allSeasons.length <= KEEP_SEASONS) {
    log(`Only ${allSeasons.length} season(s) in DB, no cleanup needed.`);
    return;
  }

  const seasonsToDelete = allSeasons.slice(KEEP_SEASONS);
  log(`Cleaning up old seasons: ${seasonsToDelete.join(", ")}`);

  const placeholders = seasonsToDelete.map(() => "?").join(", ");

  // Delete derived tables, then snapshots
  const snapshotFilter = `SELECT id FROM snapshots WHERE season_id IN (${placeholders})`;
  await queryD1({
    sql: `DELETE FROM snapshot_metrics WHERE snapshot_id IN (${snapshotFilter})`,
    params: seasonsToDelete,
  });
  await queryD1({
    sql: `DELETE FROM player_history WHERE season_id IN (${placeholders})`,
    params: seasonsToDelete,
  });
  await queryD1({
    sql: `DELETE FROM player_latest WHERE season_id IN (${placeholders})`,
    params: seasonsToDelete,
  });
  await queryD1({
    sql: `DELETE FROM player_progress WHERE season_id IN (${placeholders})`,
    params: seasonsToDelete,
  });
  await queryD1({
    sql: `DELETE FROM snapshots WHERE season_id IN (${placeholders})`,
    params: seasonsToDelete,
  });

  log(`Deleted data for season(s): ${seasonsToDelete.join(", ")}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function proactiveRefresh(): Promise<void> {
  try {
    log("Proactively refreshing tokens for next run...");
    const tokens = await getAuthTokens();
    await refreshAuthTokens(tokens.access_token, tokens.refresh_token);
  } catch (err) {
    // Don't let refresh failure mask the original error
    log(`Warning: proactive token refresh failed: ${err}`);
  }
}

async function main(): Promise<void> {
  log("=== Bazaar Leaderboard Fetch Start ===");

  try {
    // 0. Run migrations
    await migrateSchema();

    // 1. Get a valid access token (refresh if needed)
    const accessToken = await ensureValidToken();

    // 2. Determine which season to fetch
    const seasonId =
      SEASON_ID_OVERRIDE ?? (await detectLatestSeason(accessToken));
    log(`Using season ID: ${seasonId}`);

    // 3. Fetch leaderboard (retry on empty response — the API is flaky)
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000;
    let leaderboard: LeaderboardResponse | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await fetchLeaderboard(accessToken, seasonId);
      if (result.entries.length > 0) {
        leaderboard = result;
        break;
      }
      if (attempt < MAX_RETRIES) {
        log(`Empty response (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      } else {
        log(`Empty response after ${MAX_RETRIES} attempts.`);
      }
    }

    if (!leaderboard) {
      throw new Error(`Leaderboard API returned empty data after ${MAX_RETRIES} attempts`);
    }

    // 4. Dedup by account_id
    const entries = dedupEntries(leaderboard.entries);

    // 5. Create snapshot (status=building)
    const fetchedAt = new Date().toISOString();
    const snapshotId = await createSnapshot(
      seasonId,
      leaderboard.totalEntries,
      fetchedAt
    );

    // 6. Compute metrics from memory
    await computeSnapshotMetricsFromMemory(snapshotId, entries);

    // 7. Sync player tables
    const { needsPlayerProgressBackfill } = await syncPlayerTables(
      snapshotId,
      seasonId,
      fetchedAt,
      entries
    );

    // 8. Backfill progress once for seasons that have active rows but no
    // persisted player_progress state yet.
    if (needsPlayerProgressBackfill) {
      await backfillPlayerProgress(seasonId);
    }

    // 9. Mark snapshot ready
    await markSnapshotReady(snapshotId);

    // 10. Cleanup old seasons
    await cleanupOldSeasons();

    log("=== Bazaar Leaderboard Fetch Complete ===");
  } finally {
    // Always refresh token for next run, even if main flow failed.
    // Access token expires in ~15 min but CI runs every 30 min,
    // so always refresh to keep the refresh token chain alive.
    await proactiveRefresh();
  }
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
