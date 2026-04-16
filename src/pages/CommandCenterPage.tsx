import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "../store/useAppStore";
import { useMarketPrice } from "../api/forecast";
import { useSignal, useGenerateSignal } from "../api/signals";
import { useTrustScores } from "../api/eval";
import { useFlowAlerts } from "../api/flow";
import apiClient from "../api/client";

// Command Center feature components
import { DecisionHero } from "../features/command-center/DecisionHero";
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

  // Data queries
  const { data: marketPrice, isLoading: priceLoading } = useMarketPrice(ticker);
  const { data: signalResult, isLoading: signalLoading } = useSignal(ticker);
  const { data: trustScores, isLoading: trustLoading } = useTrustScores();
  const { data: snapshot } = useQuery({
    queryKey: ["cc-snapshot", ticker],
    queryFn: () => apiClient.get(`/command-center/snapshot?ticker=${ticker}`).then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

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

      {/* Two-column layout: Left (analysis) + Right (flow engine) */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left column: Signal + Models + Intelligence */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <DecisionHero
            signal={signal}
            marketPrice={marketPrice ?? null}
            isLoading={isSignalLoading}
          />
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
          <ModelBreakdown
            models={models}
            currentPrice={currentPrice}
            isLoading={isSignalLoading}
          />
          <TrustScores
            scores={trustScores ?? []}
            isLoading={trustLoading}
          />
          <IntelligencePanel
            thesis={thesis ?? null}
            isLoading={isSignalLoading}
            currentPrice={currentPrice}
          />
        </div>

        {/* Right column: Flow Analyzer (wider, primary workspace) */}
        <div className="col-span-12 lg:col-span-8">
          <div className="card sticky top-4">
            <div className="flex items-center justify-between">
              <FlowTabBar activeTab={activeFlowTab} onTabChange={setActiveFlowTab} />
              <AlertBellInner onClick={() => setShowAlerts(!showAlerts)} isOpen={showAlerts} />
            </div>

            {showAlerts && (
              <div className="mt-3 mb-3">
                <FlowAlerts />
              </div>
            )}

            <div className="mt-3 max-h-[calc(100vh-180px)] overflow-y-auto pr-1">
              <FlowTabContent activeTab={activeFlowTab} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
