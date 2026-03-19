import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type { SignalResult } from "../lib/types";

/** Load the latest saved signal for a ticker */
export function useSignal(ticker: string) {
  return useQuery({
    queryKey: ["signal", ticker],
    queryFn: async () => {
      const { data } = await apiClient.get<SignalResult>(
        `/signals/latest?ticker=${ticker}`
      );
      return data;
    },
    staleTime: STALE_TIMES.forecast,
    enabled: !!ticker,
  });
}

/** List tickers that have saved signals */
export function useSignalTickers() {
  return useQuery({
    queryKey: ["signal", "tickers"],
    queryFn: async () => {
      const { data } = await apiClient.get<string[]>("/signals/tickers");
      return data;
    },
    staleTime: STALE_TIMES.forecast,
  });
}

/** Generate a new signal (runs ensemble + Claude analysis) */
export function useGenerateSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticker: string) => {
      const { data } = await apiClient.post<SignalResult>(
        `/signals/generate?ticker=${ticker}`
      );
      return data;
    },
    onSuccess: (_data, ticker) => {
      qc.invalidateQueries({ queryKey: ["signal", ticker] });
      qc.invalidateQueries({ queryKey: ["signal", "tickers"] });
    },
  });
}
