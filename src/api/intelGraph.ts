import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type { IntelGraphContext, ThemePulse } from "../lib/types";

/** Latest Theme-Pulse play_score (0-100) per ticker — for the heat-map's
 *  play-score filter. Backed by GET /api/market/theme-pulse-scores. */
export function useThemePulseScores() {
  return useQuery<{ scores: Record<string, number>; count: number }>({
    queryKey: ["market", "theme-pulse-scores"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ scores: Record<string, number>; count: number }>(
        "/market/theme-pulse-scores",
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
  });
}

/** Theme-level synthesis (Plays-now / Watch / Wait + theme read) for a taxonomy
 *  theme. Backed by GET /api/intel-graph/theme-pulse?theme=X. Cached daily
 *  server-side; one `claude -p` call per theme per day. */
export function useThemePulse(theme?: string | null) {
  return useQuery<ThemePulse>({
    queryKey: ["intel-graph", "theme-pulse", theme],
    queryFn: async () => {
      const { data } = await apiClient.get<ThemePulse>(
        `/intel-graph/theme-pulse?theme=${encodeURIComponent(theme!)}`,
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!theme,
  });
}

/** Structural context for a ticker from the **graphify** graph (migrated from
 *  Understand-Anything 2026-06-13): structural role, related companies (with
 *  edge confidence), supply-chain chokepoints, community cluster, thematic
 *  groups, and theme peers.
 *
 *  Backed by GET /api/intel-graph/context?ticker=X. Returns
 *  `{available: false, reason}` when the graph hasn't been built — the
 *  UI degrades by hiding the card rather than erroring. */
export function useIntelGraphContext(ticker: string, limit: number = 8) {
  return useQuery<IntelGraphContext>({
    queryKey: ["intel-graph", "context", ticker, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<IntelGraphContext>(
        `/intel-graph/context?ticker=${encodeURIComponent(ticker)}&limit=${limit}`
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}
