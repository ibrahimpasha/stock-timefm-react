import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useAppStore } from "../store/useAppStore";
import { runForecastModels, useMarketHistory, useMarketPrice } from "../api/forecast";
import { useFlowAlerts } from "../api/flow";

// Command Center feature components
import { DailyBrief } from "../features/command-center/DailyBrief";
import { SignalAnalysisCard } from "../features/command-center/SignalAnalysisCard";
import { GraphContextCard } from "../features/command-center/GraphContextCard";
import { ThemePulseCard } from "../features/command-center/ThemePulseCard";
import { ForecastChart } from "../features/forecast/ForecastChart";
import { ForecastConfig, DEFAULT_SETTINGS, type ForecastSettings } from "../features/forecast/ForecastConfig";
import { ModelBreakdown } from "../features/command-center/ModelBreakdown";
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
const BounceBoard = lazy(() =>
  import("../features/flow-analyzer/BounceBoard").then((m) => ({ default: m.BounceBoard })),
);

import {
  ArrowLeft,
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
  Activity,
  ChevronDown,
} from "lucide-react";

/* ── Tab definitions ─────────────────────────────────────── */

type FlowTab =
  | "picks"
  | "iflow"
  | "heatmap"
  | "bounce"
  | "flow-trader"
  | "smart-trader"
  | "flow-intel"
  | "voices"
  | "news";

const FLOW_TABS: { id: FlowTab; label: string; icon: React.ElementType }[] = [
  { id: "iflow", label: "iFlow Tracker", icon: Eye },
  { id: "heatmap", label: "Heat Map", icon: Grid3x3 },
  { id: "bounce", label: "Bounce", icon: Activity },
  { id: "flow-trader", label: "Flow Trader", icon: Zap },
  { id: "smart-trader", label: "TraderJoe", icon: Brain },
  { id: "flow-intel", label: "Flow Intel", icon: BarChart3 },
  { id: "voices", label: "Voices", icon: Mic2 },
  { id: "news", label: "News", icon: Globe },
];

/* Visual grouping only — same 7 tabs/keys, clustered by what they answer:
 * FLOW = live options tape, BOOKS = the paper books, INTEL = synthesis. */
const FLOW_TAB_GROUPS: { label: string; tabs: FlowTab[] }[] = [
  { label: "Flow", tabs: ["iflow", "heatmap", "bounce"] },
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
    <div className="min-w-0 flex-1">
      <Segmented<FlowTab>
        ariaLabel="Flow workspace"
        className="w-full lg:hidden"
        options={FLOW_TABS.map((tab) => {
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
        value={activeTab}
        onChange={onTabChange}
      />

      <div className="hidden flex-wrap items-end gap-3 lg:flex">
        {FLOW_TAB_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="pl-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted leading-none">
              {group.label}
            </span>
            <Segmented<FlowTab>
              ariaLabel={`${group.label} flow views`}
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
    </div>
  );
}

/* ── Flow Tab Content ────────────────────────────────────── */

function AlertBellInner({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  const { data: alerts } = useFlowAlerts();
  const count = alerts?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls="flow-alerts-panel"
      aria-label={`${isOpen ? "Hide" : "Show"} flow alerts${count > 0 ? `, ${count} available` : ""}`}
      className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-bg-card-hover lg:min-h-0 lg:min-w-0 lg:p-1.5"
      style={{ color: count > 0 ? "var(--accent-orange)" : "var(--text-muted)" }}
    >
      <Bell size={16} fill={isOpen ? "currentColor" : "none"} aria-hidden="true" />
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
      case "bounce":
        return <BounceBoard />;
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

function useDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

export function CommandCenterPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const [activeFlowTab, setActiveFlowTab] = useState<FlowTab>("iflow");
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");
  const [showAlerts, setShowAlerts] = useState(false);
  const [mobileBriefOpen, setMobileBriefOpen] = useState(false);
  const isDesktop = useDesktopViewport();
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS);
  const analysisTriggerRef = useRef<HTMLButtonElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // Detail panel slides in when the user picks a ticker (from a flow card,
  // alert, anywhere). Closed by default so flow gets full width on first load.
  const [detailOpen, setDetailOpen] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Phone flow uses its own list -> ticker detail transition. Automatically
    // opening this second analysis layer would replace the detail just chosen.
    if (window.matchMedia("(max-width: 1023px)").matches) return;
    const id = window.setTimeout(() => setDetailOpen(true), 0);
    return () => window.clearTimeout(id);
  }, [ticker]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(() => analysisTriggerRef.current?.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetail, detailOpen]);

  useEffect(() => {
    if (!detailOpen || isDesktop) return;
    const panel = detailPanelRef.current;
    if (!panel) return;
    const selector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(selector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", containFocus);
    return () => window.removeEventListener("keydown", containFocus);
  }, [detailOpen, isDesktop]);

  // Keep enough candles to show the selected training window and historical
  // forecast origin on the same chart.
  const { data: history, isLoading: historyLoading } = useMarketHistory(
    ticker,
    Math.max(180, settings.historyDays),
  );

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
  const [customForecasts, setCustomForecasts] = useState<ModelForecast[]>([]);
  const [isRunningForecast, setIsRunningForecast] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const runForecast = useCallback(async () => {
    if (!ticker || settings.selectedModels.length === 0) return;
    setIsRunningForecast(true);
    setForecastError(null);
    try {
      const { forecasts, failedModels } = await runForecastModels(ticker, settings);
      setCustomForecasts(forecasts);
      if (failedModels.length > 0) {
        setForecastError(
          forecasts.length > 0
            ? `Unavailable models: ${failedModels.join(", ")}`
            : "Forecast models are currently unavailable.",
        );
      }
    } catch (err) {
      console.error("Forecast run failed:", err);
      setCustomForecasts([]);
      setForecastError("Forecast request failed. Try again shortly.");
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
    setForecastError(null);
    void runForecast();
  }, [ticker, runForecast]);

  const openDetail = () => {
    setDetailOpen(true);
    window.setTimeout(() => detailPanelRef.current?.focus(), 0);
  };

  return (
    <div className="command-center-page">
      {/* Page header + analyze bar */}
      <header className="command-context-bar">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="command-context-mark" aria-hidden="true">
            <Command size={17} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-text-primary lg:text-lg">
              Command Center
            </h1>
            <p className="truncate text-xs text-text-muted lg:hidden">
              <span className="num font-semibold text-accent-blue">{ticker}</span>
              <span aria-hidden="true"> · </span>
              decision workspace
            </p>
          </div>
          <span className="num hidden text-sm font-semibold text-accent-blue lg:inline">{ticker}</span>
        </div>
        <TickerSearch className="command-ticker-search" inputWidth="w-44 max-sm:w-full" />
      </header>

      {/* Daily Brief — JARVIS-style situational read at the very top: regime,
          today's agenda, your paper books, cross-source convergence, theme heat,
          plus a cached Claude "Read" that prioritises the day with a
          capital-preservation stance. */}
      <details
        className="command-mobile-brief"
        open={isDesktop || mobileBriefOpen}
        onToggle={(event) => {
          if (!isDesktop) setMobileBriefOpen(event.currentTarget.open);
        }}
      >
        <summary className="lg:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <Activity size={15} className="shrink-0 text-accent-green" aria-hidden="true" />
            <span className="truncate text-xs font-semibold text-text-primary">Daily brief</span>
          </span>
          <ChevronDown className="command-mobile-brief__chevron" size={16} aria-hidden="true" />
        </summary>
        <div className="command-mobile-brief__content command-daily-brief">
          <DailyBrief />
        </div>
      </details>

      {/* Master/detail layout:
            - Default state: Flow workspace takes the full width (col 12).
            - Clicking any ticker (which updates activeTicker) auto-opens the
              detail panel on the right with chart + analysis + intelligence.
            - The detail panel can be dismissed via [X] to reclaim flow width.
            - When closed and a ticker is set, a tiny "Show analysis" button
              brings it back without forcing another ticker click. */}
      <div className="command-center-workspace grid min-w-0 grid-cols-12 items-start gap-4">
        <div
          className={`${detailOpen ? "col-span-12 max-lg:hidden lg:col-span-7" : "col-span-12"} command-master-workspace min-w-0`}
        >
          <section className="command-workspace-surface min-w-0 overflow-hidden" aria-label="Flow workspace">
            <div className="command-flow-toolbar flex min-w-0 items-start justify-between gap-2">
              <FlowTabBar activeTab={activeFlowTab} onTabChange={setActiveFlowTab} />
              <div className="flex shrink-0 items-center gap-1 self-end pb-0.5 md:gap-2">
                {!detailOpen && ticker && (
                  <button
                    ref={analysisTriggerRef}
                    type="button"
                    onClick={openDetail}
                    aria-expanded={detailOpen}
                    aria-controls="command-center-analysis-panel"
                    className="analysis-trigger"
                    title="Open analysis panel for the current ticker"
                  >
                    <SidebarOpen size={14} />
                    <span className="hidden sm:inline">Analysis</span>
                    <span className="num">{ticker}</span>
                  </button>
                )}
                <AlertBellInner onClick={() => setShowAlerts(!showAlerts)} isOpen={showAlerts} />
              </div>
            </div>

            {showAlerts && (
              <div id="flow-alerts-panel" className="mt-3 mb-3">
                <FlowAlerts />
              </div>
            )}

            <div className="command-flow-content mt-3">
              <FlowTabContent activeTab={activeFlowTab} />
            </div>
          </section>
        </div>

        {detailOpen && (
          <aside
            ref={detailPanelRef}
            id="command-center-analysis-panel"
            tabIndex={-1}
            role={isDesktop ? "complementary" : "dialog"}
            aria-modal={isDesktop ? undefined : true}
            aria-label={`${ticker} analysis workspace`}
            className="command-detail-workspace col-span-12 min-w-0 lg:col-span-5"
          >
            <div className="command-detail-sticky">
              <div className="command-detail-heading">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="command-detail-back lg:hidden"
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  <span>Back to desk</span>
                </button>
                <div className="hidden min-w-0 items-center gap-2 lg:flex">
                  <BarChart3 size={16} className="shrink-0 text-accent-blue" aria-hidden="true" />
                  <span className="num truncate font-semibold text-text-primary">{ticker}</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                    analysis
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2 lg:hidden">
                  <span className="num truncate text-sm font-semibold text-text-primary">{ticker}</span>
                  <span className="text-xs text-text-muted">Analysis</span>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="command-detail-close"
                  title="Hide analysis panel"
                  aria-label="Close analysis panel"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <Segmented<DetailTab>
                ariaLabel="Analysis view"
                className="w-full justify-between"
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
            </div>

            <div className="command-detail-content">
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
                {forecastError && (
                  <p role="alert" className="text-xs text-accent-red px-1">
                    {forecastError}
                  </p>
                )}
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
          </aside>
        )}
      </div>
    </div>
  );
}
