/**
 * Shared utilities for uniform 30-min time-series charts.
 */

const INTERVAL_MS = 30 * 60 * 1000;

/** Round a timestamp to the nearest 30-min boundary. */
export function roundToInterval(time: string): number {
  return Math.round(new Date(time).getTime() / INTERVAL_MS) * INTERVAL_MS;
}

/**
 * Build a uniform timeline (30-min steps) spanning from the earliest
 * to the latest timestamp in the input array.
 */
export function buildUniformTimeline(times: string[]): number[] {
  if (times.length === 0) return [];
  const rounded = times.map(roundToInterval);
  const min = Math.min(...rounded);
  const max = Math.max(...rounded);
  const result: number[] = [];
  for (let t = min; t <= max; t += INTERVAL_MS) {
    result.push(t);
  }
  return result;
}

/**
 * Map raw data points to rounded timestamps.
 * If multiple points round to the same slot, the last one wins.
 */
export function indexByTime(
  times: string[],
  values: number[]
): Map<number, number> {
  const map = new Map<number, number>();
  for (let i = 0; i < times.length; i++) {
    map.set(roundToInterval(times[i]), values[i]);
  }
  return map;
}

/**
 * Forward-fill a value series onto a uniform timeline.
 * Returns [timestamp, value] pairs for ECharts type:"time" axis.
 */
export function forwardFillSeries(
  timeline: number[],
  dataByTime: Map<number, number>
): [number, number | null][] {
  let last: number | null = null;
  return timeline.map((t) => {
    const val = dataByTime.get(t);
    if (val != null) last = val;
    return [t, last];
  });
}
