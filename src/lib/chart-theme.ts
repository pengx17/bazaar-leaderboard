import type { Theme } from "./theme";

const themes = {
  light: {
    tooltipBg: "rgba(255, 255, 255, 0.96)",
    tooltipBorder: "rgba(0, 0, 0, 0.08)",
    tooltipText: "#1a1a1a",
    tooltipSecondary: "#666",
    axisLabel: "#666",
    axisLine: "#ddd",
    splitLine: "rgba(0, 0, 0, 0.06)",
    ratingAxis: "#d97706",
    positionAxis: "#059669",
    ratingSplitLine: "rgba(217, 119, 6, 0.1)",
  },
  dark: {
    tooltipBg: "rgba(10, 10, 10, 0.95)",
    tooltipBorder: "rgba(245, 158, 11, 0.2)",
    tooltipText: "#e5e5e5",
    tooltipSecondary: "#888",
    axisLabel: "#888",
    axisLine: "#333",
    splitLine: "rgba(255, 255, 255, 0.04)",
    ratingAxis: "#f59e0b",
    positionAxis: "#6ee7b7",
    ratingSplitLine: "rgba(245, 158, 11, 0.06)",
  },
} as const;

export function getChartTheme(theme: Theme) {
  return themes[theme];
}
