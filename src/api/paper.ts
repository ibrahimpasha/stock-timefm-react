import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type {
  PortfolioSummary,
  WatchlistItem,
  PaperPosition,
  TradeLogEntry,
  PortfolioHistoryPoint,
} from "../lib/types";

/* ── Queries ──────────────────────────────────────────────── */

export function usePortfolio() {
  return useQuery({
    queryKey: ["paper", "portfolio"],
    queryFn: async () => {
      const { data } = await apiClient.get<PortfolioSummary>(
        "/paper/portfolio"
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["paper", "watchlist"],
    queryFn: async () => {
      const { data } = await apiClient.get<WatchlistItem[]>(
        "/paper/watchlist"
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

export function usePositions(status: "open" | "closed" = "open") {
  return useQuery({
    queryKey: ["paper", "positions", status],
    queryFn: async () => {
      const { data } = await apiClient.get<PaperPosition[]>(
        `/paper/positions?status=${status}`
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

export function useTradeLog() {
  return useQuery({
    queryKey: ["paper", "log"],
    queryFn: async () => {
      const { data } = await apiClient.get<TradeLogEntry[]>("/paper/log");
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

export function usePortfolioHistory(days: number = 30) {
  return useQuery({
    queryKey: ["paper", "history", days],
    queryFn: async () => {
      const { data } = await apiClient.get<PortfolioHistoryPoint[]>(
        `/paper/history?days=${days}`
      );
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

/* ── Mutations ────────────────────────────────────────────── */

export function useScanWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/paper/scan");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
  });
}

export function useResetPortfolio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/paper/reset");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
  });
}
