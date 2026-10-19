import { marketDate } from "./liveFeeds";

export function utcTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function markFreshness(value?: string | null, now = new Date(), status?: string | null, quality?: string | null) {
  const incomplete = [status, quality].find(value => value && /incomplete|unavailable|review|invalid|missing|error|stale/i.test(value));
  if (incomplete) {
    return { stale: true, label: `Incomplete mark: ${incomplete.replaceAll("_", " ")}` };
  }
  const timestamp = utcTimestamp(value);
  if (timestamp == null) return { stale: true, label: "Mark time unknown" };
  const hours = (now.getTime() - timestamp) / 3600000;
  if (hours < -1) return { stale: true, label: "Mark time invalid" };
  const age = hours < 1 ? "<1h" : hours < 48 ? `${Math.floor(hours)}h` : `${Math.floor(hours / 24)}d`;
  const unverified = quality === "unverified";
  return { stale: unverified || hours >= 24, label: `${unverified ? "Unverified mark" : hours >= 24 ? "Stale mark" : "Recorded mark"} ${age} ago` };
}

export function premiumChange(current: number | null | undefined, reference: number | null | undefined, markedAt?: string | null): number | null {
  return utcTimestamp(markedAt) != null && typeof current === "number" && Number.isFinite(current) && current >= 0
    && typeof reference === "number" && Number.isFinite(reference) && reference > 0
    ? (current / reference - 1) * 100 : null;
}

export function activityWindow(daily: { date: string; added: number }[], now = new Date(), timeZone = "America/Los_Angeles") {
  const today = marketDate(now, timeZone);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  return { today, cutoff, todayAdded: daily.find(d => d.date === today)?.added ?? 0,
    weekAdded: daily.filter(d => d.date >= cutoff && d.date <= today).reduce((n, d) => n + d.added, 0) };
}

export function markedExposure(positions: { last_marked_at?: string | null; updated_at?: string | null; mark_status?: string | null; mark_quality?: string | null; current_value: number | null; cost_basis: number }[], now = new Date()) {
  const stale = positions.filter(p => p.current_value == null || markFreshness(p.last_marked_at ?? p.updated_at, now, p.mark_status, p.mark_quality).stale);
  return { count: stale.length, value: stale.reduce((total, p) => total + (p.current_value ?? p.cost_basis), 0) };
}

export function signedPercent(value: number | null | undefined, decimals = 1): string {
  return value != null && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%` : "Unknown";
}
