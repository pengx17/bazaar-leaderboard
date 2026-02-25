import ReactECharts from "echarts-for-react";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRatingHistory } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useTheme } from "@/lib/theme";
import { getChartTheme } from "@/lib/chart-theme";

interface RatingChartProps {
  username: string;
  seasonId: number;
}

export function RatingChart({ username, seasonId }: RatingChartProps) {
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
          No data found for "{username}"
        </CardContent>
      </Card>
    );
  }

  const times = data.map((d) => d.time);
  const ratings = data.map((d) => d.rating);
  const positions = data.map((d) => d.position);

  // Compute axis ranges with ~10% padding to compress the view
  const ratingMin = Math.min(...ratings);
  const ratingMax = Math.max(...ratings);
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
      formatter: (params: Array<{ seriesName: string; value: number; axisValueLabel: string }>) => {
        const time = new Date(params[0].axisValueLabel).toLocaleString();
        let html = `<div style="font-size:11px;color:${ct.tooltipSecondary};margin-bottom:4px">${time}</div>`;
        for (const p of params) {
          const color = p.seriesName === "Rating" ? ct.ratingAxis : ct.positionAxis;
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
        name: "Rating",
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
        name: "Rank",
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
        name: "Rating",
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
        name: "Position",
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
