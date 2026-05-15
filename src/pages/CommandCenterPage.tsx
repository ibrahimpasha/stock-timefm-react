import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../store/useAppStore";
import { useMarketPrice, useMarketHistory } from "../api/forecast";
import { useSignal, useGenerateSignal } from "../api/signals";
import { useTrustScores } from "../api/eval";
import { useFlowAlerts } from "../api/flow";
import apiClient from "../api/client";

// Command Center feature components
import { DecisionHero } from "../features/command-center/DecisionHero";
import { ForecastChart } from "../features/forecast/ForecastChart";
import {
  ForecastConfig,
  DEFAULT_SETTINGS,
  type ForecastSettings,
} from "../features/forecast/ForecastConfig";
import type { OHLCV, ModelForecast } from "../lib/types";
import { ActionPanel } from "../features/command-center/ActionPanel";
import { ModelBreakdown } from "../features/command-center/ModelBreakdown";
import { TrustScores } from "../features/command-center/TrustScores";
import { IntelligencePanel } from "../features/command-center/IntelligencePanel";

// Flow Analyzer feature components
import { FlowAlerts } from "../features/flow-analyzer/FlowAlerts";
import { FlowChat } from "../features/flow-analyzer/FlowChat";
import { IFlowTracker } from "../features/flow-analyzer/IFlowTracker";

import { FlowPaperTrading } from "../features/flow-analyzer/FlowPaperTrading";
import { FlowIntel } from "../features/flow-analyzer/FlowIntel";

// iFlow Discord Pipeline
import { FetchIFlowPanel } from "../features/flow-analyzer/FetchIFlowPanel";

import {
  Command,
  Search,
  Loader2,
  Zap,
  MessageCircle,
  Target,
  Eye,
  Bell,
  BarChart3,
  X,
  SidebarOpen,
} from "lucide-react";

/* ── Tab definitions ─────────────────────────────────────── */

type FlowTab = "chat" | "picks" | "iflow" | "flow-trader" | "flow-intel";

const FLOW_TABS: { id: FlowTab; label: string; icon: React.ElementType }[] = [
  { id: "flow-trader", label: "Flow Trader", icon: Zap },
  { id: "iflow", label: "iFlow Tracker", icon: Eye },
  { id: "flow-intel", label: "Flow Intel", icon: BarChart3 },
  { id: "chat", label: "Flow Chat", icon: MessageCircle },
];

/* ── Ticker Input + Analyze Bar ──────────────────────────── */

function AnalyzeBar({
  onAnalyze,
  isAnalyzing,
}: {
  onAnalyze: () => void;
  isAnalyzing: boolean;
}) {
  const { activeTicker, setActiveTicker } = useAppStore();
  const [tickerInput, setTickerInput] = useState(activeTicker);

  useEffect(() => {
    setTickerInput(activeTicker);
  }, [activeTicker]);

  const handleSubmit = useCallback(() => {
    const cleaned = tickerInput.toUpperCase().trim();
    if (cleaned) {
      setActiveTicker(cleaned);
      setTickerInput(cleaned);
    }
  }, [tickerInput, setActiveTicker]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Ticker input */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-card px-3 py-2 focus-within:border-accent-blue transition-colors">
        <Search size={16} className="text-text-muted shrink-0" />
        <input
          type="text"
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          placeholder="TICKER"
          className="bg-transparent border-none outline-none text-text-primary font-mono text-base w-24 placeholder:text-text-muted"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {/* Analyze button */}
      <button
        onClick={onAnalyze}
        disabled={isAnalyzing}
        className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-accent-purple/15 text-accent-purple hover:bg-accent-purple/25 border border-accent-purple/30 transition-all disabled:opacity-50"
      >
        {isAnalyzing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Zap size={16} />
            Analyze
          </>
        )}
      </button>
    </div>
  );
}

/* ── Flow Tab Bar ────────────────────────────────────────── */

function FlowTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: FlowTab;
  onTabChange: (tab: FlowTab) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border pb-0.5">
      {FLOW_TABS.map((tab) => {
        const active = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors rounded-t-lg"
            style={{
              color: active ? "var(--accent-blue)" : "var(--text-muted)",
              background: active ? "rgba(88,166,255,0.08)" : "transparent",
              borderBottom: active ? "2px solid var(--accent-blue)" : "2px solid transparent",
            }}
          >
            <Icon size={13} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Flow Tab Content ────────────────────────────────────── */

function AlertBellInner({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  const { data: alerts } = useFlowAlerts();
  const count = alerts?.length ?? 0;
  return (
    <button
      onClick={onClick}
      className="relative p-1.5 rounded-lg transition-colors hover:bg-bg-card-hover"
      style={{ color: count > 0 ? "var(--accent-orange)" : "var(--text-muted)" }}
    >
      <Bell size={16} fill={isOpen ? "currentColor" : "none"} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent-orange text-bg-primary text-[10px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}

function FlowTabContent({ activeTab }: { activeTab: FlowTab }) {
  switch (activeTab) {
    case "chat":
      return (
        <div className="space-y-3">
          <FetchIFlowPanel />
          <FlowChat />
        </div>
      );
    case "iflow":
      return <IFlowTracker />;
    case "flow-intel":
      return <FlowIntel />;
    case "flow-trader":
      return <FlowPaperTrading />;
    default:
      return null;
  }
}

/* ── Main Command Center Page ────────────────────────────── */

export function CommandCenterPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const [activeFlowTab, setActiveFlowTab] = useState<FlowTab>("flow-trader");
  const [showAlerts, setShowAlerts] = useState(false);

  // Detail panel slides in when the user picks a ticker (from a flow card,
  // alert, anywhere). Closed by default so flow gets full width on first load.
  const [detailOpen, setDetailOpen] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setDetailOpen(true);
  }, [ticker]);

  // Forecast Config — same settings + run loop as the /forecast page, embedded
  // here so the user can re-run with different models/horizon/origin without
  // leaving Command Center. When custom forecasts exist they override the
  // signal's per-ticker top-N for the chart display.
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS);
  const [customForecasts, setCustomForecasts] = useState<ModelForecast[]>([]);
  const [forecastOriginOverride, setForecastOriginOverride] = useState<string | undefined>();
  const [isRunningForecast, setIsRunningForecast] = useState(false);

  // Reset custom forecasts when the ticker changes (the old forecast was for
  // a different name and would be misleading on the new chart).
  useEffect(() => {
    setCustomForecasts([]);
    setForecastOriginOverride(undefined);
  }, [ticker]);

  const runCustomForecast = useCallback(async () => {
    if (!ticker || settings.selectedModels.length === 0) return;
    setIsRunningForecast(true);
    setCustomForecasts([]);
    setForecastOriginOverride(undefined);
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
          apiClient.post(endpoint, { ...body, model }).then((r) => {
            const d = r.data;
            const prices = d.prices ?? (d.predictions
              ? d.predictions.map((p: { price: number }) => p.price)
              : []);
            return {
              model,
              prices,
              end_price: d.end_price ?? d.summary?.final_price
                ?? (prices.length ? prices[prices.length - 1] : 0),
              predictions: d.predictions ?? [],
              current_price: d.current_price ?? 0,
              latency_ms: d.latency_ms ?? 0,
            } as ModelForecast;
          }),
        ),
      );
      const successful: ModelForecast[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") successful.push(r.value);
      }
      setCustomForecasts(successful);
    } catch (err) {
      console.error("Custom forecast failed:", err);
    } finally {
      setIsRunningForecast(false);
    }
  }, [ticker, settings]);

  // Data queries
  const { data: marketPrice, isLoading: priceLoading } = useMarketPrice(ticker);
  const { data: signalResult, isLoading: signalLoading } = useSignal(ticker);
  const { data: history, isLoading: historyLoading } = useMarketHistory(ticker, 180);
  const { data: trustScores, isLoading: trustLoading } = useTrustScores();
  const { data: snapshot } = useQuery({
    queryKey: ["cc-snapshot", ticker],
    queryFn: () => apiClient.get(`/command-center/snapshot?ticker=${ticker}`).then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  // Normalize history rows to OHLCV shape the chart expects.
  const historicalData: OHLCV[] = (history ?? []).map(
    (d: Record<string, number | string>) => ({
      date: String(d.date),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume),
    })
  );
  const ensembleModels = signalResult?.ensemble_models
    ?? signalResult?.models?.map((m) => m.model)
    ?? [];

  // Generate signal mutation
  const generateSignal = useGenerateSignal();

  const handleAnalyze = () => {
    generateSignal.mutate(ticker);
  };

  const signal = signalResult?.signal ?? null;
  const thesis = signalResult?.thesis ?? null;
  const models = signalResult?.models ?? [];
  const currentPrice = marketPrice?.price;

  const isAnalyzing = generateSignal.isPending;
  const isSignalLoading = signalLoading || isAnalyzing;

  return (
    <div className="space-y-5">
      {/* Page header + analyze bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Command size={24} className="text-accent-purple" />
          <h1 className="text-xl font-semibold text-text-primary">
            Command Center
          </h1>
          <span className="font-mono text-lg text-accent-blue">{ticker}</span>
        </div>
        <AnalyzeBar onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing} />
      </div>

      {/* Master/detail layout:
            - Default state: Flow workspace takes the full width (col 12).
            - Clicking any ticker (which updates activeTicker) auto-opens the
              detail panel on the right with chart + analysis + intelligence.
            - The detail panel can be dismissed via [X] to reclaim flow width.
            - When closed and a ticker is set, a tiny "Show analysis" button
              brings it back without forcing another ticker click. */}
      <div className="grid grid-cols-12 gap-4 items-start">
        <div className={detailOpen ? "col-span-12 lg:col-span-7" : "col-span-12"}>
          <div className="card">
            <div className="flex items-center justify-between gap-2">
              <FlowTabBar activeTab={activeFlowTab} onTabChange={setActiveFlowTab} />
              <div className="flex items-center gap-2">
                {!detailOpen && ticker && (
                  <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                    title="Open analysis panel for the current ticker"
                  >
                    <SidebarOpen size={14} />
                    Analysis ({ticker})
                  </button>
                )}
                <AlertBellInner onClick={() => setShowAlerts(!showAlerts)} isOpen={showAlerts} />
              </div>
            </div>

            {showAlerts && (
              <div className="mt-3 mb-3">
                <FlowAlerts />
              </div>
            )}

            <div className="mt-3">
              <FlowTabContent activeTab={activeFlowTab} />
            </div>
          </div>
        </div>

        {detailOpen && (
          <div className="col-span-12 lg:col-span-5 space-y-4">
            {/* Detail header: ticker label + close button */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-accent-blue" />
                <span className="font-mono font-semibold text-text-primary">{ticker}</span>
                <span className="text-xs text-text-muted">analysis</span>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                title="Hide analysis panel"
                aria-label="Close analysis panel"
              >
                <X size={16} />
              </button>
            </div>

            {/* Forecast configuration — re-run with different models / horizon
                / origin without leaving Command Center. When the user runs a
                custom forecast, those results override the signal's per-ticker
                top-N for the chart. */}
            <ForecastConfig
              settings={settings}
              onChange={setSettings}
              onRunForecast={runCustomForecast}
              isLoading={isRunningForecast}
            />

            {/* Chart — uses custom forecasts when available, otherwise the
                signal's per-ticker top-N. */}
            <ForecastChart
              historicalData={historicalData}
              forecasts={customForecasts.length ? customForecasts : (signalResult?.models ?? [])}
              selectedModels={customForecasts.length ? settings.selectedModels : ensembleModels}
              isLoading={historyLoading || isSignalLoading || isRunningForecast}
              forecastOrigin={forecastOriginOverride || settings.forecastOrigin}
              height={300}
            />

            {/* Analysis grid:
                  Left column  — DecisionHero
                  Right column — ModelBreakdown stacked on top of TrustScores
                  Bottom row   — ActionPanel full-width (3 sub-cards horizontal) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              <DecisionHero
                signal={signal}
                marketPrice={marketPrice ?? null}
                isLoading={isSignalLoading}
              />
              <div className="space-y-3">
                <ModelBreakdown
                  models={models}
                  currentPrice={currentPrice}
                  isLoading={isSignalLoading}
                />
                <TrustScores
                  scores={trustScores ?? []}
                  isLoading={trustLoading}
                />
              </div>
              <div className="sm:col-span-2">
                <ActionPanel
                  signal={signal}
                  currentPrice={currentPrice}
                  isLoading={isSignalLoading}
                  option={snapshot?.option ? {
                    strike: snapshot.option.strike,
                    type: snapshot.option.type,
                    expiry: snapshot.option.expiry_display || snapshot.option.expiry,
                    premium: snapshot.option.premium,
                    bid: snapshot.option.call_premium,
                    ask: snapshot.option.put_premium,
                    iv: snapshot.option.iv ? snapshot.option.iv / 100 : undefined,
                  } : undefined}
                />
              </div>
            </div>

            {/* Intelligence prose under the analysis grid */}
            <IntelligencePanel
              thesis={thesis ?? null}
              isLoading={isSignalLoading}
              currentPrice={currentPrice}
              ticker={ticker}
            />
          </div>
        )}
      </div>
    </div>
  );
}
