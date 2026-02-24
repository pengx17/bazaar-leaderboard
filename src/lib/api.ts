const API_BASE = "/api";

export interface StatsData {
  seasonId: number;
  availableSeasons: number[];
  topPlayer: { username: string; rating: number } | null;
  bottomPlayer: { username: string; rating: number } | null;
  totalEntries: number;
  dailyTopChange: number | null;
  snapshotTime: string;
}

export interface RatingHistoryPoint {
  time: string;
  rating: number;
  position: number;
}

export interface TitleRatingHistoryPoint {
  time: string;
  top10: number | null;
  top100: number | null;
  top1000: number | null;
}

export interface LeaderboardEntry {
  position: number;
  username: string;
  rating: number;
}

export interface LeaderboardData {
  seasonId: number;
  total: number;
  entries: LeaderboardEntry[];
}

export async function fetchLeaderboard(opts: {
  seasonId?: number;
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<LeaderboardData> {
  const params = new URLSearchParams();
  if (opts.seasonId != null) params.set("seasonId", String(opts.seasonId));
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  if (opts.search) params.set("search", opts.search);
  const res = await fetch(`${API_BASE}/leaderboard?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch leaderboard: ${res.status}`);
  return res.json();
}

export async function fetchStats(seasonId?: number): Promise<StatsData> {
  const params = seasonId != null ? `?seasonId=${seasonId}` : "";
  const res = await fetch(`${API_BASE}/stats${params}`);
  if (!res.ok) throw new Error(`Failed to fetch stats: ${res.status}`);
  return res.json();
}

export async function fetchRatingHistory(
  username: string,
  seasonId: number
): Promise<RatingHistoryPoint[]> {
  const res = await fetch(
    `${API_BASE}/rating-history?username=${encodeURIComponent(username)}&seasonId=${seasonId}`
  );
  if (!res.ok) throw new Error(`Failed to fetch rating history: ${res.status}`);
  const data = await res.json();
  return data.history;
}

export async function fetchTitleRatingHistory(
  seasonId: number
): Promise<TitleRatingHistoryPoint[]> {
  const res = await fetch(
    `${API_BASE}/title-rating-history?seasonId=${seasonId}`
  );
  if (!res.ok)
    throw new Error(`Failed to fetch title rating history: ${res.status}`);
  const data = await res.json();
  return data.history;
}
