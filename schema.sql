CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  total_entries INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_season ON snapshots(season_id, fetched_at);

CREATE TABLE IF NOT EXISTS entries (
  snapshot_id INTEGER NOT NULL REFERENCES snapshots(id),
  account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  position INTEGER NOT NULL,
  rating INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_snapshot ON entries(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_entries_username ON entries(username, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_entries_position ON entries(snapshot_id, position);

-- Precomputed per-snapshot title boundary ratings
CREATE TABLE IF NOT EXISTS snapshot_metrics (
  snapshot_id INTEGER PRIMARY KEY REFERENCES snapshots(id),
  top1_rating INTEGER,
  top10_rating INTEGER,
  top100_rating INTEGER,
  top1000_rating INTEGER
);

-- Precomputed 24h deltas (baseline values for players present in both snapshots)
CREATE TABLE IF NOT EXISTS snapshot_delta_24h (
  snapshot_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  prev_position INTEGER NOT NULL,
  prev_rating INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, username)
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
