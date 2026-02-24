-- Seed data for local testing
-- Two snapshots: one "now" and one "24h ago"

INSERT INTO snapshots (id, season_id, fetched_at, total_entries) VALUES
  (1, 5, datetime('now', '-24 hours'), 35000),
  (2, 5, datetime('now', '-12 hours'), 35200),
  (3, 5, datetime('now'), 35400);

-- Snapshot 1 (24h ago) - top players
INSERT INTO entries (snapshot_id, account_id, username, position, rating) VALUES
  (1, 'a1', 'DragonSlayer', 1, 4800),
  (1, 'a2', 'MerchantKing', 2, 4750),
  (1, 'a3', 'BazaarBoss', 3, 4700),
  (1, 'a4', 'GoldHoarder', 4, 4650),
  (1, 'a5', 'SpiceMaster', 5, 4600),
  (1, 'a6', 'SilkTrader', 6, 4550),
  (1, 'a7', 'RuneForger', 7, 4500),
  (1, 'a8', 'StormCaller', 8, 4450),
  (1, 'a9', 'NightBlade', 9, 4400),
  (1, 'a10', 'IronWill', 10, 4350),
  (1, 'a50', 'Player50', 50, 3800),
  (1, 'a100', 'Player100', 100, 3500),
  (1, 'a500', 'Player500', 500, 2800),
  (1, 'a1000', 'Player1000', 1000, 2200),
  (1, 'a35000', 'LastPlace', 35000, 1000);

-- Snapshot 2 (12h ago)
INSERT INTO entries (snapshot_id, account_id, username, position, rating) VALUES
  (2, 'a1', 'DragonSlayer', 1, 4850),
  (2, 'a2', 'MerchantKing', 2, 4770),
  (2, 'a3', 'BazaarBoss', 3, 4720),
  (2, 'a4', 'GoldHoarder', 4, 4660),
  (2, 'a5', 'SpiceMaster', 5, 4610),
  (2, 'a6', 'SilkTrader', 6, 4560),
  (2, 'a7', 'RuneForger', 7, 4510),
  (2, 'a8', 'StormCaller', 8, 4460),
  (2, 'a9', 'NightBlade', 9, 4420),
  (2, 'a10', 'IronWill', 10, 4380),
  (2, 'a50', 'Player50', 50, 3820),
  (2, 'a100', 'Player100', 100, 3520),
  (2, 'a500', 'Player500', 500, 2820),
  (2, 'a1000', 'Player1000', 1000, 2220),
  (2, 'a35200', 'NewLastPlace', 35200, 980);

-- Snapshot 3 (now)
INSERT INTO entries (snapshot_id, account_id, username, position, rating) VALUES
  (3, 'a1', 'DragonSlayer', 1, 4920),
  (3, 'a2', 'MerchantKing', 2, 4800),
  (3, 'a3', 'BazaarBoss', 3, 4740),
  (3, 'a4', 'GoldHoarder', 4, 4680),
  (3, 'a5', 'SpiceMaster', 5, 4630),
  (3, 'a6', 'SilkTrader', 6, 4580),
  (3, 'a7', 'RuneForger', 7, 4520),
  (3, 'a8', 'StormCaller', 8, 4470),
  (3, 'a9', 'NightBlade', 9, 4430),
  (3, 'a10', 'IronWill', 10, 4400),
  (3, 'a50', 'Player50', 50, 3850),
  (3, 'a100', 'Player100', 100, 3550),
  (3, 'a500', 'Player500', 500, 2850),
  (3, 'a1000', 'Player1000', 1000, 2250),
  (3, 'a35400', 'BottomPlayer', 35400, 960);
