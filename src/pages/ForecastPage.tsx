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
  WatchlistSidebar,
  ModelSelector,
  ForecastActions,
  ForecastChart,
  ModelComparisonTable,
  ConsensusBar,
  MarketContextCards,
} from "../features/forecast";

const DEFAULT_MODELS = [
  "dlinear",
  "patchtst",
  "itransformer",
  "timemixer",
  "timexer",
  "timesnet",
];

type ForecastType = "daily" | "intraday";

export function ForecastPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const queryClient = useQueryClient();

  // Local state
  const [selectedModels, setSelectedModels] = useState<string[]>(DEFAULT_MODELS);
  const [forecastType, setForecastType] = useState<ForecastType>("daily");
  const [forecasts, setForecasts] = useState<ModelForecast[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [forecastDays] = useState(5);

  // API data
  const { data: history, isLoading: historyLoading } = useMarketHistory(ticker, 180);
  const { data: marketContext, isLoading: contextLoading } = useMarketContext(ticker);
  const { data: marketPrice } = useMarketPrice(ticker);

  // Toggle a model on/off
  const toggleModel = useCallback((model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model)
        ? prev.filter((m) => m !== model)
        : [...prev, model]
    );
  }, []);

  // Run forecast for all selected models in parallel
  const runForecast = useCallback(async () => {
    if (selectedModels.length === 0) return;

    setIsRunning(true);
    setForecasts([]);

    try {
      const endpoint =
        forecastType === "daily" ? "/forecast/daily" : "/forecast/intraday";

      const results = await Promise.allSettled(
        selectedModels.map((model) =>
          apiClient
            .post<ModelForecast>(endpoint, {
              ticker,
              model,
              days: forecastDays,
            })
            .then((r) => r.data)
        )
      );

      const successful: ModelForecast[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          successful.push(result.value);
        }
      }

      setForecasts(successful);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["market-price", ticker] });
    } catch (err) {
      console.error("Forecast error:", err);
    } finally {
      setIsRunning(false);
    }
  }, [selectedModels, forecastType, ticker, forecastDays, queryClient]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={24} className="text-accent-blue" />
          <h1 className="text-xl font-semibold text-text-primary">
            Forecast
          </h1>
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

      {/* Three-column layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left sidebar — Watchlist + Model selector */}
        <div className="col-span-12 lg:col-span-2 space-y-4">
          <WatchlistSidebar />
          <ModelSelector
            selectedModels={selectedModels}
            onToggle={toggleModel}
          />
        </div>

        {/* Main content — Actions, Chart, Table, Consensus */}
        <div className="col-span-12 lg:col-span-7 space-y-4">
          <ForecastActions
            forecastType={forecastType}
            onToggleType={setForecastType}
            onRunForecast={runForecast}
            isLoading={isRunning}
            selectedModelCount={selectedModels.length}
          />

          <ForecastChart
            historicalData={history}
            forecasts={forecasts}
            selectedModels={selectedModels}
            isLoading={historyLoading}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ModelComparisonTable
              forecasts={forecasts}
              isLoading={isRunning}
            />
            <ConsensusBar
              forecasts={forecasts}
              isLoading={isRunning}
            />
          </div>
        </div>

        {/* Right panel — Market context */}
        <div className="col-span-12 lg:col-span-3">
          <MarketContextCards
            context={marketContext}
            isLoading={contextLoading}
          />
        </div>
      </div>
    </div>
  );
}
