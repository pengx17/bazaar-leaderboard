import ReactECharts from "echarts-for-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRatingHistory } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

interface RatingChartProps {
  username: string;
  seasonId: number;
}

export function RatingChart({ username, seasonId }: RatingChartProps) {
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
          No data found for "{username}"
        </CardContent>
      </Card>
    );
  }

  const times = data.map((d) => d.time);
  const ratings = data.map((d) => d.rating);
  const positions = data.map((d) => d.position);

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis" as const,
      backgroundColor: "rgba(10, 10, 10, 0.95)",
      borderColor: "rgba(245, 158, 11, 0.2)",
      textStyle: {
        color: "#e5e5e5",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 12,
      },
      formatter: (params: Array<{ seriesName: string; value: number; axisValueLabel: string }>) => {
        const time = new Date(params[0].axisValueLabel).toLocaleString();
        let html = `<div style="font-size:11px;color:#888;margin-bottom:4px">${time}</div>`;
        for (const p of params) {
          const color = p.seriesName === "Rating" ? "#f59e0b" : "#6ee7b7";
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${color}"></span>
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
      data: times,
      axisLabel: {
        color: "#666",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        formatter: (value: string) => {
          const d = new Date(value);
          return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        },
      },
      axisLine: { lineStyle: { color: "#333" } },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: "value" as const,
        name: "Rating",
        nameTextStyle: {
          color: "#f59e0b",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
        },
        axisLabel: {
          color: "#f59e0b",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
        },
        splitLine: {
          lineStyle: { color: "rgba(245, 158, 11, 0.06)" },
        },
      },
      {
        type: "value" as const,
        name: "Position",
        nameTextStyle: {
          color: "#6ee7b7",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
        },
        axisLabel: {
          color: "#6ee7b7",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
        },
        inverse: true,
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Rating",
        type: "line",
        data: ratings,
        yAxisIndex: 0,
        smooth: true,
        symbol: "none",
        lineStyle: {
          color: "#f59e0b",
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
              { offset: 0, color: "rgba(245, 158, 11, 0.15)" },
              { offset: 1, color: "rgba(245, 158, 11, 0)" },
            ],
          },
        },
      },
      {
        name: "Position",
        type: "line",
        data: positions,
        yAxisIndex: 1,
        smooth: true,
        symbol: "none",
        lineStyle: {
          color: "#6ee7b7",
          width: 2,
          type: "dashed" as const,
        },
      },
    ],
  };

  return (
    <Card className="stat-card">
      <CardContent className="p-4 pt-5">
        <div className="flex items-baseline gap-3 mb-4 px-2">
          <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            Player Tracking
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
