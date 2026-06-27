import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export interface TickerMeta {
  market_cap: number | null;
  sector: string;
  industry: string;
  target_mean: number | null;
  target_high: number | null;
  target_low: number | null;
  price: number | null;
  /** analyst mean target as % above/below current price (null if unknown) */
  target_pct: number | null;
}

/**
 * Per-ticker market metadata (market cap, sector, industry, analyst target).
 *
 * Backed by `GET /market/ticker-meta` (intelligence.db::ticker_meta, populated
 * by scripts/backfill_ticker_meta.py from yfinance). Powers the heat-map's
 * market-cap sizing, sector/industry grouping, and target-vs-price coloring.
 * 6h staleTime — price/target drift intraday but slowly.
 */
export function useTickerMeta() {
  return useQuery<Record<string, TickerMeta>>({
    queryKey: ["ticker-meta"],
    queryFn: () =>
      apiClient.get("/market/ticker-meta").then((r) => r.data?.meta ?? {}),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
