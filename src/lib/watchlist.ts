import { utcTimestamp } from "./markFreshness";

export type WatchlistSort = "newest" | "oldest" | "checked" | "source" | "ticker" | "pnl";

interface Observation {
  id?: number;
  ticker: string;
  expiry: string;
  strike: number | null;
  option_type: string;
  added: string;
  added_at?: string | null;
  source_date?: string | null;
  last_evaluated_at?: string | null;
  last_marked_at?: string | null;
  pnl_pct: number | null;
  mark_quality?: string | null;
  provenance_status?: string | null;
}

export function observationGain(row: Observation): number | null {
  return row.mark_quality !== "unverified" && row.provenance_status !== "unverified_legacy"
    && utcTimestamp(row.last_marked_at) != null && row.pnl_pct != null && Number.isFinite(row.pnl_pct)
    ? row.pnl_pct : null;
}

export function observationHasEvaluation(row: Observation): boolean {
  return row.provenance_status !== "unverified_legacy" && utcTimestamp(row.source_date) != null
    && utcTimestamp(row.last_evaluated_at) != null;
}

function descending(a: number | null, b: number | null): number {
  if (a == null || b == null) return a == null ? b == null ? 0 : 1 : -1;
  return b - a;
}

export function sortObservations<T extends Observation>(rows: T[], sort: WatchlistSort): T[] {
  return [...rows].sort((a, b) => {
    const identity = (row: T) => `${row.ticker}|${row.expiry}|${row.option_type}|${row.strike}`;
    const tie = () => (b.id ?? 0) - (a.id ?? 0) || identity(a).localeCompare(identity(b));
    if (sort === "ticker") return a.ticker.localeCompare(b.ticker) || tie();
    if (sort === "pnl") return descending(observationGain(a), observationGain(b)) || tie();
    if (sort === "checked") return descending(observationHasEvaluation(a) ? utcTimestamp(a.last_evaluated_at) : null,
      observationHasEvaluation(b) ? utcTimestamp(b.last_evaluated_at) : null) || tie();
    if (sort === "source") return descending(utcTimestamp(a.source_date), utcTimestamp(b.source_date)) || tie();
    const left = utcTimestamp(a.added_at ?? a.added), right = utcTimestamp(b.added_at ?? b.added);
    if (left == null || right == null) return descending(left, right) || tie();
    const order = right - left || tie();
    return sort === "oldest" ? -order : order;
  });
}

export function observationAge(added: string, marketDay: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(added) || !/^\d{4}-\d{2}-\d{2}$/.test(marketDay)) return null;
  const days = (Date.parse(`${marketDay}T00:00:00Z`) - Date.parse(`${added}T00:00:00Z`)) / 86400000;
  return Number.isFinite(days) && days >= 0 ? days : null;
}
