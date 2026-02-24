const API_BASE = "/api";

export interface StatsData {
  seasonId: number;
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
  seasonId: number,
  days = 7
): Promise<TitleRatingHistoryPoint[]> {
  const res = await fetch(
    `${API_BASE}/title-rating-history?seasonId=${seasonId}&days=${days}`
  );
  if (!res.ok)
    throw new Error(`Failed to fetch title rating history: ${res.status}`);
  const data = await res.json();
  return data.history;
}
