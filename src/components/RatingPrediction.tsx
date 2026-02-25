import { Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRatingHistory, fetchTitleRatingHistory } from "@/lib/api";
import type { RatingHistoryPoint } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

/**
 * Rating formula:
 *   Non-10-win: ΔR = 5(W − R/100)
 *   10-win:     ΔR = 5(W − R/100) + 5
 *
 * From a rating change ΔR at rating R, we can back-calculate wins:
 *   W = ΔR/5 + R/100  (if W ≤ 10)
 *   W = (ΔR−5)/5 + R/100  (if 10-win)
 */

interface GameSession {
  wins: number;
  is10Win: boolean;
}

interface PredictionResult {
  currentRating: number;
  currentPosition: number;
  targetRating: number;
  ratingGap: number;
  equilibriumRating: number;
  estimatedGames: number | null; // null = can't reach
  totalGamesPlayed: number;
  avgWins: number;
  tenWinRate: number;
}

function extractGameSessions(history: RatingHistoryPoint[]): GameSession[] {
  const sessions: GameSession[] = [];
  for (let i = 1; i < history.length; i++) {
    const dr = history[i].rating - history[i - 1].rating;
    const r = history[i - 1].rating;
    if (dr === 0) continue;

    const wRaw = dr / 5 + r / 100;
    const is10Win = wRaw > 10;
    const wins = is10Win ? (dr - 5) / 5 + r / 100 : wRaw;
    sessions.push({ wins, is10Win });
  }
  return sessions;
}

function computePrediction(
  history: RatingHistoryPoint[],
  top1000Rating: number
): PredictionResult | null {
  if (history.length < 2) return null;

  const latest = history[history.length - 1];
  const sessions = extractGameSessions(history);
  if (sessions.length === 0) return null;

  // Use the most recent 30 sessions to reflect current skill level,
  // rather than a rating threshold which mixes in older, weaker play.
  const RECENT_COUNT = 30;
  const gameSessions =
    sessions.length > RECENT_COUNT
      ? sessions.slice(-RECENT_COUNT)
      : sessions;

  const avgWins =
    gameSessions.reduce((s, g) => s + g.wins, 0) / gameSessions.length;
  const tenWinRate =
    gameSessions.filter((g) => g.is10Win).length / gameSessions.length;

  // Equilibrium: E[ΔR] = 0 when 5(avgW − R/100) + 5·p10 = 0
  // => R_eq = 100·avgW + 100·p10
  const equilibriumRating = Math.round(100 * avgWins + 100 * tenWinRate);

  const ratingGap = Math.max(0, top1000Rating - latest.rating);

  // Simulate from current rating using per-game W distribution
  let estimatedGames: number | null = null;
  if (latest.position <= 1000 || ratingGap === 0) {
    estimatedGames = 0;
  } else {
    let r = latest.rating;
    let games = 0;
    const maxGames = 2000;
    while (r < top1000Rating && games < maxGames) {
      // Expected ΔR using the actual W distribution
      let totalDr = 0;
      for (const g of gameSessions) {
        totalDr += 5 * (g.wins - r / 100) + (g.is10Win ? 5 : 0);
      }
      const expectedDr = totalDr / gameSessions.length;
      if (expectedDr <= 0.05) {
        // Rating stalls before reaching target
        estimatedGames = null;
        break;
      }
      r += expectedDr;
      games++;
    }
    if (r >= top1000Rating) {
      estimatedGames = games;
    }
  }

  return {
    currentRating: latest.rating,
    currentPosition: latest.position,
    targetRating: top1000Rating,
    ratingGap,
    equilibriumRating,
    estimatedGames,
    totalGamesPlayed: sessions.length,
    avgWins,
    tenWinRate,
  };
}

export function RatingPrediction({
  username,
  seasonId,
}: {
  username: string;
  seasonId: number;
}) {
  const { t } = useTranslation();
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

  const insufficientHistory =
    !history || !titleHistory || history.length < 2;
  const latestTitle = insufficientHistory
    ? null
    : titleHistory[titleHistory.length - 1];
  const noThreshold = !insufficientHistory && !latestTitle?.top1000;
  const prediction =
    latestTitle?.top1000 != null
      ? computePrediction(history!, latestTitle.top1000)
      : null;

  const alreadyIn = prediction != null && prediction.currentPosition <= 1000;

  return (
    <Card className="stat-card">
      <CardContent className="p-4 pt-5">
        <div className="flex items-center gap-2 px-2 mb-4">
          <Target className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            {t("prediction.heading")}
          </h3>
        </div>

        {insufficientHistory || noThreshold || !prediction ? (
          <div className="px-2 py-4 text-center">
            <p className="text-xs text-muted-foreground font-mono">
              {insufficientHistory
                ? t("prediction.noHistory")
                : t("prediction.noThreshold")}
            </p>
          </div>
        ) : alreadyIn ? (
          <div className="px-2 py-4 text-center">
            <p className="text-lg font-bold text-emerald-500">
              {t("prediction.alreadyIn")}
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {t("prediction.currentRank", { rank: prediction.currentPosition.toLocaleString() })}
            </p>
          </div>
        ) : prediction.estimatedGames != null ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-2">
            <StatBlock
              label={t("prediction.ratingGap")}
              value={`${prediction.ratingGap.toLocaleString()} pts`}
              sub={t("prediction.target", { target: prediction.targetRating.toLocaleString() })}
            />
            <StatBlock
              label={t("prediction.avgWins")}
              value={prediction.avgWins.toFixed(1)}
              sub={t("prediction.tenWinRate", { rate: (prediction.tenWinRate * 100).toFixed(0) })}
            />
            <StatBlock
              label={t("prediction.estGames")}
              value={prediction.estimatedGames.toLocaleString()}
              highlight
            />
            <StatBlock
              label={t("prediction.equilibrium")}
              value={prediction.equilibriumRating.toLocaleString()}
              sub={t("prediction.equilibriumSub")}
            />
          </div>
        ) : (
          <div className="px-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <StatBlock
                label={t("prediction.ratingGap")}
                value={`${prediction.ratingGap.toLocaleString()} pts`}
                sub={t("prediction.target", { target: prediction.targetRating.toLocaleString() })}
              />
              <StatBlock
                label={t("prediction.avgWins")}
                value={prediction.avgWins.toFixed(1)}
                sub={t("prediction.tenWinRate", { rate: (prediction.tenWinRate * 100).toFixed(0) })}
              />
              <StatBlock
                label={t("prediction.equilibrium")}
                value={prediction.equilibriumRating.toLocaleString()}
                sub={t("prediction.equilibriumSub")}
              />
              <StatBlock
                label={t("prediction.needAvgWins")}
                value={`>${(prediction.targetRating / 100).toFixed(1)}`}
                sub={t("prediction.needAvgWinsSub")}
                highlight
              />
            </div>
            <p className="text-xs text-amber-500/80 font-mono">
              {t("prediction.stallWarning", { rating: prediction.equilibriumRating.toLocaleString() })}
            </p>
          </div>
        )}

        {prediction && latestTitle?.top1000 != null && (
          <p className="text-[10px] text-muted-foreground/50 font-mono mt-3 px-2">
            {t("prediction.formula")}{" "}
            {prediction.tenWinRate > 0 && t("prediction.formula10win")}.{" "}
            {t("prediction.basedOn", { count: prediction.totalGamesPlayed })}{" "}
            {t("prediction.assumesThreshold", { threshold: latestTitle.top1000.toLocaleString() })}
          </p>
        )}
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
