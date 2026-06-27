import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

// Mirrors server/api_routes.py::market_bay_area_map
export interface BayAreaCompany {
  ticker: string;
  name: string;
  sector: string | null;
  city: string;
  lat: number;
  lng: number;
  market_cap: number | null;
  score: number | null; // -100 (bearish) .. +100 (bullish), null if no signal
  pulse: number; // 0..1 — blink speed
  momentum_30d: number | null;
  tech_score: number | null;
  flow_bull_share: number | null;
  components: string[]; // which signals contributed: technical|momentum|flow
  is_campus: boolean; // true = big Bay Area campus, HQ elsewhere
  hq_note: string | null; // where the real HQ is, for campus rows
  is_bay_area?: boolean; // ticker-map only
  state?: string | null;
  country?: string | null;
  building?: [number, number][] | null; // stored OSM footprint ring [[lat,lng],...]
}

export interface BayAreaMapResponse {
  count: number;
  companies: BayAreaCompany[];
  ready: boolean; // false while the SEC scan hasn't built the table yet
}

export function useBayAreaMap(minMarketCap = 0) {
  return useQuery<BayAreaMapResponse>({
    queryKey: ["bay-area-map", minMarketCap],
    queryFn: async () => {
      const { data } = await apiClient.get<BayAreaMapResponse>(
        `/market/bay-area-map?min_market_cap=${minMarketCap}`,
      );
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

// All tracked tickers at their building (not just Bay Area).
export function useTickerMap(minMarketCap = 0) {
  return useQuery<BayAreaMapResponse>({
    queryKey: ["ticker-map", minMarketCap],
    queryFn: async () => {
      const { data } = await apiClient.get<BayAreaMapResponse>(
        `/market/ticker-map?min_market_cap=${minMarketCap}`,
      );
      return data;
    },
    staleTime: 10 * 60_000,
  });
}
