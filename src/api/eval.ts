import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type {
  LeaderboardEntry,
  DailyMetric,
  ModelHistoryEntry,
  TrustScore,
} from "../lib/types";

export function useLeaderboard(ticker?: string, minSamples: number = 2) {
  return useQuery({
    queryKey: ["eval", "leaderboard", ticker, minSamples],
    queryFn: async () => {
      let url = `/eval/leaderboard?min_samples=${minSamples}`;
      if (ticker) url += `&ticker=${ticker}`;
      const { data } = await apiClient.get<LeaderboardEntry[]>(url);
      return data;
    },
    staleTime: STALE_TIMES.eval,
  });
}

export function useDailyMetrics(model: string, days: number = 30) {
  return useQuery({
    queryKey: ["eval", "daily-metrics", model, days],
    queryFn: async () => {
      const { data } = await apiClient.get<DailyMetric[]>(
        `/eval/daily-metrics?model=${model}&days=${days}`
      );
      return data;
    },
    staleTime: STALE_TIMES.eval,
    enabled: !!model,
  });
}

export function useModelHistory(model: string, ticker?: string) {
  return useQuery({
    queryKey: ["eval", "model-history", model, ticker],
    queryFn: async () => {
      let url = `/eval/model-history?model=${model}`;
      if (ticker) url += `&ticker=${ticker}`;
      const { data } = await apiClient.get<ModelHistoryEntry[]>(url);
      return data;
    },
    staleTime: STALE_TIMES.eval,
    enabled: !!model,
  });
}

export function useTrustScores(ticker?: string) {
  return useQuery({
    queryKey: ["eval", "trust-scores", ticker],
    queryFn: async () => {
      let url = "/eval/trust-scores";
      if (ticker) url += `?ticker=${ticker}`;
      const { data } = await apiClient.get<TrustScore[]>(url);
      return data;
    },
    staleTime: STALE_TIMES.eval,
  });
}

export function useEvaluatePending() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post("/eval/evaluate-pending");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval"] });
    },
  });
}

export function useRunBacktest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ticker,
      model,
    }: {
      ticker: string;
      model: string;
    }) => {
      const { data } = await apiClient.post(
        `/eval/backtest?ticker=${ticker}&model=${model}`
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval"] });
    },
  });
}
