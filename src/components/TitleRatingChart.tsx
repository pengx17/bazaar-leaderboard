import ReactECharts from "echarts-for-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchTitleRatingHistory } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

export function TitleRatingChart({ seasonId }: { seasonId: number }) {
  const { data, loading, error } = useFetch(
    () => fetchTitleRatingHistory(seasonId),
    [seasonId]
  );

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
          No title rating data available
        </CardContent>
      </Card>
    );
  }

  const times = data.map((d) => d.time);

  const lineColors = {
    top10: "#f59e0b",
    top100: "#8b5cf6",
    top1000: "#06b6d4",
  };

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
      formatter: (params: Array<{ seriesName: string; value: number | null; axisValueLabel: string; color: string }>) => {
        const time = new Date(params[0].axisValueLabel).toLocaleString();
        let html = `<div style="font-size:11px;color:#888;margin-bottom:4px">${time}</div>`;
        for (const p of params) {
          if (p.value == null) continue;
          html += `<div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:2px;background:${p.color}"></span>
            <span>${p.seriesName}:</span>
            <strong>${p.value.toLocaleString()}</strong>
          </div>`;
        }
        return html;
      },
    },
    legend: {
      data: ["Top 10", "Top 100", "Top 1000"],
      top: 4,
      right: 8,
      textStyle: {
        color: "#888",
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
    yAxis: {
      type: "value" as const,
      name: "Rating",
      nameTextStyle: {
        color: "#888",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
      },
      axisLabel: {
        color: "#888",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      splitLine: {
        lineStyle: { color: "rgba(255, 255, 255, 0.04)" },
      },
    },
    series: [
      {
        name: "Top 10",
        type: "line",
        data: data.map((d) => d.top10),
        smooth: true,
        symbol: "none",
        lineStyle: { color: lineColors.top10, width: 2 },
        areaStyle: {
          color: {
            type: "linear" as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(245, 158, 11, 0.08)" },
              { offset: 1, color: "rgba(245, 158, 11, 0)" },
            ],
          },
        },
      },
      {
        name: "Top 100",
        type: "line",
        data: data.map((d) => d.top100),
        smooth: true,
        symbol: "none",
        lineStyle: { color: lineColors.top100, width: 2 },
      },
      {
        name: "Top 1000",
        type: "line",
        data: data.map((d) => d.top1000),
        smooth: true,
        symbol: "none",
        lineStyle: { color: lineColors.top1000, width: 2 },
      },
    ],
  };

  return (
    <Card className="stat-card">
      <CardContent className="p-4 pt-5">
        <div className="px-2 mb-4">
          <h3 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            Title Cutoff Lines
          </h3>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Minimum rating to reach each title tier this season
          </p>
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
