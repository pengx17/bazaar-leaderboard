// scripts/fetch-leaderboard.ts
// Fetches The Bazaar leaderboard data and stores it in Cloudflare D1.
// Run via: npx tsx scripts/fetch-leaderboard.ts

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
 * Each row is ~80 bytes → 1000 rows ≈ 80KB (under 100KB SQL limit). */
const BATCH_SIZE = 1000;

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
// Data storage
// ---------------------------------------------------------------------------

async function createSnapshot(
  seasonId: number,
  totalEntries: number,
  fetchedAt: string
): Promise<number> {
  log("Creating snapshot record...");

  const resp = await queryD1<{ id: number }>({
    sql: `INSERT INTO snapshots (season_id, fetched_at, total_entries)
          VALUES (?, ?, ?)
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

function buildInsertBatches(
  snapshotId: number,
  entries: LeaderboardEntry[]
): D1Statement[] {
  const statements: D1Statement[] = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    // Inline values to avoid D1's 100 bound-parameter limit
    const values = batch
      .map(
        (e) =>
          `(${snapshotId}, '${sqlEscape(e.AccountId)}', '${sqlEscape(e.Username)}', ${e.Position}, ${e.Rating})`
      )
      .join(", ");

    statements.push({
      sql: `INSERT INTO entries (snapshot_id, account_id, username, position, rating) VALUES ${values}`,
    });
  }

  return statements;
}

async function storeEntries(
  snapshotId: number,
  entries: LeaderboardEntry[]
): Promise<void> {
  const batches = buildInsertBatches(snapshotId, entries);

  log(
    `Inserting ${entries.length} entries in ${batches.length} batch(es) (batch size: ${BATCH_SIZE})...`
  );

  // D1 HTTP API only accepts a single statement per call,
  // so we send each batch sequentially.
  for (let i = 0; i < batches.length; i++) {
    await queryD1(batches[i]);
    if ((i + 1) % 10 === 0 || i === batches.length - 1) {
      log(`  Batch ${i + 1}/${batches.length} done`);
    }
  }

  log("All entries inserted.");
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

  // Delete entries first (FK reference), then snapshots
  await queryD1({
    sql: `DELETE FROM entries WHERE snapshot_id IN (SELECT id FROM snapshots WHERE season_id IN (${placeholders}))`,
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

async function main(): Promise<void> {
  log("=== Bazaar Leaderboard Fetch Start ===");

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
      log(`Empty response after ${MAX_RETRIES} attempts. Skipping storage.`);
    }
  }

  if (!leaderboard) return;

  // 4. Store in D1
  const fetchedAt = new Date().toISOString();
  const snapshotId = await createSnapshot(
    seasonId,
    leaderboard.totalEntries,
    fetchedAt
  );

  await storeEntries(snapshotId, leaderboard.entries);

  // 5. Cleanup old seasons
  await cleanupOldSeasons();

  log("=== Bazaar Leaderboard Fetch Complete ===");
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
