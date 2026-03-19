import { useState, useCallback } from "react";
import { useAppStore } from "../store/useAppStore";
import { useMarketPrice } from "../api/forecast";
import { useSignal, useGenerateSignal } from "../api/signals";
import { useTrustScores } from "../api/eval";

// Command Center feature components
import { DecisionHero } from "../features/command-center/DecisionHero";
import { ActionPanel } from "../features/command-center/ActionPanel";
import { ModelBreakdown } from "../features/command-center/ModelBreakdown";
import { TrustScores } from "../features/command-center/TrustScores";
import { IntelligencePanel } from "../features/command-center/IntelligencePanel";

// Flow Analyzer feature components
import { FlowAlerts } from "../features/flow-analyzer/FlowAlerts";
import { FlowChat } from "../features/flow-analyzer/FlowChat";
import { ActivePicks } from "../features/flow-analyzer/ActivePicks";
import { PickHistory } from "../features/flow-analyzer/PickHistory";
import { OwlsTracker } from "../features/flow-analyzer/OwlsTracker";

// Paper Trading
import { PaperTrading } from "../features/paper-trading/PaperTrading";

import {
  Command,
  Search,
  Loader2,
  Zap,
  MessageCircle,
  Target,
  History,
  Eye,
  Wallet,
} from "lucide-react";

/* ── Tab definitions ─────────────────────────────────────── */

type FlowTab = "chat" | "picks" | "history" | "owls" | "paper";

const FLOW_TABS: { id: FlowTab; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Flow Chat", icon: MessageCircle },
  { id: "picks", label: "Active Picks", icon: Target },
  { id: "history", label: "History", icon: History },
  { id: "owls", label: "OWLS Tracker", icon: Eye },
  { id: "paper", label: "Paper Trading", icon: Wallet },
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

function FlowTabContent({ activeTab }: { activeTab: FlowTab }) {
  switch (activeTab) {
    case "chat":
      return <FlowChat />;
    case "picks":
      return <ActivePicks />;
    case "history":
      return <PickHistory />;
    case "owls":
      return <OwlsTracker />;
    case "paper":
      return <PaperTrading />;
    default:
      return null;
  }
}

/* ── Main Command Center Page ────────────────────────────── */

export function CommandCenterPage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const [activeFlowTab, setActiveFlowTab] = useState<FlowTab>("chat");

  // Data queries
  const { data: marketPrice, isLoading: priceLoading } = useMarketPrice(ticker);
  const { data: signalResult, isLoading: signalLoading } = useSignal(ticker);
  const { data: trustScores, isLoading: trustLoading } = useTrustScores(ticker);

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

      {/* Top row: Decision Hero + Action Panel */}
      <div className="grid grid-cols-12 gap-4">
        {/* Decision Hero - left column */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <DecisionHero
            signal={signal}
            marketPrice={marketPrice ?? null}
            isLoading={isSignalLoading}
          />
        </div>

        {/* Action Panel - right columns */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9">
          <ActionPanel
            signal={signal}
            currentPrice={currentPrice}
            isLoading={isSignalLoading}
          />
        </div>
      </div>

      {/* Flow Analyzer Section */}
      <div className="card">
        {/* Tab bar */}
        <FlowTabBar activeTab={activeFlowTab} onTabChange={setActiveFlowTab} />

        {/* Flow alerts - always visible above tab content */}
        <div className="mt-3 mb-3">
          <FlowAlerts />
        </div>

        {/* Tab content */}
        <div className="mt-3">
          <FlowTabContent activeTab={activeFlowTab} />
        </div>
      </div>

      {/* Bottom row: Model Breakdown + Trust Scores + Intelligence */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4">
          <ModelBreakdown
            models={models}
            currentPrice={currentPrice}
            isLoading={isSignalLoading}
          />
        </div>
        <div className="col-span-12 md:col-span-4">
          <TrustScores
            scores={trustScores ?? []}
            isLoading={trustLoading}
          />
        </div>
        <div className="col-span-12 md:col-span-4">
          <IntelligencePanel
            thesis={thesis ?? null}
            isLoading={isSignalLoading}
          />
        </div>
      </div>
    </div>
  );
}
