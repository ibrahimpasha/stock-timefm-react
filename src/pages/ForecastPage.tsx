import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  useMarketHistory,
  useMarketContext,
  useMarketPrice,
} from "../api/forecast";
import apiClient from "../api/client";
import type { ModelForecast } from "../lib/types";
import { PriceDisplay } from "../components/PriceDisplay";
import {
  ForecastConfig,
  DEFAULT_SETTINGS,
  type ForecastSettings,
} from "../features/forecast/ForecastConfig";
import {
  WatchlistSidebar,
  ForecastChart,
  ModelComparisonTable,
  ConsensusBar,
  MarketContextCards,
} from "../features/forecast";

export function ForecastPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const queryClient = useQueryClient();

  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS);
  const [forecasts, setForecasts] = useState<ModelForecast[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // API data
  const { data: history, isLoading: historyLoading } = useMarketHistory(
    ticker,
    settings.historyDays
  );
  const { data: marketContext } = useMarketContext(ticker);
  const { data: marketPrice } = useMarketPrice(ticker);

  // Run forecast for all selected models in parallel
  const runForecast = useCallback(async () => {
    if (settings.selectedModels.length === 0) return;

    setIsRunning(true);
    setForecasts([]);

    try {
      const isDaily = settings.forecastType === "daily";
      const endpoint = isDaily ? "/forecast/daily" : "/forecast/intraday";

      const body = isDaily
        ? {
            ticker,
            days: settings.forecastDays,
            history_days: settings.historyDays,
            use_covariates: settings.useCovariates,
            use_pretrained: settings.usePretrained,
          }
        : {
            ticker,
            minutes: settings.forecastMinutes,
            interval: settings.interval,
            history_period: settings.historyPeriod,
            use_covariates: settings.useCovariates,
            use_pretrained: settings.usePretrained,
          };

      const results = await Promise.allSettled(
        settings.selectedModels.map((model) =>
          apiClient
            .post(endpoint, { ...body, model })
            .then((r) => {
              const d = r.data;
              // Normalize response to ModelForecast shape
              const prices = d.prices ?? (d.predictions
                ? d.predictions.map((p: { price: number }) => p.price)
                : []);
              return {
                model,
                prices,
                end_price: d.end_price ?? d.summary?.final_price ?? (prices.length ? prices[prices.length - 1] : 0),
                predictions: d.predictions ?? [],
                current_price: d.current_price ?? 0,
                latency_ms: d.latency_ms ?? 0,
              } as ModelForecast;
            })
        )
      );

      const successful: ModelForecast[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          successful.push(result.value);
        }
      }

      setForecasts(successful);
      queryClient.invalidateQueries({ queryKey: ["market-price", ticker] });
    } catch (err) {
      console.error("Forecast error:", err);
    } finally {
      setIsRunning(false);
    }
  }, [settings, ticker, queryClient]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-accent-blue" />
          <h1 className="text-xl font-semibold text-text-primary">Forecast</h1>
          {marketPrice && (
            <PriceDisplay
              ticker={ticker}
              price={marketPrice.price}
              changePct={marketPrice.change_pct}
              size="md"
            />
          )}
        </div>
      </div>

      {/* Forecast Configuration — always visible */}
      <ForecastConfig
        settings={settings}
        onChange={setSettings}
        onRunForecast={runForecast}
        isLoading={isRunning}
      />

      {/* Main content */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left sidebar — Watchlist */}
        <div className="col-span-12 lg:col-span-2 space-y-4">
          <WatchlistSidebar />
        </div>

        {/* Center — Chart + Table */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <ForecastChart
            historicalData={
              history?.map((d: Record<string, number | string>) => ({
                date: String(d.date),
                open: Number(d.open),
                high: Number(d.high),
                low: Number(d.low),
                close: Number(d.close),
                volume: Number(d.volume),
              })) ?? []
            }
            forecasts={forecasts}
            selectedModels={settings.selectedModels}
            isLoading={historyLoading || isRunning}
            forecastOrigin={settings.forecastOrigin}
          />

          {forecasts.length > 0 && (
            <>
              <ConsensusBar
                forecasts={forecasts}
                currentPrice={marketPrice?.price ?? 0}
              />
              <ModelComparisonTable
                forecasts={forecasts}
                currentPrice={marketPrice?.price ?? 0}
              />
            </>
          )}
        </div>

        {/* Right — Market context */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          <MarketContextCards context={marketContext ?? null} />
        </div>
      </div>
    </div>
  );
}
