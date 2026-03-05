# User-Centric Data Model Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the per-snapshot `entries` table with user-centric `player_latest` + `player_history` tables, moving heavy computation to sync and making API queries trivial.

**Architecture:** Three-phase migration — parallel write (sync writes both old and new tables), API switchover (endpoints read from new tables), cleanup (drop old tables). Each phase is a separate commit that can be deployed and validated independently.

**Tech Stack:** TypeScript, Cloudflare D1 (SQLite via HTTP API), Cloudflare Pages Functions

**Design doc:** `docs/plans/2026-03-05-user-centric-data-model-design.md`

---

## Phase 1: Schema + Sync Parallel Write

### Task 1: Add new tables to schema.sql

**Files:**
- Modify: `schema.sql`

**Step 1: Add status column to snapshots, add player_latest and player_history tables**

Append to `schema.sql` after the `auth_tokens` table:

```sql
-- Player-centric tables (new data model)
CREATE TABLE IF NOT EXISTS player_latest (
  season_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  position INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  prev_position_24h INTEGER,
  prev_rating_24h INTEGER,
  PRIMARY KEY (season_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_player_latest_position ON player_latest(season_id, position);
CREATE INDEX IF NOT EXISTS idx_player_latest_username ON player_latest(season_id, username);

CREATE TABLE IF NOT EXISTS player_history (
  season_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  username TEXT NOT NULL,
  position INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  PRIMARY KEY (season_id, account_id, snapshot_id)
);
```

Note: Do NOT modify the existing snapshots table DDL yet. The `status` column will be added via ALTER TABLE in the sync script's migration step, because existing rows need a default value.

**Step 2: Commit**

```bash
git add schema.sql
git commit -m "schema: add player_latest and player_history tables"
```

---

### Task 2: Add migration + dedup + change detection to sync script

**Files:**
- Modify: `scripts/fetch-leaderboard.ts`

This is the largest task. The sync script needs these new functions inserted between the existing data storage section and the derived tables section.

**Step 1: Add migration function**

Add after the `queryD1` function (after line 123). This runs idempotent DDL on every sync to ensure tables exist:

```typescript
async function migrateSchema(): Promise<void> {
  log("Running schema migrations...");

  // Add status column to snapshots (idempotent: ignore if exists)
  try {
    await queryD1({
      sql: `ALTER TABLE snapshots ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`,
    });
    log("Added status column to snapshots.");
  } catch {
    // Column already exists — expected
  }

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
      PRIMARY KEY (season_id, account_id)
    )`,
  });

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

  log("Schema migrations complete.");
}
```

**Step 2: Add dedup function**

Add after `migrateSchema`. Deduplicates fetched entries by `account_id`, keeping the lowest position on collision:

```typescript
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
```

**Step 3: Add computeSnapshotMetricsFromMemory function**

Replace the existing `computeSnapshotMetrics` that queries from `entries` table. Compute from in-memory data instead (deduped entries are the source of truth):

```typescript
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
```

**Step 4: Add syncPlayerTables function**

This is the core change detection + write logic. Add after the metrics function:

```typescript
interface PlayerLatestRow {
  account_id: string;
  username: string;
  position: number;
  rating: number;
}

async function syncPlayerTables(
  snapshotId: number,
  seasonId: number,
  fetchedAt: string,
  entries: LeaderboardEntry[]
): Promise<void> {
  log("Syncing player tables...");

  // 1. Read current player_latest for this season
  const prevResp = await queryD1<PlayerLatestRow>({
    sql: `SELECT account_id, username, position, rating FROM player_latest WHERE season_id = ?`,
    params: [seasonId],
  });
  const prevRows = prevResp.result[0]?.results ?? [];
  const prevMap = new Map<string, PlayerLatestRow>();
  for (const row of prevRows) {
    prevMap.set(row.account_id, row);
  }

  // 2. Find 24h-ago baseline snapshot
  const baselineResp = await queryD1<{ id: number }>({
    sql: `SELECT id FROM snapshots
          WHERE season_id = ? AND status = 'ready'
            AND total_entries > 1
            AND fetched_at <= datetime(?, '-1 day')
          ORDER BY fetched_at DESC LIMIT 1`,
    params: [seasonId, fetchedAt],
  });
  const baselineSnapshotId = baselineResp.result[0]?.results[0]?.id ?? null;

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

  // 5. Compute 24h deltas for changed players and UPSERT to player_latest
  if (changed.length > 0) {
    // Batch-query 24h-ago baselines from player_history for changed players
    let deltaMap = new Map<string, { position: number; rating: number }>();

    if (baselineSnapshotId) {
      // Query in batches to avoid SQL size limits
      for (let i = 0; i < changed.length; i += BATCH_SIZE) {
        const batch = changed.slice(i, i + BATCH_SIZE);
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
    }

    // For changed players with no history entry before baseline,
    // check if they exist in player_latest (unchanged for >24h)
    if (baselineSnapshotId) {
      for (const entry of changed) {
        if (!deltaMap.has(entry.AccountId)) {
          const prev = prevMap.get(entry.AccountId);
          if (prev) {
            // Player existed but had no history changes — use their latest values as baseline
            deltaMap.set(entry.AccountId, {
              position: prev.position,
              rating: prev.rating,
            });
          }
        }
      }
    }

    // UPSERT to player_latest in batches
    for (let i = 0; i < changed.length; i += BATCH_SIZE) {
      const batch = changed.slice(i, i + BATCH_SIZE);
      const values = batch
        .map((e) => {
          const delta = deltaMap.get(e.AccountId);
          const prevPos = delta ? delta.position : "NULL";
          const prevRat = delta ? delta.rating : "NULL";
          return `(${seasonId}, '${sqlEscape(e.AccountId)}', '${sqlEscape(e.Username)}', ${e.Position}, ${e.Rating}, '${sqlEscape(fetchedAt)}', ${prevPos}, ${prevRat})`;
        })
        .join(", ");

      await queryD1({
        sql: `INSERT OR REPLACE INTO player_latest (season_id, account_id, username, position, rating, fetched_at, prev_position_24h, prev_rating_24h) VALUES ${values}`,
      });
    }
    log(`  Upserted ${changed.length} rows to player_latest`);
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
}
```

**Step 5: Update createSnapshot to use status='building'**

Modify `createSnapshot` (line 258-279) to insert with `status = 'building'`:

```typescript
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
```

**Step 6: Add markSnapshotReady function**

```typescript
async function markSnapshotReady(snapshotId: number): Promise<void> {
  await queryD1({
    sql: `UPDATE snapshots SET status = 'ready' WHERE id = ?`,
    params: [snapshotId],
  });
  log(`Snapshot #${snapshotId} marked as ready.`);
}
```

**Step 7: Update main() to use new flow**

Modify the `main()` function (line 488-547). The new flow:

```typescript
async function main(): Promise<void> {
  log("=== Bazaar Leaderboard Fetch Start ===");

  try {
    // 0. Run migrations
    await migrateSchema();

    // 1. Get a valid access token
    const accessToken = await ensureValidToken();

    // 2. Determine which season to fetch
    const seasonId =
      SEASON_ID_OVERRIDE ?? (await detectLatestSeason(accessToken));
    log(`Using season ID: ${seasonId}`);

    // 3. Fetch leaderboard (retry on empty)
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

    // 6. Write to old tables (parallel write phase)
    await storeEntries(snapshotId, entries);

    // 7. Compute metrics from memory
    await computeSnapshotMetricsFromMemory(snapshotId, entries);

    // 8. Sync new player tables
    await syncPlayerTables(snapshotId, seasonId, fetchedAt, entries);

    // 9. Mark snapshot ready
    await markSnapshotReady(snapshotId);

    // 10. Cleanup old seasons
    await cleanupOldSeasons();

    log("=== Bazaar Leaderboard Fetch Complete ===");
  } finally {
    await proactiveRefresh();
  }
}
```

**Step 8: Update cleanupOldSeasons to clean new tables**

Add cleanup for `player_latest` and `player_history` in `cleanupOldSeasons` (line 434-471):

```typescript
// Add after the existing deletes for snapshot_delta_24h, snapshot_metrics, entries, snapshots:
await queryD1({
  sql: `DELETE FROM player_history WHERE season_id IN (${placeholders})`,
  params: seasonsToDelete,
});
await queryD1({
  sql: `DELETE FROM player_latest WHERE season_id IN (${placeholders})`,
  params: seasonsToDelete,
});
```

**Step 9: Remove old computeSnapshotMetrics and computeDelta24h functions**

Delete the old `computeSnapshotMetrics` (line 337-355) and `computeDelta24h` (line 357-396) functions — they are replaced by `computeSnapshotMetricsFromMemory` and the delta logic inside `syncPlayerTables`.

**Step 10: Commit**

```bash
git add scripts/fetch-leaderboard.ts
git commit -m "feat: add player_latest/player_history parallel write to sync"
```

---

### Task 3: Deploy and verify parallel write

**Step 1: Push and verify sync runs**

```bash
git push origin main
```

**Step 2: Wait for next cron sync run (or trigger manually)**

Check that sync completes without error:
```bash
gh run list --workflow=fetch-leaderboard.yml --limit=3
```

**Step 3: Verify data in new tables**

Use the D1 HTTP API or Cloudflare dashboard to confirm:
- `player_latest` has ~35k rows for the current season
- `player_history` has rows (first run will write all 35k as "changed" since table was empty)
- `snapshots` latest row has `status = 'ready'`

---

## Phase 2: API Switchover

### Task 4: Rewrite leaderboard API

**Files:**
- Modify: `functions/api/leaderboard.ts`

**Step 1: Replace entire file with new implementation**

The new leaderboard API is dramatically simpler — a single query on `player_latest`:

```typescript
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
    let total: number;
    let entries;

    type Row = {
      position: number;
      username: string;
      rating: number;
      prev_position_24h: number | null;
      prev_rating_24h: number | null;
    };

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
      // Get total from latest ready snapshot
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

    const mapped = entries.results.map((e) => ({
      position: e.position,
      username: e.username,
      rating: e.rating,
      ratingChange:
        e.prev_rating_24h != null ? e.rating - e.prev_rating_24h : null,
      positionChange:
        e.prev_position_24h != null ? e.prev_position_24h - e.position : null,
    }));

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
```

**Step 2: Commit**

```bash
git add functions/api/leaderboard.ts
git commit -m "refactor: leaderboard API to use player_latest table"
```

---

### Task 5: Rewrite stats API

**Files:**
- Modify: `functions/api/stats.ts`

**Step 1: Replace with new implementation**

```typescript
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
    // Get latest ready snapshot metadata
    const latestSnapshot = await db
      .prepare(
        `SELECT fetched_at, total_entries FROM snapshots
         WHERE season_id = ? AND status = 'ready'
         ORDER BY fetched_at DESC LIMIT 1`
      )
      .bind(seasonId)
      .first<{ fetched_at: string; total_entries: number }>();

    if (!latestSnapshot) {
      return Response.json(
        { error: "No snapshots found for this season" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Top player
    const topPlayer = await db
      .prepare(
        `SELECT username, rating, prev_rating_24h
         FROM player_latest
         WHERE season_id = ?
         ORDER BY position ASC LIMIT 1`
      )
      .bind(seasonId)
      .first<{ username: string; rating: number; prev_rating_24h: number | null }>();

    // Bottom player
    const bottomPlayer = await db
      .prepare(
        `SELECT username, rating, position
         FROM player_latest
         WHERE season_id = ?
         ORDER BY position DESC LIMIT 1`
      )
      .bind(seasonId)
      .first<{ username: string; rating: number; position: number }>();

    // Daily top change
    let dailyTopChange: number | null = null;
    if (topPlayer?.prev_rating_24h != null) {
      dailyTopChange = topPlayer.rating - topPlayer.prev_rating_24h;
    }

    // Biggest gainer
    type MoverRow = { username: string; rating: number; delta: number };
    const biggestGainer = await db
      .prepare(
        `SELECT username, rating, (rating - prev_rating_24h) AS delta
         FROM player_latest
         WHERE season_id = ? AND prev_rating_24h IS NOT NULL
         ORDER BY delta DESC LIMIT 1`
      )
      .bind(seasonId)
      .first<MoverRow>();

    // Biggest loser
    const biggestLoser = await db
      .prepare(
        `SELECT username, rating, (rating - prev_rating_24h) AS delta
         FROM player_latest
         WHERE season_id = ? AND prev_rating_24h IS NOT NULL
         ORDER BY delta ASC LIMIT 1`
      )
      .bind(seasonId)
      .first<MoverRow>();

    // Biggest climber
    const biggestClimber = await db
      .prepare(
        `SELECT username, rating, (prev_position_24h - position) AS positionDelta
         FROM player_latest
         WHERE season_id = ? AND prev_position_24h IS NOT NULL
         ORDER BY positionDelta DESC LIMIT 1`
      )
      .bind(seasonId)
      .first<{ username: string; rating: number; positionDelta: number }>();

    // Available seasons
    const seasonRows = await db
      .prepare("SELECT DISTINCT season_id FROM snapshots WHERE status = 'ready' ORDER BY season_id DESC")
      .all<{ season_id: number }>();
    const availableSeasons = seasonRows.results.map((r) => r.season_id);

    return Response.json(
      {
        seasonId,
        availableSeasons,
        topPlayer: topPlayer ? { username: topPlayer.username, rating: topPlayer.rating } : null,
        bottomPlayer: bottomPlayer ? { username: bottomPlayer.username, rating: bottomPlayer.rating } : null,
        totalEntries: latestSnapshot.total_entries,
        dailyTopChange,
        snapshotTime: latestSnapshot.fetched_at,
        biggestGainer: biggestGainer && biggestGainer.delta > 0
          ? { username: biggestGainer.username, rating: biggestGainer.rating, delta: biggestGainer.delta }
          : null,
        biggestLoser: biggestLoser && biggestLoser.delta < 0
          ? { username: biggestLoser.username, rating: biggestLoser.rating, delta: biggestLoser.delta }
          : null,
        biggestClimber: biggestClimber && biggestClimber.positionDelta > 0
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
```

**Step 2: Commit**

```bash
git add functions/api/stats.ts
git commit -m "refactor: stats API to use player_latest table"
```

---

### Task 6: Rewrite rating-history API

**Files:**
- Modify: `functions/api/rating-history.ts`

**Step 1: Replace with new implementation**

Two-step lookup: username -> account_id via `player_latest`, then query `player_history`:

```typescript
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
    // Resolve username -> account_id
    const player = await db
      .prepare(
        `SELECT account_id FROM player_latest
         WHERE season_id = ? AND username = ?`
      )
      .bind(seasonId, username)
      .first<{ account_id: string }>();

    if (!player) {
      return Response.json(
        { history: [] },
        { headers: corsHeaders }
      );
    }

    // Query history with timestamps from snapshots
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

    return Response.json(
      { history: results.results },
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
```

**Step 2: Commit**

```bash
git add functions/api/rating-history.ts
git commit -m "refactor: rating-history API to use player_history table"
```

---

### Task 7: Update title-rating-history API for status filter

**Files:**
- Modify: `functions/api/title-rating-history.ts`

**Step 1: Add status='ready' filter and remove entries fallback**

The COALESCE fallback to entries subqueries is no longer needed since all snapshots now have metrics computed from memory. Update the query:

```sql
SELECT s.fetched_at AS time,
       m.top10_rating AS top10,
       m.top100_rating AS top100,
       m.top1000_rating AS top1000
FROM snapshots s
JOIN snapshot_metrics m ON m.snapshot_id = s.id
WHERE s.season_id = ? AND s.status = 'ready' AND s.total_entries > 1
ORDER BY s.fetched_at ASC
```

Also update the season detection query to filter by `status = 'ready'`.

**Step 2: Commit**

```bash
git add functions/api/title-rating-history.ts
git commit -m "refactor: title-rating-history to use status filter, remove entries fallback"
```

---

### Task 8: Deploy and validate API switchover

**Step 1: Push all API changes**

```bash
git push origin main
```

**Step 2: Verify APIs work**

Test each endpoint in browser or curl:
- `/api/leaderboard?seasonId=13` — should show entries with deltas
- `/api/leaderboard?seasonId=13&search=test` — search should work
- `/api/leaderboard?seasonId=12` — old season should work (no deltas expected)
- `/api/stats?seasonId=13` — should show stats with movers
- `/api/rating-history?username=<known_player>&seasonId=13` — should return history
- `/api/title-rating-history?seasonId=13` — should return title thresholds

---

## Phase 3: Cleanup

### Task 9: Remove old table writes from sync + drop old tables

**Files:**
- Modify: `scripts/fetch-leaderboard.ts`
- Modify: `schema.sql`

**Step 1: Remove storeEntries call and function from sync**

In `main()`, remove the `await storeEntries(snapshotId, entries)` call.
Delete the `storeEntries`, `buildInsertBatches` functions.
Delete the old `computeSnapshotMetrics` and `computeDelta24h` functions if not already removed.

**Step 2: Remove entries/snapshot_delta_24h cleanup from cleanupOldSeasons**

Remove these lines from `cleanupOldSeasons`:
```typescript
// Delete these:
await queryD1({ sql: `DELETE FROM snapshot_delta_24h WHERE snapshot_id IN (${snapshotFilter})`, ... });
await queryD1({ sql: `DELETE FROM entries WHERE snapshot_id IN (${snapshotFilter})`, ... });
```

**Step 3: Update schema.sql**

Remove the `entries` table and its indexes, and the `snapshot_delta_24h` table. Keep `snapshots`, `snapshot_metrics`, `auth_tokens`, `player_latest`, `player_history`.

Add the `status` column to the snapshots DDL:
```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  total_entries INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
);
```

**Step 4: Update backfill script**

Update `scripts/backfill-derived-tables.ts` to remove references to `entries` table and `snapshot_delta_24h`. The backfill script only needs to handle `snapshot_metrics` now.

**Step 5: Commit and push**

```bash
git add scripts/fetch-leaderboard.ts schema.sql scripts/backfill-derived-tables.ts
git commit -m "cleanup: remove entries table writes and old schema"
git push origin main
```

---

## Verification Checklist

After each phase, verify:

- [ ] Sync workflow completes without errors
- [ ] Leaderboard page loads with correct data
- [ ] Player page shows rating history chart
- [ ] Stats panel shows top player, movers
- [ ] Season selector works for old seasons (metrics/title chart still works)
- [ ] Search functionality works
- [ ] No D1 CPU timeout errors in logs
