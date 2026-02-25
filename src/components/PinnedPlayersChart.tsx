import { useState, useEffect, useReducer } from "react";
import ReactECharts from "echarts-for-react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRatingHistory } from "@/lib/api";
import type { RatingHistoryPoint } from "@/lib/api";
import { usePinnedPlayers } from "@/lib/pinned-players";
import { PinButton } from "@/components/PinButton";
import { useTheme } from "@/lib/theme";
import { getChartTheme } from "@/lib/chart-theme";

const PLAYER_COLORS = [
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ef4444", // red
  "#22c55e", // green
];

interface PlayerData {
  username: string;
  history: RatingHistoryPoint[];
}

interface State {
  players: PlayerData[];
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: "loading" }
  | { type: "success"; players: PlayerData[] }
  | { type: "error"; error: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "loading":
      return { ...state, loading: true, error: null };
    case "success":
      return { players: action.players, loading: false, error: null };
    case "error":
      return { ...state, loading: false, error: action.error };
  }
}

type Metric = "rating" | "rank";

export function PinnedPlayersChart({ seasonId }: { seasonId: number }) {
  const { t } = useTranslation();
  const { pinned, clear } = usePinnedPlayers();
  const { theme } = useTheme();
  const ct = getChartTheme(theme);
  const [metric, setMetric] = useState<Metric>("rating");

  const [state, dispatch] = useReducer(reducer, {
    players: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (pinned.length === 0) {
      dispatch({ type: "success", players: [] });
      return;
    }

    let cancelled = false;
    dispatch({ type: "loading" });

    Promise.all(
      pinned.map(async (username) => {
        const history = await fetchRatingHistory(username, seasonId);
        return { username, history };
      })
    )
      .then((players) => {
        if (!cancelled) dispatch({ type: "success", players });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          dispatch({
            type: "error",
            error: e instanceof Error ? e.message : "Unknown error",
          });
      });

    return () => {
      cancelled = true;
    };
  }, [pinned.join(","), seasonId]);

  if (pinned.length === 0) return null;

  if (state.loading && state.players.length === 0) {
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

  if (state.error) {
    return (
      <Card className="stat-card">
        <CardContent className="p-6 text-center text-red-400">
          {state.error}
        </CardContent>
      </Card>
    );
  }

  // Collect all unique times across all players for the x-axis
  const timeSet = new Set<string>();
  for (const p of state.players) {
    for (const h of p.history) timeSet.add(h.time);
  }
  const times = [...timeSet].sort();

  // Build series: for each player, map values to the unified time axis
  const isRank = metric === "rank";
  const allValues: number[] = [];
  const series = state.players.map((p, i) => {
    const valueByTime = new Map(
      p.history.map((h) => [h.time, isRank ? h.position : h.rating])
    );
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const data = times.map((t) => valueByTime.get(t) ?? null);
    for (const v of data) if (v != null) allValues.push(v);
    return {
      name: p.username,
      type: "line" as const,
      data,
      smooth: true,
      symbol: "none",
      connectNulls: true,
      lineStyle: { color, width: 2 },
    };
  });

  // Compute axis range with ~10% padding
  const valMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const valMax = allValues.length > 0 ? Math.max(...allValues) : 100;
  const valPad = Math.max(Math.round((valMax - valMin) * 0.1), 1);

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
      formatter: (
        params: Array<{
          seriesName: string;
          value: number | null;
          axisValueLabel: string;
          color: string;
        }>
      ) => {
        const time = new Date(params[0].axisValueLabel).toLocaleString();
        let html = `<div style="font-size:11px;color:${ct.tooltipSecondary};margin-bottom:4px">${time}</div>`;
        for (const p of params) {
          if (p.value == null) continue;
          const display = isRank ? `#${p.value.toLocaleString()}` : p.value.toLocaleString();
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:2px;background:${p.color}"></span>
            <span>${p.seriesName}:</span>
            <strong>${display}</strong>
          </div>`;
        }
        return html;
      },
    },
    legend: {
      data: state.players.map((p) => p.username),
      top: 4,
      right: 8,
      textStyle: {
        color: ct.axisLabel,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
      },
      itemWidth: 16,
      itemHeight: 2,
    },
    grid: {
      left: 60,
      right: 16,
      top: 40,
      bottom: 30,
    },
    xAxis: {
      type: "category" as const,
      data: times,
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
    yAxis: {
      type: "value" as const,
      name: isRank ? t("chart.rank") : t("chart.rating"),
      inverse: isRank,
      min: isRank ? Math.max(1, valMin - valPad) : valMin - valPad,
      max: valMax + valPad,
      nameTextStyle: {
        color: ct.axisLabel,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
      },
      axisLabel: {
        color: ct.axisLabel,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      splitLine: {
        lineStyle: { color: ct.splitLine },
      },
    },
    series,
  };

  return (
    <Card className="stat-card">
      <CardContent className="p-4 pt-5">
        <div className="flex items-center justify-between px-2 mb-4">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                {t("pinned.heading")}
              </h3>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {isRank ? t("pinned.rankHistory") : t("pinned.ratingHistory")}
              </p>
            </div>
            {/* Rating / Rank toggle */}
            <div className="flex items-center rounded-md border border-border/40 overflow-hidden">
              {(["rating", "rank"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-2.5 py-1 text-xs font-mono transition-colors ${
                    metric === m
                      ? "bg-amber-500/15 text-amber-500 font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/80"
                  }`}
                >
                  {m === "rating" ? t("chart.rating") : t("chart.rank")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Pinned player chips with unpin */}
            <div className="flex items-center gap-1">
              {pinned.map((username, i) => (
                <span
                  key={username}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border border-border/40"
                  style={{ color: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                >
                  {username}
                  <PinButton username={username} size="sm" />
                </span>
              ))}
            </div>
            <button
              onClick={clear}
              title={t("pinned.clearAll")}
              className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
