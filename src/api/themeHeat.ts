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
