import { useState, useEffect, useRef, useCallback, lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { runForecastModels, useMarketHistory } from "../api/forecast";
import { createLatestRequest } from "../lib/latestRequest";
import { QueryNotice } from "../components/QueryNotice";
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
import IntelligencePanelV3 from "../features/command-center/IntelligencePanelV3";
import { NarrativeTimeline } from "../features/command-center/NarrativeTimeline";
import { ConvergenceGraph } from "../features/command-center/ConvergenceGraph";
import { FlowAlerts } from "../features/flow-analyzer/FlowAlerts";
import { IFlowTracker } from "../features/flow-analyzer/IFlowTracker";

// Every tab besides the iFlow tape is a lazy chunk fetched on first visit.
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

import { ArrowLeft, Bell, PanelRightOpen, X } from "lucide-react";

/* ── Sections ────────────────────────────────────────────────
 * Each desk section is its own route; its views are sub-routes rendered as
 * tabs in the page header. The ticker analysis panel is shared by all. */

type View = { slug: string; label: string; render: () => ReactNode };
export type DeskSection = "brief" | "flow" | "books" | "intel";

const SECTIONS: Record<DeskSection, { title: string; base: string; summary: string; views: View[] }> = {
  brief: {
    title: "Brief",
    base: "/",
    summary: "What moved, why, and what to watch today",
    views: [{ slug: "", label: "Brief", render: () => <DailyBrief /> }],
  },
  flow: {
    title: "Flow",
    base: "/flow",
    summary: "Unusual options activity",
    views: [
      { slug: "", label: "Tape", render: () => <IFlowTracker /> },
      { slug: "heatmap", label: "Heat map", render: () => <FlowHeatmap /> },
      { slug: "bounce", label: "Bounce", render: () => <BounceBoard /> },
    ],
  },
  books: {
    title: "Books",
    base: "/books",
    summary: "Paper portfolios and their decisions",
    views: [
      { slug: "", label: "TraderJoe", render: () => <SmartTrader /> },
      { slug: "flow-trader", label: "Flow Trader", render: () => <FlowPaperTrading /> },
    ],
  },
  intel: {
    title: "Intel",
    base: "/intel",
    summary: "Synthesis across flow, voices, and news",
    views: [
      { slug: "", label: "Flow intel", render: () => <FlowIntel /> },
      { slug: "voices", label: "Voices", render: () => <VoicesTab /> },
      { slug: "news", label: "News", render: () => <NewsTab /> },
    ],
  },
};

type DetailTab = "overview" | "narrative" | "graph";

const DETAIL_TABS: { value: DetailTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "narrative", label: "Narrative" },
  { value: "graph", label: "Graph" },
];

function AlertBell({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  const { data: alerts } = useFlowAlerts();
  const count = alerts?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      aria-controls="flow-alerts-panel"
      className="desk-action"
      data-active={isOpen || undefined}
    >
      <Bell size={15} aria-hidden="true" />
      <span>Alerts</span>
      {count > 0 && <span className="num desk-action__count">{count}</span>}
    </button>
  );
}

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

export function DeskPage({ section }: { section: DeskSection }) {
  const { view = "" } = useParams();
  const config = SECTIONS[section];
  const active = config.views.find((v) => v.slug === view);
  const ticker = useAppStore((s) => s.activeTicker);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");
  const [showAlerts, setShowAlerts] = useState(false);
  const isDesktop = useDesktopViewport();
  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_SETTINGS);
  const analysisTriggerRef = useRef<HTMLButtonElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  // The analysis panel opens when the user picks a ticker anywhere on the
  // page. Closed by default so the section gets full width on first load.
  const [detailOpen, setDetailOpen] = useState(false);
  const lastTicker = useRef(ticker);
  useEffect(() => {
    // Compare against the last seen ticker (not a first-render flag) so
    // StrictMode's double effect run doesn't pop the panel open on load.
    if (lastTicker.current === ticker) return;
    lastTicker.current = ticker;
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
  const historyQuery = useMarketHistory(
    ticker,
    Math.max(180, settings.historyDays),
  );
  const { data: history, isLoading: historyLoading } = historyQuery;

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

  // Forecast card: driven by the live /forecast/* endpoints, auto-runs once
  // per ticker; re-run via the config's Run button. Advisory only — no model
  // beats the random-walk baseline (see ForecastConfig).
  const [forecastResult, setForecastResult] = useState<{
    ticker: string; settings: ForecastSettings; forecasts: ModelForecast[];
  } | null>(null);
  const customForecasts = forecastResult?.ticker === ticker ? forecastResult.forecasts : [];
  const executedSettings = forecastResult?.ticker === ticker ? forecastResult.settings : settings;
  const requests = useRef(createLatestRequest());
  const [isRunningForecast, setIsRunningForecast] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);

  const runForecast = useCallback(async () => {
    if (!ticker || settings.selectedModels.length === 0) return;
    const request = requests.current.begin();
    setIsRunningForecast(true);
    setForecastError(null);
    try {
      const { forecasts, failedModels } = await runForecastModels(ticker, settings, request.signal);
      if (!request.isCurrent()) return;
      setForecastResult({ ticker, settings, forecasts });
      if (failedModels.length > 0) {
        setForecastError(
          forecasts.length > 0
            ? `Unavailable models: ${failedModels.join(", ")}`
            : "Forecast models are currently unavailable.",
        );
      }
    } catch (err) {
      if (!request.isCurrent()) return;
      console.error("Forecast run failed:", err);
      setForecastResult(null);
      setForecastError("Forecast request failed. Try again shortly.");
    } finally {
      if (request.isCurrent()) setIsRunningForecast(false);
    }
  }, [ticker, settings]);

  // Only fetch forecasts while the panel is actually open.
  const runForecastRef = useRef(runForecast);
  useEffect(() => { runForecastRef.current = runForecast; }, [runForecast]);
  useEffect(() => {
    const current = requests.current;
    if (ticker && detailOpen) void runForecastRef.current();
    return () => current.cancel();
  }, [ticker, detailOpen]);

  const openDetail = () => {
    setDetailOpen(true);
    window.setTimeout(() => detailPanelRef.current?.focus(), 0);
  };

  if (!active) return <Navigate to={config.base} replace />;

  return (
    <div className="desk-page" data-section={section}>
      <header className="desk-header">
        <div className="desk-header__title">
          <h1>{config.title}</h1>
          <p>{config.summary}</p>
        </div>
        <div className="desk-header__actions">
          {!detailOpen && ticker && (
            <button
              ref={analysisTriggerRef}
              type="button"
              onClick={openDetail}
              aria-expanded={detailOpen}
              aria-controls="command-center-analysis-panel"
              className="desk-action"
            >
              <PanelRightOpen size={15} aria-hidden="true" />
              <span className="num">{ticker}</span>
            </button>
          )}
          {section === "flow" && (
            <AlertBell onClick={() => setShowAlerts(!showAlerts)} isOpen={showAlerts} />
          )}
          <TickerSearch className="desk-search lg:hidden" inputWidth="w-full" />
        </div>
        {config.views.length > 1 && (
          <nav className="desk-tabs" aria-label={`${config.title} views`}>
            {config.views.map((v) => (
              <NavLink
                key={v.slug}
                to={v.slug ? `${config.base}/${v.slug}` : config.base}
                end
                className={({ isActive }) => `desk-tab ${isActive ? "desk-tab--active" : ""}`}
              >
                {v.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <div className={`desk-body ${detailOpen ? "desk-body--split" : ""}`}>
        <section className="desk-main" aria-label={active.label}>
          {showAlerts && section === "flow" && (
            <div id="flow-alerts-panel" className="mb-4">
              <FlowAlerts />
            </div>
          )}
          <Suspense
            fallback={
              <div className="page-loading" role="status" aria-live="polite">
                <span className="page-loading__bar" />
                <span className="page-loading__bar page-loading__bar--short" />
                <span className="sr-only">Loading {active.label}</span>
              </div>
            }
          >
            {active.render()}
          </Suspense>
        </section>

        {detailOpen && (
          <aside
            ref={detailPanelRef}
            id="command-center-analysis-panel"
            tabIndex={-1}
            role={isDesktop ? "complementary" : "dialog"}
            aria-modal={isDesktop ? undefined : true}
            aria-label={`${ticker} analysis`}
            className="command-detail-workspace"
          >
            <div className="command-detail-sticky">
              <div className="command-detail-heading">
                <button
                  type="button"
                  onClick={closeDetail}
                  className="command-detail-back lg:hidden"
                >
                  <ArrowLeft size={17} aria-hidden="true" />
                  <span>Back</span>
                </button>
                <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
                  <h2 className="ticker truncate text-2xl leading-none tracking-tight">{ticker}</h2>
                  <span className="hidden truncate text-sm text-text-muted sm:inline">Ticker analysis</span>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="command-detail-close"
                  title="Close analysis"
                  aria-label="Close analysis panel"
                >
                  <X size={17} aria-hidden="true" />
                </button>
              </div>

              <Segmented<DetailTab>
                ariaLabel="Analysis view"
                className="w-full"
                options={DETAIL_TABS}
                value={activeDetailTab}
                onChange={setActiveDetailTab}
              />
            </div>

            <div className="command-detail-content" style={{ gap: "2.25rem", paddingTop: "0.5rem" }}>
              {activeDetailTab === "overview" ? (
              <>
                <SignalAnalysisCard ticker={ticker} />
                <ThemePulseCard ticker={ticker} />
                <GraphContextCard ticker={ticker} />
                <section className="flex flex-col gap-4" aria-label="Forecast">
                  <ForecastConfig
                    settings={settings}
                    onChange={setSettings}
                    onRunForecast={runForecast}
                    isLoading={isRunningForecast}
                    ticker={ticker}
                  />
                  {forecastError && (
                    <p role="alert" className="callout" style={{ "--callout": "var(--accent-red)" } as CSSProperties}>
                      {forecastError}
                    </p>
                  )}
                  <ForecastChart
                    historicalData={historicalData}
                    forecasts={customForecasts}
                    selectedModels={executedSettings.selectedModels}
                    isLoading={historyLoading || isRunningForecast}
                    forecastOrigin={executedSettings.forecastOrigin}
                    intraday={executedSettings.forecastType === "intraday"}
                    overlays={settings}
                    height={300}
                  />
                  <QueryNotice queries={[historyQuery]} label="Price history" />
                  <ModelBreakdown
                    models={customForecasts}
                    isLoading={isRunningForecast}
                  />
                </section>
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
