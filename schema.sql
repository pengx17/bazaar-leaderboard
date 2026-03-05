CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  total_entries INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
);

CREATE INDEX IF NOT EXISTS idx_snapshots_season ON snapshots(season_id, fetched_at);

-- Precomputed per-snapshot title boundary ratings
CREATE TABLE IF NOT EXISTS snapshot_metrics (
  snapshot_id INTEGER PRIMARY KEY REFERENCES snapshots(id),
  top1_rating INTEGER,
  top10_rating INTEGER,
  top100_rating INTEGER,
  top1000_rating INTEGER
);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY DEFAULT 1,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
