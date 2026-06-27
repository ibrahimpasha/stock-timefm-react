import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

/**
 * Ticker -> company-name map for the tracked universe (~1k symbols).
 *
 * Backed by `GET /market/ticker-names` (intelligence.db::ticker_names, populated
 * by scripts/backfill_ticker_names.py). Pure reference data — it changes only
 * when the backfill re-runs, so we cache it for a day and never refetch on
 * focus. Powers company-name search in the ticker box.
 */
export function useTickerNames() {
  return useQuery<Record<string, string>>({
    queryKey: ["ticker-names"],
    queryFn: () =>
      apiClient.get("/market/ticker-names").then((r) => r.data?.names ?? {}),
    staleTime: 24 * 60 * 60 * 1000, // 1 day
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
