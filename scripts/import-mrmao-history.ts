/**
 * One-off script: import historical rating data from bazaar.mrmao.life
 * for the top N players into our D1 database.
 *
 * Only imports data BEFORE our automated collection started (Feb 24 17:33 UTC).
 * Subsamples to 30-minute intervals to reduce write volume.
 *
 * Usage: npx tsx scripts/import-mrmao-history.ts
 */

const CF_ACCOUNT_ID = "111a703d91e4f2cd124b0bfb72ef836b";
const CF_API_TOKEN = "L8-aEHyL4Pi13cnKS0RfTYkwnJAbaMJBsdnviRTA";
const D1_DATABASE_ID = "0d26e1f3-d0ee-41f5-bd8b-f1f04b72fa99";
const SEASON_ID = 12;
const CUTOFF = "2026-02-24T17:30:00Z"; // before our first real snapshot
const SAMPLE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const BATCH_SIZE = 20; // SQLite limit: 100 params, 5 params per row → max 20

interface MrmaoPoint {
  timestamp: string; // "2026-02-11 23:11:16"
  rating: number;
  position: number;
}

interface SnapshotEntry {
  username: string;
  rating: number;
  position: number;
}

async function fetchMrmaoHistory(
  username: string
): Promise<MrmaoPoint[]> {
  const url = `https://bazaar.mrmao.life/api/rating-history?username=${encodeURIComponent(username)}&seasonId=${SEASON_ID}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${username}: ${res.status}`);
  return res.json();
}

async function fetchTopPlayers(count: number): Promise<string[]> {
  const res = await fetch(
    `https://bazaar-leaderboard.pages.dev/api/leaderboard?seasonId=${SEASON_ID}&limit=${count}`
  );
  if (!res.ok) throw new Error(`Failed to fetch leaderboard: ${res.status}`);
  const data = await res.json();
  return data.entries.map((e: { username: string }) => e.username);
}

function roundToInterval(ts: string): string {
  // mrmao format: "2026-02-11 23:11:16" → ISO
  const d = new Date(ts.replace(" ", "T") + "Z");
  const rounded = new Date(
    Math.round(d.getTime() / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS
  );
  return rounded.toISOString();
}

async function d1Query(sql: string, params: unknown[] = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function d1InsertEntries(
  snapshotId: number,
  entries: SnapshotEntry[]
) {
  // Use multi-row INSERT to reduce API calls
  // account_id is NOT NULL in schema but mrmao doesn't provide it — use empty string
  const placeholders = entries.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const params: unknown[] = [];
  for (const e of entries) {
    params.push(snapshotId, "", e.position, e.username, e.rating);
  }
  const sql = `INSERT OR IGNORE INTO entries (snapshot_id, account_id, position, username, rating) VALUES ${placeholders}`;
  return d1Query(sql, params);
}

async function main() {
  // 1. Get top 100 players + pengx17
  console.log("Fetching top 100 players...");
  const topPlayers = await fetchTopPlayers(100);
  const allPlayers = [...new Set([...topPlayers, "pengx17"])];
  console.log(`Will import data for ${allPlayers.length} players`);

  // 2. Fetch all histories from mrmao (with concurrency limit)
  console.log("Fetching histories from mrmao...");
  const playerHistories = new Map<string, MrmaoPoint[]>();
  const CONCURRENCY = 10;

  for (let i = 0; i < allPlayers.length; i += CONCURRENCY) {
    const batch = allPlayers.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((u) => fetchMrmaoHistory(u))
    );
    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value.length > 0) {
        playerHistories.set(batch[j], result.value);
      } else {
        const reason =
          result.status === "rejected" ? result.reason : "no data";
        console.warn(`  Skip ${batch[j]}: ${reason}`);
      }
    }
    console.log(
      `  Fetched ${Math.min(i + CONCURRENCY, allPlayers.length)}/${allPlayers.length}`
    );
  }

  // 3. Build snapshot map: rounded timestamp → entries
  console.log("Building snapshot map...");
  const cutoffTime = new Date(CUTOFF).getTime();
  const snapshotMap = new Map<string, SnapshotEntry[]>();

  for (const [username, history] of playerHistories) {
    // Subsample: keep one point per 30-min interval, before cutoff
    const seen = new Set<string>();
    for (const point of history) {
      const isoTime = new Date(point.timestamp.replace(" ", "T") + "Z");
      if (isoTime.getTime() >= cutoffTime) continue;

      const rounded = roundToInterval(point.timestamp);
      if (seen.has(rounded)) continue;
      seen.add(rounded);

      if (!snapshotMap.has(rounded)) snapshotMap.set(rounded, []);
      snapshotMap.get(rounded)!.push({
        username,
        rating: point.rating,
        position: point.position,
      });
    }
  }

  const sortedTimes = [...snapshotMap.keys()].sort();
  const totalEntries = sortedTimes.reduce(
    (s, t) => s + snapshotMap.get(t)!.length,
    0
  );
  console.log(
    `${sortedTimes.length} snapshots, ${totalEntries} total entries to import`
  );

  // 4. Load existing snapshots (to reuse IDs and skip already-populated ones)
  const existingResult = await d1Query(
    "SELECT id, fetched_at FROM snapshots WHERE season_id = ?",
    [SEASON_ID]
  );
  const existingSnapshots = new Map<string, number>(
    (existingResult as any).result[0].results.map(
      (r: { id: number; fetched_at: string }) => [r.fetched_at, r.id]
    )
  );
  console.log(`${existingSnapshots.size} existing snapshots in DB`);

  // 5. Check which existing snapshots already have entries (to skip them)
  console.log("Checking existing entry counts...");
  const entryCountResult = await d1Query(
    `SELECT snapshot_id, COUNT(*) as cnt FROM entries
     WHERE snapshot_id IN (SELECT id FROM snapshots WHERE season_id = ?)
     GROUP BY snapshot_id`,
    [SEASON_ID]
  );
  const existingEntryCounts = new Map<number, number>(
    (entryCountResult as any).result[0].results.map(
      (r: { snapshot_id: number; cnt: number }) => [r.snapshot_id, r.cnt]
    )
  );

  // 6. Insert snapshots and entries
  let processedSnapshots = 0;
  let skippedSnapshots = 0;
  let insertedEntries = 0;

  for (const time of sortedTimes) {
    const entries = snapshotMap.get(time)!;

    // Find or create snapshot
    let snapshotId = existingSnapshots.get(time);
    if (snapshotId == null) {
      const snapResult = await d1Query(
        `INSERT INTO snapshots (season_id, fetched_at, total_entries) VALUES (?, ?, ?) RETURNING id`,
        [SEASON_ID, time, entries.length]
      );
      snapshotId = (snapResult as any).result[0].results[0].id;
    } else {
      // Update total_entries if it was 0 (old pengx17-only import)
      await d1Query(
        `UPDATE snapshots SET total_entries = MAX(total_entries, ?) WHERE id = ?`,
        [entries.length, snapshotId]
      );
    }

    // Skip if this snapshot already has enough entries
    const existingCount = existingEntryCounts.get(snapshotId) ?? 0;
    if (existingCount >= entries.length) {
      skippedSnapshots++;
      processedSnapshots++;
      if (processedSnapshots % 50 === 0) {
        console.log(
          `  Progress: ${processedSnapshots}/${sortedTimes.length} snapshots, ${insertedEntries} entries (${skippedSnapshots} skipped)`
        );
      }
      continue;
    }

    // Insert entries in batches
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      await d1InsertEntries(snapshotId, batch);
      insertedEntries += batch.length;
    }

    processedSnapshots++;
    if (processedSnapshots % 50 === 0) {
      console.log(
        `  Progress: ${processedSnapshots}/${sortedTimes.length} snapshots, ${insertedEntries} entries (${skippedSnapshots} skipped)`
      );
    }
  }

  console.log(
    `Done! Processed ${processedSnapshots} snapshots, ${insertedEntries} entries inserted, ${skippedSnapshots} skipped.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
