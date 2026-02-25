import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRatingHistory } from "@/lib/api";
import type { RatingHistoryPoint } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useTheme } from "@/lib/theme";
import { getChartTheme } from "@/lib/chart-theme";

interface RatingChartProps {
  username: string;
  seasonId: number;
}

interface GameSession {
  wins: number;
  is10Win: boolean;
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

function buildPredictionCurve(history: RatingHistoryPoint[]): { times: string[]; ratings: number[] } | null {
  if (history.length < 2) return null;

  const sessions = extractGameSessions(history);
  const MIN_SESSIONS = 10;
  if (sessions.length < MIN_SESSIONS) return null;

  const RECENT_COUNT = 30;
  const gameSessions = sessions.length > RECENT_COUNT ? sessions.slice(-RECENT_COUNT) : sessions;

  const avgWins = gameSessions.reduce((s, g) => s + g.wins, 0) / gameSessions.length;
  const tenWinRate = gameSessions.filter((g) => g.is10Win).length / gameSessions.length;

  const latest = history[history.length - 1];
  let r = latest.rating;

  // Estimate average time between data points (use last 20 points)
  const recentHistory = history.slice(-20);
  const avgIntervalMs =
    recentHistory.length > 1
      ? (new Date(recentHistory[recentHistory.length - 1].time).getTime() -
          new Date(recentHistory[0].time).getTime()) /
        (recentHistory.length - 1)
      : 30 * 60 * 1000;

  const times: string[] = [];
  const ratings: number[] = [];
  let currentTime = new Date(latest.time).getTime();

  // Simulate up to 200 steps
  for (let step = 0; step < 200; step++) {
    let totalDr = 0;
    for (const g of gameSessions) {
      totalDr += 5 * (g.wins - r / 100) + (g.is10Win ? 5 : 0);
    }
    const expectedDr = totalDr / gameSessions.length;
    if (Math.abs(expectedDr) < 0.1) break; // reached equilibrium

    r += expectedDr;
    currentTime += avgIntervalMs;
    times.push(new Date(currentTime).toISOString());
    ratings.push(Math.round(r));
  }

  if (times.length === 0) return null;

  // Compute equilibrium rating
  const equilibrium = Math.round(100 * avgWins + 100 * tenWinRate);
  // Add one final point at equilibrium if we converged
  if (Math.abs(ratings[ratings.length - 1] - equilibrium) < 5) {
    currentTime += avgIntervalMs;
    times.push(new Date(currentTime).toISOString());
    ratings.push(equilibrium);
  }

  return { times, ratings };
}

export function RatingChart({ username, seasonId }: RatingChartProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const ct = getChartTheme(theme);
  const {
    data,
    loading,
    error,
  } = useFetch(() => fetchRatingHistory(username, seasonId), [username, seasonId]);

  if (loading) {
    return (
      <Card className="stat-card">
        <CardContent className="p-6">
          <div className="h-80 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="stat-card">
        <CardContent className="p-6 text-center text-red-400">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="stat-card">
        <CardContent className="p-6 text-center text-muted-foreground">
          {t("chart.noData", { username })}
        </CardContent>
      </Card>
    );
  }

  const prediction = useMemo(() => buildPredictionCurve(data), [data]);

  // Merge actual + predicted time axis
  const actualTimes = data.map((d) => d.time);
  const allTimes = prediction
    ? [...actualTimes, ...prediction.times]
    : actualTimes;

  const ratings = data.map((d) => d.rating);
  const positions = data.map((d) => d.position);

  // Build prediction series data: null for actual range, then predicted values
  // Overlap by 1 point so the lines connect
  const predRatings: (number | null)[] = prediction
    ? [
        ...new Array(actualTimes.length - 1).fill(null),
        ratings[ratings.length - 1], // connection point
        ...prediction.ratings,
      ]
    : [];

  // Compute axis ranges including prediction
  const allRatings = prediction
    ? [...ratings, ...prediction.ratings]
    : ratings;
  const ratingMin = Math.min(...allRatings);
  const ratingMax = Math.max(...allRatings);
  const ratingPad = Math.max(Math.round((ratingMax - ratingMin) * 0.1), 5);

  const posMin = Math.min(...positions);
  const posMax = Math.max(...positions);
  const posPad = Math.max(Math.round((posMax - posMin) * 0.1), 1);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: ct.tooltipBg,
      borderColor: ct.tooltipBorder,
      textStyle: {
        color: ct.tooltipText,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 12,
      },
      formatter: (params: Array<{ seriesName: string; value: number | null; axisValueLabel: string }>) => {
        const time = new Date(params[0].axisValueLabel).toLocaleString();
        let html = `<div style="font-size:11px;color:${ct.tooltipSecondary};margin-bottom:4px">${time}</div>`;
        for (const p of params) {
          if (p.value == null) continue;
          const isPrediction = p.seriesName === t("chart.prediction");
          const color = isPrediction
            ? ct.ratingAxis
            : p.seriesName === t("chart.rating")
              ? ct.ratingAxis
              : ct.positionAxis;
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};opacity:${isPrediction ? 0.5 : 1}"></span>
            <span>${p.seriesName}:</span>
            <strong>${p.value.toLocaleString()}</strong>
          </div>`;
        }
        return html;
      },
    },
    grid: {
      left: 60,
      right: 60,
      top: 40,
      bottom: 30,
    },
    xAxis: {
      type: "category" as const,
      data: allTimes,
      axisLabel: {
        color: ct.axisLabel,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        formatter: (value: string) => {
          const d = new Date(value);
          return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        },
      },
      axisLine: { lineStyle: { color: ct.axisLine } },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: "value" as const,
        name: t("chart.rating"),
        min: ratingMin - ratingPad,
        max: ratingMax + ratingPad,
        nameTextStyle: {
          color: ct.ratingAxis,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
        },
        axisLabel: {
          color: ct.ratingAxis,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
        },
        splitLine: {
          lineStyle: { color: ct.ratingSplitLine },
        },
      },
      {
        type: "value" as const,
        name: t("chart.rank"),
        min: Math.max(1, posMin - posPad),
        max: posMax + posPad,
        nameTextStyle: {
          color: ct.positionAxis,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
        },
        axisLabel: {
          color: ct.positionAxis,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
        },
        inverse: true,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: t("chart.rating"),
        type: "line",
        data: ratings,
        yAxisIndex: 0,
        smooth: true,
        symbol: "none",
        lineStyle: {
          color: ct.ratingAxis,
          width: 2,
        },
        areaStyle: {
          color: {
            type: "linear" as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: ct.ratingAxis + "26" },
              { offset: 1, color: ct.ratingAxis + "00" },
            ],
          },
        },
      },
      {
        name: t("chart.position"),
        type: "line",
        data: positions,
        yAxisIndex: 1,
        smooth: true,
        symbol: "none",
        lineStyle: {
          color: ct.positionAxis,
          width: 2,
          type: "dashed" as const,
        },
      },
      ...(prediction
        ? [
            {
              name: t("chart.prediction"),
              type: "line" as const,
              data: predRatings,
              yAxisIndex: 0,
              smooth: true,
              symbol: "none" as const,
              lineStyle: {
                color: ct.ratingAxis,
                width: 2,
                type: "dotted" as const,
                opacity: 0.5,
              },
              connectNulls: false,
            },
          ]
        : []),
    ],
  };

  return (
    <Card className="stat-card">
      <CardContent className="p-4 pt-5">
        <div className="flex items-baseline gap-3 mb-4 px-2">
          <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            {t("chart.playerTracking")}
          </h3>
          <span className="text-base font-bold text-foreground">{username}</span>
        </div>
        <ReactECharts
          option={option}
          style={{ height: 360 }}
          opts={{ renderer: "svg" }}
        />
      </CardContent>
    </Card>
  );
}
