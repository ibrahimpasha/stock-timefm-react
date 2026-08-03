import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import apiClient from "./client";

export interface ResilienceEvent {
  id: number;
  peak_date: string;
  trigger_date: string;
  trough_date: string;
  spy_dd_pct: number;
  spy_bounce_5d: number | null;
}

export interface ResilienceTicker {
  ticker: string;
  score: number;
  n_events: number;
  avg_bounce_5d: number | null;
  recovery_rate: number;
  avg_rel_dd: number | null;
  avg_own_dd_pct: number;
  category: string | null;
  theme: string | null;
}

export interface ResilienceTheme {
  theme: string;
  category: string | null;
  n_tickers: number;
  score: number;
  avg_bounce_5d: number;
  top: string[];
}

export interface ResilienceResponse {
  events: ResilienceEvent[];
  tickers: ResilienceTicker[];
  themes: ResilienceTheme[];
  n_tickers: number;
  error?: string;
}

export function useResilience(minEvents = 3) {
  return useQuery<ResilienceResponse>({
    queryKey: ["market-resilience", minEvents],
    queryFn: () =>
      apiClient
        .get(`/market/resilience?min_events=${minEvents}`)
        .then((r: AxiosResponse<ResilienceResponse>) => r.data),
    staleTime: 30 * 60_000, // rebuilt daily by the technicals timer
  });
}

export interface IntradayDay {
  date: string;
  spy_trough_pct: number;
  spy_bounce_close: number | null;
  spy_trough_time: string | null;
}

export interface IntradayTicker {
  ticker: string;
  score: number;
  n_days: number;
  avg_bounce_close: number;
  avg_trough_pct: number;
  avg_rel_bounce: number;
  category: string | null;
  theme: string | null;
}

export interface IntradayResponse {
  days: IntradayDay[];
  tickers: IntradayTicker[];
  n_tickers: number;
}

export interface BarSegment {
  date: string;
  times: string[];
  series: Record<string, (number | null)[]>;
}

export interface IntradayBarsResponse {
  dates: string[];
  segments: BarSegment[];
}

export function useIntradayResilience(minDays = 2, dates = "") {
  return useQuery<IntradayResponse>({
    queryKey: ["resilience-intraday", minDays, dates],
    queryFn: () =>
      apiClient
        .get(
          `/market/resilience/intraday?min_days=${minDays}&dates=${encodeURIComponent(dates)}`,
        )
        .then((r: AxiosResponse<IntradayResponse>) => r.data),
    staleTime: 30 * 60_000,
    placeholderData: (prev: IntradayResponse | undefined) => prev,
  });
}

export function useIntradayBars(dates: string, tickers: string[], theme: string) {
  const tk = [...tickers].sort().join(",");
  return useQuery<IntradayBarsResponse>({
    queryKey: ["resilience-intraday-bars", dates, tk, theme],
    queryFn: () =>
      apiClient
        .get(
          `/market/resilience/intraday/bars?date=${dates}&tickers=${encodeURIComponent(tk)}&theme=${encodeURIComponent(theme)}`,
        )
        .then((r: AxiosResponse<IntradayBarsResponse>) => r.data),
    staleTime: 30 * 60_000,
    enabled: !!dates,
    placeholderData: (prev: IntradayBarsResponse | undefined) => prev,
  });
}

export interface InsightChip {
  ticker: string;
  trough_pct: number;
  bounce_close: number | null;
  theme: string | null;
  hist_bounce?: number;
  hist_n?: number;
  reason?: string;
}

export interface InsightsResponse {
  dates: string[];
  latest?: string;
  spy?: {
    spy_trough_pct: number;
    spy_bounce_close: number | null;
    days: { date: string; spy_trough_pct: number; spy_bounce_close: number | null }[];
  };
  n_tracked?: number;
  dropped?: InsightChip[];
  held_up?: InsightChip[];
  recovered?: InsightChip[];
  still_down?: InsightChip[];
  watch?: InsightChip[];
  counts?: { dropped: number; held_up: number; recovered: number; still_down: number };
  error?: string;
}

export function useResilienceInsights(dates: string) {
  return useQuery<InsightsResponse>({
    queryKey: ["resilience-insights", dates],
    queryFn: () =>
      apiClient
        .get(`/market/resilience/insights?date=${encodeURIComponent(dates)}`)
        .then((r: AxiosResponse<InsightsResponse>) => r.data),
    staleTime: 30 * 60_000,
    enabled: !!dates,
    placeholderData: (prev: InsightsResponse | undefined) => prev,
  });
}

export function useResilienceRefresh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/market/resilience/refresh"),
    onSuccess: () => {
      // The refresh is a detached ~30s subprocess — revalidate after it lands.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: ["market-resilience"] }),
        45_000,
      );
    },
  });
}
