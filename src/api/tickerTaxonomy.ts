import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export interface TickerTaxonomy {
  sector: string;
  theme: string;
  subcategory: string;
  direction: string;
}

/**
 * The app's own curated ticker classification (sector → theme → subcategory),
 * from results/intelligence_taxonomy.json via `GET /market/ticker-taxonomy`.
 *
 * Preferred over yfinance GICS for grouping — it's thematic and accurate for
 * this universe (e.g. IREN → CRYPTO_TREASURY_MINERS, not "Financial Services").
 * Reference data; cached for a day.
 */
export function useTickerTaxonomy() {
  return useQuery<Record<string, TickerTaxonomy>>({
    queryKey: ["ticker-taxonomy"],
    queryFn: () =>
      apiClient.get("/market/ticker-taxonomy").then((r) => r.data?.taxonomy ?? {}),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
