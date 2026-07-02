import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useAppStore } from "../store/useAppStore";
import { useMarketHistory, useMarketPrice } from "../api/forecast";
import { useFlowAlerts } from "../api/flow";

// Command Center feature components
import { DailyBrief } from "../features/command-center/DailyBrief";
import { SignalAnalysisCard } from "../features/command-center/SignalAnalysisCard";
import { GraphContextCard } from "../features/command-center/GraphContextCard";
import { ThemePulseCard } from "../features/command-center/ThemePulseCard";
import { ForecastChart } from "../features/forecast/ForecastChart";
import { ForecastConfig, DEFAULT_SETTINGS, type ForecastSettings } from "../features/forecast/ForecastConfig";
import { ModelBreakdown } from "../features/command-center/ModelBreakdown";
import apiClient from "../api/client";
import type { OHLCV, ModelForecast } from "../lib/types";
import { TickerSearch } from "../components/TickerSearch";
import { Segmented } from "../components/Glass";
import { IntelligencePanel } from "../features/command-center/IntelligencePanel";
import IntelligencePanelV3 from "../features/command-center/IntelligencePanelV3";
import { NarrativeTimeline } from "../features/command-center/NarrativeTimeline";
import { ConvergenceGraph } from "../features/command-center/ConvergenceGraph";
// Keep `IntelligencePanel` referenced so the fallback import survives
// `noUnusedLocals`. Swap `<IntelligencePanelV3 />` below for `<IntelligencePanel ... />`
// to revert the panel if V3 misbehaves.
const _IntelligencePanelFallback = IntelligencePanel;
void _IntelligencePanelFallback;

// Flow Analyzer feature components. iFlow is the default tab so it loads
// eagerly; the other six tabs are lazy chunks fetched on first click —
// they were the bulk of this page's 900KB bundle.
import { FlowAlerts } from "../features/flow-analyzer/FlowAlerts";
import { IFlowTracker } from "../features/flow-analyzer/IFlowTracker";

const FlowHeatmap = lazy(() =>
  import("../features/flow-analyzer/FlowHeatmap").then((m) => ({ default: m.FlowHeatmap })),
);
const FlowPaperTrading = lazy(() =>
  import("../features/flow-analyzer/FlowPaperTrading").then((m) => ({ default: m.FlowPaperTrading })),
);
const SmartTrader = lazy(() =>
  import("../features/flow-analyzer/SmartTrader").then((m) => ({ default: m.SmartTrader })),
);
const FlowIntel = lazy(() =>
  import("../features/flow-analyzer/FlowIntel").then((m) => ({ default: m.FlowIntel })),
);
const VoicesTab = lazy(() =>
  import("../features/flow-analyzer/VoicesTab").then((m) => ({ default: m.VoicesTab })),
);
const NewsTab = lazy(() =>
  import("../features/flow-analyzer/NewsTab").then((m) => ({ default: m.NewsTab })),
);

import {
  Command,
  Zap,
  Eye,
  Bell,
  BarChart3,
  Brain,
  X,
  SidebarOpen,
  Mic2,
  Globe,
  Grid3x3,
  GitBranch,
  Network,
} from "lucide-react";

/* ── Tab definitions ─────────────────────────────────────── */

type FlowTab =
  | "picks"
  | "iflow"
  | "heatmap"
  | "flow-trader"
  | "smart-trader"
  | "flow-intel"
  | "voices"
  | "news";

const FLOW_TABS: { id: FlowTab; label: string; icon: React.ElementType }[] = [
  { id: "iflow", label: "iFlow Tracker", icon: Eye },
  { id: "heatmap", label: "Heat Map", icon: Grid3x3 },
  { id: "flow-trader", label: "Flow Trader", icon: Zap },
  { id: "smart-trader", label: "Smart Trader", icon: Brain },
  { id: "flow-intel", label: "Flow Intel", icon: BarChart3 },
  { id: "voices", label: "Voices", icon: Mic2 },
  { id: "news", label: "News", icon: Globe },
];

/* Visual grouping only — same 7 tabs/keys, clustered by what they answer:
 * FLOW = live options tape, BOOKS = the paper books, INTEL = synthesis. */
const FLOW_TAB_GROUPS: { label: string; tabs: FlowTab[] }[] = [
  { label: "Flow", tabs: ["iflow", "heatmap"] },
  { label: "Books", tabs: ["smart-trader", "flow-trader"] },
  { label: "Intel", tabs: ["flow-intel", "voices", "news"] },
];

type DetailTab = "overview" | "narrative" | "graph";

const DETAIL_TABS: { id: DetailTab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "narrative", label: "Narrative", icon: GitBranch },
  { id: "graph", label: "Graph", icon: Network },
];

/* ── Flow Tab Bar ────────────────────────────────────────── */

function FlowTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: FlowTab;
  onTabChange: (tab: FlowTab) => void;
}) {
  const byId = new Map(FLOW_TABS.map((t) => [t.id, t]));
  return (
    <div className="flex items-end gap-3 flex-wrap max-md:gap-2">
      {FLOW_TAB_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="pl-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted leading-none">
            {group.label}
          </span>
          <Segmented<FlowTab>
            options={group.tabs.map((id) => {
              const tab = byId.get(id)!;
              const Icon = tab.icon;
              return {
                value: id,
                label: (
                  <>
                    <Icon size={13} />
                    {tab.label}
                  </>
                ),
              };
            })}
            value={activeTab}
            onChange={onTabChange}
          />
        </div>
      ))}
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
      className="relative p-1.5 rounded-full transition-colors hover:bg-bg-card-hover"
      style={{ color: count > 0 ? "var(--accent-orange)" : "var(--text-muted)" }}
    >
      <Bell size={16} fill={isOpen ? "currentColor" : "none"} />
      {count > 0 && (
        <span className="num absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent-orange text-bg-primary text-[10px] font-bold flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}

function FlowTabContent({ activeTab }: { activeTab: FlowTab }) {
  const tab = (() => {
    switch (activeTab) {
      case "iflow":
        return <IFlowTracker />;
      case "heatmap":
        return <FlowHeatmap />;
      case "flow-intel":
        return <FlowIntel />;
      case "flow-trader":
        return <FlowPaperTrading />;
      case "smart-trader":
        return <SmartTrader />;
      case "voices":
        return <VoicesTab />;
      case "news":
        return <NewsTab />;
      default:
        return null;
    }
  })();
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-text-muted animate-pulse">loading…</div>
      }
    >
      {tab}
    </Suspense>
  );
}

/* ── Main Command Center Page ────────────────────────────── */

export function CommandCenterPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const [activeFlowTab, setActiveFlowTab] = useState<FlowTab>("iflow");
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");
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
    const id = window.setTimeout(() => setDetailOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [ticker]);

  // Data query — historical OHLCV powers the candlestick price chart. The
  // deprecated 8-model forecast/signal stack (predicted-price overlays,
  // DecisionHero verdict, ForecastConfig) was removed 2026-06-24; this is now a
  // pure price chart fed by live market history. See task #38.
  const { data: history, isLoading: historyLoading } = useMarketHistory(ticker, 180);

  // Normalize history rows to OHLCV shape the chart expects.
  const historicalData: OHLCV[] = (history ?? []).map(
    (d) => ({
      date: String(d.date),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume),
    })
  );

  // ── Forecast — restored multi-model forecast card (config + chart overlays +
  //    per-model breakdown). Driven entirely by the live /forecast/* endpoints;
  //    the deprecated /signals auto-source is NOT used. Auto-runs once per ticker
  //    so the card populates without a manual click; re-run via the config's Run
  //    button after changing models/horizon/origin. NOTE: the underlying 8-model
  //    stack lost to a random-walk baseline on CRPS (2026-05-30) — the numbers
  //    are advisory, not a tradable price target.
  const { data: marketPrice } = useMarketPrice(ticker);
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS);
  const [customForecasts, setCustomForecasts] = useState<ModelForecast[]>([]);
  const [isRunningForecast, setIsRunningForecast] = useState(false);

  const runForecast = useCallback(async () => {
    if (!ticker || settings.selectedModels.length === 0) return;
    setIsRunningForecast(true);
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
            const prices: number[] =
              d.prices ?? (d.predictions?.map((p: { price: number }) => p.price) ?? []);
            return {
              model,
              prices,
              end_price:
                d.end_price ??
                d.summary?.final_price ??
                (prices.length ? prices[prices.length - 1] : 0),
              predictions: d.predictions ?? [],
              current_price: d.current_price ?? 0,
              latency_ms: d.latency_ms ?? 0,
            } as ModelForecast;
          }),
        ),
      );
      const successful: ModelForecast[] = [];
      for (const r of results) if (r.status === "fulfilled") successful.push(r.value);
      setCustomForecasts(successful);
    } catch (err) {
      console.error("Forecast run failed:", err);
    } finally {
      setIsRunningForecast(false);
    }
  }, [ticker, settings]);

  // Auto-run once per ticker (clears the prior ticker's forecast first). Settings
  // edits don't re-trigger — the user re-runs explicitly via the config button.
  const autoRanFor = useRef<string>("");
  useEffect(() => {
    if (!ticker || autoRanFor.current === ticker) return;
    autoRanFor.current = ticker;
    setCustomForecasts([]);
    void runForecast();
  }, [ticker, runForecast]);

  return (
    <div className="space-y-5">
      {/* Page header + analyze bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <Command size={20} className="text-accent-purple self-center" />
          <h1 className="text-lg font-semibold text-text-primary">
            Command Center
          </h1>
          <span className="num text-lg font-semibold text-accent-blue">{ticker}</span>
        </div>
        {/* Ticker / company-name search */}
        <TickerSearch inputWidth="w-44" />
      </div>

      {/* Daily Brief — JARVIS-style situational read at the very top: regime,
          today's agenda, your paper books, cross-source convergence, theme heat,
          plus a cached Claude "Read" that prioritises the day with a
          capital-preservation stance. */}
      <DailyBrief />

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
            <div className="flex items-start justify-between gap-2">
              <FlowTabBar activeTab={activeFlowTab} onTabChange={setActiveFlowTab} />
              <div className="flex items-center gap-2 self-end pb-0.5">
                {!detailOpen && ticker && (
                  <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                    title="Open analysis panel for the current ticker"
                  >
                    <SidebarOpen size={14} />
                    Analysis (<span className="num">{ticker}</span>)
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
                <span className="num font-semibold text-text-primary">{ticker}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                  analysis
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                title="Hide analysis panel"
                aria-label="Close analysis panel"
              >
                <X size={16} />
              </button>
            </div>

            <Segmented<DetailTab>
              className="w-full justify-between max-md:justify-start"
              options={DETAIL_TABS.map((tab) => {
                const Icon = tab.icon;
                return {
                  value: tab.id,
                  label: (
                    <>
                      <Icon size={13} />
                      {tab.label}
                    </>
                  ),
                };
              })}
              value={activeDetailTab}
              onChange={setActiveDetailTab}
            />

            {activeDetailTab === "overview" ? (
              <>
                {/* Signal Analysis — reliable per-ticker read at the TOP, replacing
                    the deprecated 8-model price forecast. Three auditable sources:
                    deterministic Technical, cross-source Convergence, and the
                    production ML peak-potential. No discredited price target. */}
                <SignalAnalysisCard ticker={ticker} />

                {/* Theme Pulse — zoom out from the active ticker to its whole
                    taxonomy theme: which names are plays-now vs wait, ranked by an
                    auditable quant score, with a one-paragraph theme read. Sits
                    above Graph context as the "what's the play across this group"
                    lead-in. Self-hides when the theme has no pulse yet. */}
                <ThemePulseCard ticker={ticker} />

                {/* Knowledge-graph context — competitors / supply-chain neighbors
                    for the active ticker, pulled from the Understand-Anything graph.
                    Self-hides when the graph isn't built or the ticker has no
                    neighbors. Chip clicks swap activeTicker. */}
                <GraphContextCard ticker={ticker} />

                {/* Forecast — restored multi-model forecast card: config (model
                    picker / horizon / origin / Run) + price chart with model
                    overlays & quantile band + per-model breakdown. Auto-runs on
                    ticker change; re-run after editing the config. Numbers come
                    from the live /forecast/* engine (advisory — the 8-model stack
                    lost to a random-walk baseline on CRPS). */}
                <ForecastConfig
                  settings={settings}
                  onChange={setSettings}
                  onRunForecast={runForecast}
                  isLoading={isRunningForecast}
                  ticker={ticker}
                />
                <ForecastChart
                  historicalData={historicalData}
                  forecasts={customForecasts}
                  selectedModels={settings.selectedModels}
                  isLoading={historyLoading || isRunningForecast}
                  forecastOrigin={settings.forecastOrigin}
                  height={300}
                />
                <ModelBreakdown
                  models={customForecasts}
                  currentPrice={marketPrice?.price}
                  isLoading={isRunningForecast}
                />

                {/* Intelligence prose under the analysis grid.
                    V3 = convergence-first panel (news + iFlow + voices + traders
                    + forecast merged into a single verdict + reaction timeline +
                    forward calendar). Old IntelligencePanel embeds inside V3's
                    bottom collapsible, so the 8-category view remains one click
                    away. The original import is kept above as a fallback. */}
                <IntelligencePanelV3 />
              </>
            ) : activeDetailTab === "narrative" ? (
              <NarrativeTimeline ticker={ticker} hours={72} />
            ) : (
              <ConvergenceGraph ticker={ticker} hours={72} limit={50} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
