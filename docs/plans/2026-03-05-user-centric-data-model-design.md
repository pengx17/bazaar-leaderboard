# User-Centric Data Model Refactor

## Problem

Every 30-min sync stores the full 35k-entry leaderboard in the `entries` table, causing:

- Rapid D1 storage growth (1.68M rows/day), entries table too large for index creation
- Expensive cross-snapshot JOINs in API queries (D1 CPU timeouts)
- Massive redundancy (most players unchanged between syncs)

## New Table Structure

```sql
-- Kept: lightweight time index + sync metadata
-- Added: status column to prevent reading partial writes
snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  total_entries INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'building'  -- 'building' | 'ready'
)

-- Kept: attached to snapshot_id
snapshot_metrics (
  snapshot_id INTEGER PRIMARY KEY REFERENCES snapshots(id),
  top1_rating INTEGER,
  top10_rating INTEGER,
  top100_rating INTEGER,
  top1000_rating INTEGER
)

-- New: current full leaderboard (upsert changes + delete delisted)
-- Includes precomputed 24h delta fields
player_latest (
  season_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  position INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  prev_position_24h INTEGER,  -- precomputed by sync
  prev_rating_24h INTEGER,    -- precomputed by sync
  PRIMARY KEY (season_id, account_id)
)
CREATE INDEX idx_player_latest_position ON player_latest(season_id, position);
CREATE INDEX idx_player_latest_username ON player_latest(season_id, username);

-- New: change history (append-only, only rows where something changed)
-- PK uses snapshot_id (not fetched_at) for precision and dedup safety
player_history (
  season_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  username TEXT NOT NULL,
  position INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  PRIMARY KEY (season_id, account_id, snapshot_id)
)

-- Removed: entries, snapshot_delta_24h
```

## Sync Flow

```
 1. Fetch leaderboard -> 35k entries (in memory)
 2. Dedup by account_id (keep lowest position on collision)
 3. CREATE snapshot record with status='building'
 4. Compute snapshot_metrics from in-memory data
 5. Read player_latest(season_id) -> Map<account_id, {username, rating, position}>
 6. Compare: find rows where rating OR position OR username changed
 7. For each changed/new player, query player_history for their 24h-ago baseline
 8. Batch INSERT changed rows to player_history
 9. Batch UPSERT changed rows to player_latest (including prev_*_24h fields)
10. DELETE player_latest rows for account_ids not in current fetch (delisted)
11. UPDATE snapshot status='ready'
12. Cleanup old season data
```

### Change Detection

A row is written to `player_history` and upserted to `player_latest` when ANY of:
- `rating` differs from last known value
- `position` differs from last known value
- `username` differs from last known value (rename detection)

### Account ID Dedup

Before processing, deduplicate the fetched entries by `account_id`:
- If duplicate account_ids exist, keep the entry with the lowest `position`
- This protects against upstream dirty data

### 24h Delta Precomputation

Stored directly in `player_latest.prev_position_24h` and `prev_rating_24h`.
Computed during sync by querying `player_history`:

```sql
SELECT position, rating FROM player_history
WHERE account_id = ? AND season_id = ?
  AND snapshot_id <= (
    SELECT id FROM snapshots
    WHERE season_id = ? AND fetched_at <= datetime(?, '-1 day')
    ORDER BY fetched_at DESC LIMIT 1
  )
ORDER BY snapshot_id DESC LIMIT 1
```

For players with no history entry in the 24h window (unchanged for >24h),
fall back to the value in `player_latest` itself (they haven't changed).

### Snapshot Status

- `snapshots.status = 'building'` during multi-step write
- `snapshots.status = 'ready'` after all writes complete
- All API queries filter `WHERE status = 'ready'`
- Prevents reading half-written state on sync failure

## API Changes

| API | Current | After |
|---|---|---|
| `/leaderboard` | entries + snapshot JOIN + delta JOIN | SELECT from player_latest (delta fields included) |
| `/leaderboard?search=X` | entries LIKE + JOIN | player_latest WHERE username LIKE ? |
| `/rating-history` | entries JOIN snapshots (full table scan) | player_history WHERE account_id = ? |
| `/title-rating-history` | snapshot_metrics (unchanged) | unchanged |
| `/stats` | entries + complex delta queries | player_latest + simple aggregates |

### Leaderboard API

Becomes trivial:
```sql
SELECT username, position, rating, prev_position_24h, prev_rating_24h
FROM player_latest
WHERE season_id = ?
ORDER BY position ASC
LIMIT ? OFFSET ?
```

### Rating History API

Two-step lookup (username -> account_id -> history):
```sql
-- Step 1: resolve account_id
SELECT account_id FROM player_latest
WHERE season_id = ? AND username = ?

-- Step 2: get history with timestamps from snapshots
SELECT s.fetched_at AS time, h.rating, h.position
FROM player_history h
JOIN snapshots s ON s.id = h.snapshot_id
WHERE h.account_id = ? AND h.season_id = ?
ORDER BY h.snapshot_id ASC
```

Note: frontend already does forward-fill for sparse data points.

### Stats API

```sql
-- Top player
SELECT username, rating, prev_rating_24h FROM player_latest
WHERE season_id = ? ORDER BY position ASC LIMIT 1

-- Biggest gainer (precomputed delta available in latest)
SELECT username, rating, (rating - prev_rating_24h) AS delta
FROM player_latest
WHERE season_id = ? AND prev_rating_24h IS NOT NULL
ORDER BY delta DESC LIMIT 1
```

## Migration Strategy

1. **Phase 1 - Parallel write**: Sync writes to both old (entries) and new (player_latest + player_history) tables
2. **Phase 2 - API switchover**: Switch API endpoints to new tables
3. **Phase 3 - Cleanup**: Drop entries and snapshot_delta_24h tables
4. Old season player_history NOT migrated from entries (D1 OOM risk); old seasons will only have snapshot_metrics

## Out of Scope

- Frontend changes (API response format stays the same)
- Downsampling (get incremental write benefits first)
- Old season entries -> player_history migration (D1 large table ops unreliable)
- Changing sync interval (do after this refactor stabilizes)
