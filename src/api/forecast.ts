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

export interface ForecastRunConfig {
  forecastType: "daily" | "intraday";
  forecastDays: number;
  forecastMinutes: number;
  interval: string;
  historyDays: number;
  historyPeriod: string;
  selectedModels: string[];
  useCovariates: boolean;
  usePretrained: boolean;
  forecastOrigin: string;
}

export interface ForecastRunResult {
  forecasts: ModelForecast[];
  failedModels: string[];
}

/** Execute the user-selected forecast models and normalize the daily direct
 * and ensemble response shapes into one UI contract. */
export async function runForecastModels(
  ticker: string,
  config: ForecastRunConfig,
): Promise<ForecastRunResult> {
  const isDaily = config.forecastType === "daily";
  const endpoint = isDaily ? "/forecast/daily" : "/forecast/intraday";
  const body = isDaily
    ? {
        ticker,
        days: config.forecastDays,
        history_days: config.historyDays,
        use_covariates: config.useCovariates,
        use_pretrained: config.usePretrained,
        forecast_origin: config.forecastOrigin,
      }
    : {
        ticker,
        minutes: config.forecastMinutes,
        interval: config.interval,
        history_period: config.historyPeriod,
        use_covariates: config.useCovariates,
        use_pretrained: config.usePretrained,
      };

  const results = await Promise.allSettled(
    config.selectedModels.map(async (model) => {
      const { data } = await apiClient.post(endpoint, { ...body, model });
      const predictions = (data.predictions ?? []).map(
        (prediction: { timestamp?: string; date?: string; [key: string]: unknown }) => ({
          ...prediction,
          timestamp: String(prediction.timestamp ?? prediction.date ?? ""),
        }),
      );
      const prices: number[] =
        data.prices ?? predictions.map((prediction: { price: number }) => prediction.price);
      return {
        model,
        prices,
        end_price:
          data.end_price ??
          data.summary?.final_price ??
          (prices.length ? prices[prices.length - 1] : 0),
        predictions,
        current_price: data.current_price ?? 0,
        latency_ms: data.latency_ms ?? 0,
      } as ModelForecast;
    }),
  );

  const forecasts: ModelForecast[] = [];
  const failedModels: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      forecasts.push(result.value);
    } else {
      failedModels.push(config.selectedModels[index]);
    }
  });
  return { forecasts, failedModels };
}

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
    staleTime: STALE_TIMES.marketHistory,
    enabled: !!ticker,
  });
}

/* ── Signal Analysis (reliable, replaces the deprecated price forecast) ───── */

export interface SignalTechnical {
  tech_score: number;
  trend: string;
  rsi14: number;
  macd_hist: number;
  pct_b: number;
  fib_pos: number;
  near_level: string;
  setup_strength: number;
  price: number;
  pattern?: string;
  pattern_dir?: string;
  pattern_strength?: number;
  patterns?: string[];
}

export interface SignalConvergence {
  ticker: string;
  window_hours: number;
  as_of: string;
  signals: Record<
    string,
    { count: number; bullish?: number; bearish?: number; authors?: string[] }
  >;
  convergence: { score: number; alignment: string; label: string };
}

export interface SignalML {
  peak_score: number;
  peak_probability?: number | null;
  gate_approved?: boolean;
  n_entries: number;
  as_of: string | null;
  best: {
    type: string;
    strike: number | string | null;
    expiry: string | null;
    premium: number | string | null;
    flow_date: string | null;
  };
}

export interface SignalProfile {
  name: string | null;
  market_cap: number | null;
  sector: string | null;
  industry: string | null;
  target_mean: number | null;
  target_high: number | null;
  target_low: number | null;
  /** Durable company business summary (ticker_profiles, yfinance) — the same
   *  "About" text that feeds the wiki / graphify. Shown as a dropdown by the
   *  company name in SignalAnalysisCard. */
  about: string | null;
}

export interface SignalAnalysisResult {
  ticker: string;
  profile: SignalProfile | null;
  technical: SignalTechnical | null;
  convergence: SignalConvergence | null;
  ml: SignalML | null;
}

/** Reliable per-ticker signal panel: deterministic TA + cross-source
 *  convergence + ML peak-potential. No discredited price forecast. */
export function useSignalAnalysis(ticker: string) {
  return useQuery<SignalAnalysisResult>({
    queryKey: ["signal-analysis", ticker],
    queryFn: () =>
      apiClient
        .get<SignalAnalysisResult>(`/market/signal-analysis?ticker=${ticker}`)
        .then((r) => r.data),
    staleTime: STALE_TIMES.intel,
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
