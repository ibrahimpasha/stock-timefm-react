import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { useMarketHistory } from "../api/forecast";
import { useFlowAlerts } from "../api/flow";

// Command Center feature components
import { DailyBrief } from "../features/command-center/DailyBrief";
import { SignalAnalysisCard } from "../features/command-center/SignalAnalysisCard";
import { GraphContextCard } from "../features/command-center/GraphContextCard";
import { ThemePulseCard } from "../features/command-center/ThemePulseCard";
import { ForecastChart } from "../features/forecast/ForecastChart";
import type { OHLCV } from "../lib/types";
import { TickerSearch } from "../components/TickerSearch";
import { IntelligencePanel } from "../features/command-center/IntelligencePanel";
import IntelligencePanelV3 from "../features/command-center/IntelligencePanelV3";
// Keep `IntelligencePanel` referenced so the fallback import survives
// `noUnusedLocals`. Swap `<IntelligencePanelV3 />` below for `<IntelligencePanel ... />`
// to revert the panel if V3 misbehaves.
const _IntelligencePanelFallback = IntelligencePanel;
void _IntelligencePanelFallback;

// Flow Analyzer feature components
import { FlowAlerts } from "../features/flow-analyzer/FlowAlerts";
import { IFlowTracker } from "../features/flow-analyzer/IFlowTracker";
import { FlowHeatmap } from "../features/flow-analyzer/FlowHeatmap";

import { FlowPaperTrading } from "../features/flow-analyzer/FlowPaperTrading";
import { SmartTrader } from "../features/flow-analyzer/SmartTrader";
import { FlowIntel } from "../features/flow-analyzer/FlowIntel";
import { VoicesTab } from "../features/flow-analyzer/VoicesTab";
import { NewsTab } from "../features/flow-analyzer/NewsTab";

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
}

/* ── Main Command Center Page ────────────────────────────── */

export function CommandCenterPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const [activeFlowTab, setActiveFlowTab] = useState<FlowTab>("iflow");
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

            {/* Price chart — candlesticks + volume + MA overlays from live
                market history. The deprecated forecast overlays / model-config
                were removed (task #38); this is now a pure price chart. */}
            <ForecastChart
              historicalData={historicalData}
              forecasts={[]}
              selectedModels={[]}
              isLoading={historyLoading}
              height={300}
            />

            {/* Intelligence prose under the analysis grid.
                V3 = convergence-first panel (news + iFlow + voices + traders
                + forecast merged into a single verdict + reaction timeline +
                forward calendar). Old IntelligencePanel embeds inside V3's
                bottom collapsible, so the 8-category view remains one click
                away. The original import is kept above as a fallback. */}
            <IntelligencePanelV3 />
          </div>
        )}
      </div>
    </div>
  );
}
