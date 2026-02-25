import { Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRatingHistory, fetchTitleRatingHistory } from "@/lib/api";
import type { RatingHistoryPoint } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

interface PredictionResult {
  currentRating: number;
  currentPosition: number;
  targetRating: number;
  ratingGap: number;
  avgGainPerGame: number;
  estimatedGames: number;
  totalGamesPlayed: number;
}

function computePrediction(
  history: RatingHistoryPoint[],
  top1000Rating: number
): PredictionResult | null {
  if (history.length < 2) return null;

  const latest = history[history.length - 1];

  // Find all "steps" where rating changed between consecutive snapshots.
  // Each step ≈ 1 game session (could be multiple games, but best approximation).
  let totalGain = 0;
  let gameCount = 0;

  for (let i = 1; i < history.length; i++) {
    const diff = history[i].rating - history[i - 1].rating;
    if (diff !== 0) {
      totalGain += diff;
      gameCount++;
    }
  }

  if (gameCount === 0) return null;

  const avgGainPerGame = totalGain / gameCount;
  if (avgGainPerGame <= 0) return null;

  const ratingGap = top1000Rating - latest.rating;

  return {
    currentRating: latest.rating,
    currentPosition: latest.position,
    targetRating: top1000Rating,
    ratingGap: Math.max(0, ratingGap),
    avgGainPerGame,
    estimatedGames: ratingGap > 0 ? Math.ceil(ratingGap / avgGainPerGame) : 0,
    totalGamesPlayed: gameCount,
  };
}

export function RatingPrediction({
  username,
  seasonId,
}: {
  username: string;
  seasonId: number;
}) {
  const { data: history, loading: historyLoading } = useFetch(
    () => fetchRatingHistory(username, seasonId),
    [username, seasonId]
  );

  const { data: titleHistory, loading: titleLoading } = useFetch(
    () => fetchTitleRatingHistory(seasonId),
    [seasonId]
  );

  const loading = historyLoading || titleLoading;

  if (loading) {
    return (
      <div className="h-32 rounded-lg bg-card/30 border border-border/40 animate-pulse" />
    );
  }

  if (!history || !titleHistory || history.length < 2) return null;

  // Get latest top-1000 threshold
  const latestTitle = titleHistory[titleHistory.length - 1];
  if (!latestTitle?.top1000) return null;

  const prediction = computePrediction(history, latestTitle.top1000);
  if (!prediction) return null;

  const alreadyIn = prediction.currentPosition <= 1000;

  return (
    <Card className="stat-card">
      <CardContent className="p-4 pt-5">
        <div className="flex items-center gap-2 px-2 mb-4">
          <Target className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            Top 1000 Prediction
          </h3>
        </div>

        {alreadyIn ? (
          <div className="px-2 py-4 text-center">
            <p className="text-lg font-bold text-emerald-500">
              Already in Top 1000!
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Current rank: #{prediction.currentPosition.toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-2">
            <StatBlock
              label="Rating Gap"
              value={`${prediction.ratingGap.toLocaleString()} pts`}
              sub={`Target: ${prediction.targetRating.toLocaleString()}`}
            />
            <StatBlock
              label="Avg Gain / Game"
              value={`+${prediction.avgGainPerGame.toFixed(1)}`}
              sub={`Over ${prediction.totalGamesPlayed} games`}
            />
            <StatBlock
              label="Est. Games Needed"
              value={prediction.estimatedGames.toLocaleString()}
              highlight
            />
            <StatBlock
              label="Current"
              value={`#${prediction.currentPosition.toLocaleString()}`}
              sub={`${prediction.currentRating.toLocaleString()} pts`}
            />
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50 font-mono mt-3 px-2">
          Based on average rating gain per game session this season. Assumes top-1000 threshold stays at {latestTitle.top1000.toLocaleString()}.
        </p>
      </CardContent>
    </Card>
  );
}

function StatBlock({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <p
        className={`text-lg font-bold font-mono tabular-nums ${
          highlight ? "text-amber-500" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] font-mono text-muted-foreground/60">{sub}</p>
      )}
    </div>
  );
}
