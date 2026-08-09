import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

/* Theme heat over time — the per-category "hotness ratio" (options premium vs a
 * 7-day baseline) charted across 30/60/90-day windows so you can see which
 * taxonomy sectors are trending hot vs cooling. Backed by
 * intelligence.db::theme_heat_history (backend scripts/theme_heat_history.py),
 * served by GET /market/theme-heat-history. 1.0x = baseline; >1 hot, <1 cooling. */

export interface ThemeHeatHistory {
  /** ISO flow-days, ascending — the x-axis. */
  dates: string[];
  /** All categories present in the window (alphabetical). */
  categories: string[];
  /** category -> hotness ratio per date (null where that day has no row). */
  series: Record<string, (number | null)[]>;
  /** Most-recent ratio per category — used to pre-select the hottest few. */
  latest: Record<string, number>;
  updated_at: string | null;
}

export function useThemeHeatHistory(days: number) {
  return useQuery<ThemeHeatHistory>({
    queryKey: ["theme-heat-history", days],
    queryFn: () =>
      apiClient
        .get<ThemeHeatHistory>(`/market/theme-heat-history?days=${days}`)
        .then((r) => r.data),
    staleTime: 30 * 60_000, // refreshed once/day server-side; 30m client is plenty
  });
}

/* Theme P/L over time — the scoreboard twin of theme heat. Same grid, coloured
 * by what the flow in each theme actually DID rather than how loud it was.
 * Backed by intelligence.db::theme_pnl_history (scripts/backfill_theme_pnl.py).
 *
 * `series` is SHRUNK toward `base_rate` by a pseudo-count, because a theme with
 * one graded entry reads 0% or 100% and would otherwise dominate the colours;
 * `raw` keeps the unshrunk value for tooltips. Cells whose 10-trading-day
 * window hasn't closed are null — unknown, not zero. */
export interface ThemePnlHistory {
  dates: string[];
  categories: string[];
  /** category -> shrunk metric per date (null = 10d window still open). */
  series: Record<string, (number | null)[]>;
  /** Unshrunk values, for tooltips. */
  raw: Record<string, (number | null)[]>;
  /** Graded-entry count behind each cell — how much to trust it. */
  counts: Record<string, number[]>;
  latest: Record<string, number>;
  /** Corpus-wide P(2x); the neutral point of the colour scale. */
  base_rate: number;
  prior_weight: number;
  /** Cells still awaiting a closed 10d window. */
  pending: number;
  metric: "p2x" | "med_peak";
  updated_at: string | null;
}

export function useThemePnlHistory(days: number, enabled = true) {
  return useQuery<ThemePnlHistory>({
    queryKey: ["theme-pnl-history", days],
    queryFn: () =>
      apiClient
        .get<ThemePnlHistory>(`/market/theme-pnl-history?days=${days}&metric=p2x`)
        .then((r) => r.data),
    staleTime: 30 * 60_000,
    enabled,
  });
}
