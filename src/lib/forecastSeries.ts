import type { Time, UTCTimestamp } from "lightweight-charts";

export function chartTime(value: string, intraday = false): Time {
  if (!intraday) return value.slice(0, 10) as Time;
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return (Date.parse(zoned) / 1000) as UTCTimestamp;
}

export function forecastPoints(
  dates: string[], values: number[], intraday = false,
  origin?: { time: string; value: number },
) {
  const points = new Map<Time, number>();
  const start = origin ? chartTime(origin.time, intraday) : undefined;
  if (origin && Number.isFinite(origin.value) && (typeof start !== "number" || Number.isFinite(start))) {
    points.set(start!, origin.value);
  }
  dates.forEach((date, index) => {
    const time = chartTime(date, intraday);
    if (!date || !Number.isFinite(values[index]) || (typeof time === "number" && !Number.isFinite(time))) return;
    if (start === undefined || time > start) points.set(time, values[index]);
  });
  return [...points.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([time, value]) => ({ time, value }));
}

export function forecastReturn(end: number, anchor?: number | null): number | null {
  return anchor != null && Number.isFinite(anchor) && anchor > 0 && Number.isFinite(end)
    ? (end / anchor - 1) * 100 : null;
}
