/**
 * Per-ticker GEX walls — recent flow tickers + SPY/QQQ anchors.
 * Backend: GET /market/ticker-gex (intelligence.db::ticker_gex, refreshed
 * daily by scripts/backfill_gex.py on the technicals timer). Feeds the
 * SETUP score's dealer-structure component + Top Signals wall chips.
 */
import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export interface TickerGex {
  price: number | null;
  put_wall: number | null;
  call_wall: number | null;
  net_gex: number | null;
  put_call_ratio: number | null;
  regime: string;
  updated_at: string;
}

export type TickerGexMap = Record<string, TickerGex>;

export function useTickerGex(enabled = true) {
  return useQuery<TickerGexMap>({
    queryKey: ["ticker-gex"],
    queryFn: () => apiClient.get<TickerGexMap>("/market/ticker-gex").then((r) => r.data),
    staleTime: 60 * 60 * 1000, // refreshed daily server-side
    enabled,
  });
}
