import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type {
  ModelForecast,
  EnsembleResult,
  MarketPrice,
  OHLCV,
  MarketContext,
} from "../lib/types";

/** Fetch available model names */
export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ models: string[] }>(
        "/forecast/models"
      );
      return data.models;
    },
    staleTime: STALE_TIMES.forecast,
  });
}

/** Run a daily forecast for a ticker + model */
export function useForecast(
  ticker: string,
  model: string,
  days: number = 5,
  enabled: boolean = false
) {
  return useQuery({
    queryKey: ["forecast", ticker, model, days],
    queryFn: async () => {
      const { data } = await apiClient.post<ModelForecast>(
        "/forecast/daily",
        { ticker, model, days }
      );
      return data;
    },
    staleTime: 0, // Always fresh -- forecasts run ML inference, don't serve stale
    gcTime: 0,    // Don't persist across component unmounts
    enabled,
  });
}

/** Run an ensemble forecast (all models) */
export function useEnsembleForecast(
  ticker: string,
  days: number = 5,
  enabled: boolean = false
) {
  return useQuery({
    queryKey: ["ensemble", ticker, days],
    queryFn: async () => {
      const { data } = await apiClient.post<EnsembleResult>(
        "/forecast/ensemble",
        { ticker, days }
      );
      return data;
    },
    staleTime: 0,
    gcTime: 0,
    enabled,
  });
}

/** Get current price + day change for a ticker */
export function useMarketPrice(ticker: string) {
  return useQuery({
    queryKey: ["market-price", ticker],
    queryFn: async () => {
      const { data } = await apiClient.get<MarketPrice>(
        `/market/price?ticker=${ticker}`
      );
      return data;
    },
    staleTime: STALE_TIMES.price,
    enabled: !!ticker,
    refetchInterval: STALE_TIMES.price,
  });
}

/** Get OHLCV history for charting */
export function useMarketHistory(ticker: string, days: number = 365) {
  return useQuery({
    queryKey: ["market-history", ticker, days],
    queryFn: async () => {
      const { data } = await apiClient.get<OHLCV[]>(
        `/market/history?ticker=${ticker}&days=${days}`
      );
      return data;
    },
    staleTime: STALE_TIMES.forecast,
    enabled: !!ticker,
  });
}

/** Get market context (analyst consensus, earnings, news) */
export function useMarketContext(ticker: string) {
  return useQuery({
    queryKey: ["market-context", ticker],
    queryFn: async () => {
      const { data } = await apiClient.get<MarketContext>(
        `/market/context?ticker=${ticker}`
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}
