import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export interface TickerTechnical {
  /** -100 bearish .. +100 bullish composite */
  tech_score: number;
  trend: string; // up / down / mixed
  rsi14: number;
  macd_hist: number;
  pct_b: number;
  fib_pos: number;
  near_level: string;
  /** 0..100 — "about to resolve" (drives the pulse) */
  setup_strength: number;
  price: number;
  /** most significant detected candlestick/chart pattern, e.g. "Double Bottom" */
  pattern?: string;
  /** bull / bear / neutral */
  pattern_dir?: string;
  /** 0..100 */
  pattern_strength?: number;
  /** top detected patterns */
  patterns?: string[];
}

/**
 * Per-ticker technical-analysis snapshot from `GET /market/ticker-technicals`
 * (intelligence.db::ticker_technicals, computed by scripts/backfill_technicals.py).
 * Powers the heat-map's Technical color and technical pulse. 2h staleTime —
 * recomputed daily after close.
 */
export function useTickerTechnicals(enabled = true) {
  return useQuery<Record<string, TickerTechnical>>({
    queryKey: ["ticker-technicals"],
    queryFn: () =>
      apiClient.get("/market/ticker-technicals").then((r) => r.data?.technicals ?? {}),
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled,
  });
}
