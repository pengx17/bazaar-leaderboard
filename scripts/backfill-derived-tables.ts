// scripts/backfill-derived-tables.ts
// One-time script to backfill snapshot_metrics and snapshot_delta_24h
// for existing snapshots that were created before the derived tables existed.
// Run via: npx tsx scripts/backfill-derived-tables.ts

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CF_API_TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");
const CF_ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const D1_DATABASE_ID = requireEnv("D1_DATABASE_ID");

const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

interface D1Response<T = unknown> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: Array<{
    success: boolean;
    results: T[];
    meta: Record<string, unknown>;
  }>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing: ${name}`);
  return value;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function queryD1<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await fetch(D1_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as D1Response<T>;
  if (!json.success) throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  return json.result[0]?.results ?? [];
}

// ---------------------------------------------------------------------------
// Backfill snapshot_metrics
// ---------------------------------------------------------------------------

async function backfillMetrics(): Promise<void> {
  // Find snapshots missing metrics
  const missing = await queryD1<{ id: number }>(
    `SELECT s.id FROM snapshots s
     LEFT JOIN snapshot_metrics m ON m.snapshot_id = s.id
     WHERE m.snapshot_id IS NULL AND s.total_entries > 1
     ORDER BY s.id ASC`
  );

  log(`Found ${missing.length} snapshots missing metrics.`);

  for (let i = 0; i < missing.length; i++) {
    const sid = missing[i].id;

    await queryD1(
      `INSERT INTO snapshot_metrics (snapshot_id, top1_rating, top10_rating, top100_rating, top1000_rating)
       SELECT ?,
         (SELECT rating FROM entries WHERE snapshot_id = ? AND position = 1),
         (SELECT rating FROM entries WHERE snapshot_id = ? AND position <= 10 ORDER BY position DESC LIMIT 1),
         (SELECT rating FROM entries WHERE snapshot_id = ? AND position <= 100 ORDER BY position DESC LIMIT 1),
         (SELECT rating FROM entries WHERE snapshot_id = ? AND position <= 1000 ORDER BY position DESC LIMIT 1)`,
      [sid, sid, sid, sid, sid]
    );

    if ((i + 1) % 50 === 0 || i === missing.length - 1) {
      log(`  Metrics: ${i + 1}/${missing.length}`);
    }
  }

  log("Metrics backfill complete.");
}

// ---------------------------------------------------------------------------
// Backfill snapshot_delta_24h
// ---------------------------------------------------------------------------

async function backfillDeltas(): Promise<void> {
  // Find snapshots missing deltas
  const missing = await queryD1<{ id: number; season_id: number; fetched_at: string }>(
    `SELECT s.id, s.season_id, s.fetched_at FROM snapshots s
     LEFT JOIN snapshot_delta_24h d ON d.snapshot_id = s.id
     WHERE d.snapshot_id IS NULL AND s.total_entries > 1
     ORDER BY s.id ASC`
  );

  log(`Found ${missing.length} snapshots missing deltas.`);

  for (let i = 0; i < missing.length; i++) {
    const { id: sid, season_id: seasonId, fetched_at: fetchedAt } = missing[i];

    // Find baseline snapshot (~24h ago)
    const baseline = await queryD1<{ id: number }>(
      `SELECT id FROM snapshots
       WHERE season_id = ? AND total_entries > 1
         AND fetched_at <= datetime(?, '-1 day')
       ORDER BY fetched_at DESC LIMIT 1`,
      [seasonId, fetchedAt]
    );

    if (baseline.length === 0) {
      // No baseline available (first 24h of season)
      if ((i + 1) % 50 === 0 || i === missing.length - 1) {
        log(`  Deltas: ${i + 1}/${missing.length} (skipped, no baseline)`);
      }
      continue;
    }

    const baselineId = baseline[0].id;

    await queryD1(
      `INSERT INTO snapshot_delta_24h (snapshot_id, account_id, prev_position, prev_rating)
       SELECT ?, p.account_id, p.position, p.rating
       FROM entries p
       WHERE p.snapshot_id = ?
         AND EXISTS (SELECT 1 FROM entries e WHERE e.snapshot_id = ? AND e.account_id = p.account_id)`,
      [sid, baselineId, sid]
    );

    if ((i + 1) % 50 === 0 || i === missing.length - 1) {
      log(`  Deltas: ${i + 1}/${missing.length}`);
    }
  }

  log("Deltas backfill complete.");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function migrate() {
  log("Running migrations (idempotent)...");

  await queryD1(
    `CREATE TABLE IF NOT EXISTS snapshot_metrics (
       snapshot_id INTEGER PRIMARY KEY REFERENCES snapshots(id),
       top1_rating INTEGER,
       top10_rating INTEGER,
       top100_rating INTEGER,
       top1000_rating INTEGER
     )`
  );

  await queryD1(
    `CREATE TABLE IF NOT EXISTS snapshot_delta_24h (
       snapshot_id INTEGER NOT NULL,
       account_id TEXT NOT NULL,
       prev_position INTEGER NOT NULL,
       prev_rating INTEGER NOT NULL,
       PRIMARY KEY (snapshot_id, account_id)
     )`
  );

  await queryD1(
    `CREATE INDEX IF NOT EXISTS idx_entries_account ON entries(account_id, snapshot_id)`
  );

  log("Migrations complete.");
}

async function main() {
  log("=== Backfill Derived Tables Start ===");
  await migrate();
  await backfillMetrics();
  await backfillDeltas();
  log("=== Backfill Complete ===");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
