import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  useIntelligence,
  useIntelSignals,
  useIntelHistory,
  useIntelEvents,
  useRefreshIntel,
} from "../api/intel";
import { Brain, RefreshCw, Plus, Loader2 } from "lucide-react";
import {
  LatestView,
  TradingSignals,
  HistoryView,
  EventGraph,
  IntelMap,
} from "../features/intelligence";

type TabId = "latest" | "history" | "events" | "map";

export function IntelligencePage() {
  const ticker = useAppStore((s) => s.activeTicker);
  const setTicker = useAppStore((s) => s.setActiveTicker);
  const [activeTab, setActiveTab] = useState<TabId>("latest");
  const [historyFilter, setHistoryFilter] = useState("");
  const [newTicker, setNewTicker] = useState("");

  const { data: sections = [], isLoading: sectionsLoading } = useIntelligence(ticker);
  const { data: signals = [], isLoading: signalsLoading } = useIntelSignals(ticker);
  const { data: history = [], isLoading: historyLoading } = useIntelHistory(
    ticker,
    30,
    historyFilter || undefined
  );
  const { data: events = [], isLoading: eventsLoading } = useIntelEvents(ticker);
  const refreshIntel = useRefreshIntel();

  // Derive related tickers from sections content (simple extraction)
  const relatedTickers = Array.from(
    new Set(
      sections
        .flatMap((s) => {
          const matches = s.content.match(/\b[A-Z]{2,5}\b/g) ?? [];
          return matches.filter(
            (m) =>
              m !== ticker &&
              m.length >= 2 &&
              !["THE", "AND", "FOR", "BUT", "NOT", "ARE", "HAS", "WAS", "ITS", "CEO", "CFO", "IPO", "GDP", "CPI", "FED", "SEC", "ETF"].includes(m)
          );
        })
    )
  ).slice(0, 8);

  const tabs: { id: TabId; label: string }[] = [
    { id: "latest", label: "Latest" },
    { id: "history", label: "History" },
    { id: "events", label: "Event Graph" },
    { id: "map", label: "Intelligence Map" },
  ];

  const handleAddTicker = () => {
    const t = newTicker.trim().toUpperCase();
    if (t) {
      setTicker(t);
      setNewTicker("");
      refreshIntel.mutate(t);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain size={24} className="text-accent-cyan" />
          <h1 className="text-xl font-semibold text-text-primary">
            Intelligence — {ticker}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* New ticker input */}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleAddTicker()}
              placeholder="Add ticker..."
              className="w-28 text-xs px-3 py-2 rounded-lg font-mono"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <button
              onClick={handleAddTicker}
              className="p-2 rounded-lg hover:bg-bg-card-hover transition-colors"
              style={{ border: "1px solid var(--border)" }}
            >
              <Plus size={14} className="text-text-secondary" />
            </button>
          </div>
          {/* Refresh */}
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: "var(--accent-cyan)",
              color: "#000",
            }}
            disabled={refreshIntel.isPending}
            onClick={() => refreshIntel.mutate(ticker)}
          >
            {refreshIntel.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh Intel
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 p-1 rounded-lg"
        style={{ background: "rgba(13, 17, 23, 0.5)", border: "1px solid var(--border)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2 rounded-md text-sm font-semibold transition-colors"
            style={{
              background: activeTab === tab.id ? "var(--bg-card-hover)" : "transparent",
              color:
                activeTab === tab.id
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "latest" && (
        <div className="space-y-6">
          <TradingSignals signals={signals} isLoading={signalsLoading} />
          <LatestView sections={sections} isLoading={sectionsLoading} />
        </div>
      )}

      {activeTab === "history" && (
        <HistoryView
          entries={history}
          isLoading={historyLoading}
          filterType={historyFilter}
          onFilterChange={setHistoryFilter}
        />
      )}

      {activeTab === "events" && (
        <EventGraph events={events} isLoading={eventsLoading} />
      )}

      {activeTab === "map" && (
        <IntelMap
          ticker={ticker}
          relatedTickers={relatedTickers}
          isLoading={sectionsLoading}
        />
      )}
    </div>
  );
}
