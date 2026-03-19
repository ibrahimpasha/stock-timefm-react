import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type { IntelSection, IntelEvent, IntelSignal } from "../lib/types";

export function useIntelligence(ticker: string) {
  return useQuery({
    queryKey: ["intel", "latest", ticker],
    queryFn: async () => {
      const { data } = await apiClient.get<IntelSection[]>(
        `/intel/latest?ticker=${ticker}`
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}

export function useIntelHistory(
  ticker: string,
  days: number = 30,
  type?: string
) {
  return useQuery({
    queryKey: ["intel", "history", ticker, days, type],
    queryFn: async () => {
      let url = `/intel/history?ticker=${ticker}&days=${days}`;
      if (type) url += `&type=${type}`;
      const { data } = await apiClient.get<IntelSection[]>(url);
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}

export function useIntelEvents(ticker: string, days: number = 30) {
  return useQuery({
    queryKey: ["intel", "events", ticker, days],
    queryFn: async () => {
      const { data } = await apiClient.get<IntelEvent[]>(
        `/intel/events?ticker=${ticker}&days=${days}`
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}

export function useIntelSignals(ticker: string) {
  return useQuery({
    queryKey: ["intel", "signals", ticker],
    queryFn: async () => {
      const { data } = await apiClient.get<IntelSignal[]>(
        `/intel/signals?ticker=${ticker}`
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}

export function useIntelTickers() {
  return useQuery({
    queryKey: ["intel", "tickers"],
    queryFn: async () => {
      const { data } = await apiClient.get<string[]>("/intel/tickers");
      return data;
    },
    staleTime: STALE_TIMES.intel,
  });
}

export function useRefreshIntel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticker: string) => {
      const { data } = await apiClient.post(
        `/intel/refresh?ticker=${ticker}`
      );
      return data;
    },
    onSuccess: (_data, ticker) => {
      qc.invalidateQueries({ queryKey: ["intel", "latest", ticker] });
      qc.invalidateQueries({ queryKey: ["intel", "signals", ticker] });
      qc.invalidateQueries({ queryKey: ["intel", "events", ticker] });
    },
  });
}
