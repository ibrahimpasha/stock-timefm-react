import { useState, useMemo } from "react";
import { useTrackedTickers, useFlowEntries, useFlowPicks } from "../../api/flow";
import { BullBearBar } from "../../components/BullBearBar";
import { PickCard } from "../../components/PickCard";
import { formatDate, formatCurrency } from "../../lib/utils";
import {
  Eye,
  Search,
  Filter,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  Loader2,
} from "lucide-react";
import type { TrackedTicker, FlowEntry } from "../../lib/types";

/* ── Bias Filter ─────────────────────────────────────────── */

type BiasFilter = "all" | "bullish" | "bearish";

function BiasFilterBar({
  value,
  onChange,
  minContracts,
  onMinContractsChange,
}: {
  value: BiasFilter;
  onChange: (v: BiasFilter) => void;
  minContracts: number;
  onMinContractsChange: (v: number) => void;
}) {
  const options: { label: string; value: BiasFilter; color: string }[] = [
    { label: "All", value: "all", color: "var(--text-secondary)" },
    { label: "Bullish", value: "bullish", color: "var(--accent-green)" },
    { label: "Bearish", value: "bearish", color: "var(--accent-red)" },
  ];

  return (
    <div className="flex items-center gap-3 mb-4">
      <Filter size={13} className="text-text-muted" />
      <div className="flex items-center rounded-lg border border-border overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              background: value === opt.value ? `${opt.color}15` : "transparent",
              color: value === opt.value ? opt.color : "var(--text-muted)",
              borderRight: "1px solid var(--border)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 ml-auto">
        <span className="text-xs text-text-muted">Min entries:</span>
        <input
          type="number"
          min={1}
          max={50}
          value={minContracts}
          onChange={(e) => onMinContractsChange(Number(e.target.value) || 1)}
          className="w-12 bg-bg-primary border border-border rounded px-1.5 py-0.5 text-xs font-mono text-text-primary text-center focus:outline-none focus:border-accent-blue"
        />
      </div>
    </div>
  );
}

/* ── Mini Ticker Card in Grid ────────────────────────────── */

function TickerGridCard({
  ticker,
  isSelected,
  onClick,
}: {
  ticker: TrackedTicker;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total = ticker.bullish + ticker.bearish;
  const netBullish = ticker.bullish > ticker.bearish;

  return (
    <button
      onClick={onClick}
      className="card text-left transition-all py-2 px-3"
      style={{
        borderColor: isSelected ? "var(--accent-blue)" : undefined,
        background: isSelected ? "rgba(88,166,255,0.08)" : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono font-bold text-sm text-text-primary">
          {ticker.ticker}
        </span>
        <span className="text-xs font-mono text-text-muted">
          {ticker.total_entries}
        </span>
      </div>
      <BullBearBar
        bull={ticker.bullish}
        total={total}
        height={6}
        showLabels={false}
      />
      <div className="flex items-center justify-between mt-1 text-xs">
        <span
          className="flex items-center gap-0.5"
          style={{ color: netBullish ? "var(--accent-green)" : "var(--accent-red)" }}
        >
          {netBullish ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {netBullish ? "Bullish" : "Bearish"}
        </span>
        <span className="text-text-muted font-mono">{ticker.net_premium}</span>
      </div>
    </button>
  );
}

/* ── Ticker Detail Panel ─────────────────────────────────── */

function TickerDetail({
  ticker,
  trackedData,
}: {
  ticker: string;
  trackedData: TrackedTicker;
}) {
  const { data: entries, isLoading: entriesLoading } = useFlowEntries(ticker);
  const { data: allPicks } = useFlowPicks("open");

  // Group entries by date
  const groupedEntries = useMemo(() => {
    if (!entries) return {};
    const groups: Record<string, FlowEntry[]> = {};
    entries.forEach((entry) => {
      const date = entry.timestamp.split("T")[0] || entry.timestamp.split(" ")[0];
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return groups;
  }, [entries]);

  const dateKeys = Object.keys(groupedEntries).sort().reverse();

  // Picks for this ticker
  const tickerPicks = (allPicks ?? []).filter((p) => p.ticker === ticker);

  const total = trackedData.bullish + trackedData.bearish;

  return (
    <div className="space-y-4">
      {/* Summary hero */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-accent-cyan" />
            <span className="font-mono font-bold text-lg text-text-primary">
              {ticker}
            </span>
          </div>
          <span className="text-xs text-text-muted">
            {trackedData.total_entries} total entries
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-xs text-text-muted">Bullish</div>
            <div className="font-mono font-bold text-accent-green">
              {trackedData.bullish}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Bearish</div>
            <div className="font-mono font-bold text-accent-red">
              {trackedData.bearish}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted">Net Premium</div>
            <div className="font-mono font-bold text-text-primary">
              {trackedData.net_premium}
            </div>
          </div>
        </div>

        <BullBearBar bull={trackedData.bullish} total={total} height={12} />
      </div>

      {/* Claude picks for this ticker */}
      {tickerPicks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <BarChart3 size={12} />
            Active Picks for {ticker}
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {tickerPicks.map((pick) => (
              <PickCard key={pick.id} pick={pick} />
            ))}
          </div>
        </div>
      )}

      {/* Flow entries grouped by date */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock size={12} />
          Flow History
        </h4>

        {entriesLoading ? (
          <div className="flex items-center gap-2 py-4 text-text-muted text-xs">
            <Loader2 size={14} className="animate-spin" />
            Loading flow entries...
          </div>
        ) : dateKeys.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center">
            No flow entries found
          </p>
        ) : (
          <div className="space-y-3">
            {dateKeys.map((date) => (
              <div key={date}>
                <div className="text-xs font-semibold text-text-secondary mb-1.5">
                  {formatDate(date)}
                </div>
                <div className="space-y-1 pl-2 border-l-2 border-border">
                  {groupedEntries[date].map((entry) => {
                    const sideColor =
                      entry.side.toLowerCase().includes("bull")
                        ? "var(--accent-green)"
                        : "var(--accent-red)";
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-bg-card-hover transition-colors"
                      >
                        <span
                          className="font-mono font-semibold w-12 shrink-0"
                          style={{ color: sideColor }}
                        >
                          {entry.side}
                        </span>
                        <span className="font-mono text-text-primary">
                          ${entry.strike} {entry.option_type}
                        </span>
                        <span className="text-text-muted">{entry.expiry}</span>
                        <span className="text-text-secondary ml-auto">
                          {entry.premium}
                        </span>
                        <span className="text-text-muted">{entry.size}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main OwlsTracker ────────────────────────────────────── */

export function OwlsTracker() {
  const [biasFilter, setBiasFilter] = useState<BiasFilter>("all");
  const [minContracts, setMinContracts] = useState(2);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: tickers, isLoading } = useTrackedTickers(30, minContracts);

  // Apply filters
  const filteredTickers = useMemo(() => {
    if (!tickers) return [];
    let filtered = [...tickers];

    // Bias filter
    if (biasFilter === "bullish") {
      filtered = filtered.filter((t) => t.bullish > t.bearish);
    } else if (biasFilter === "bearish") {
      filtered = filtered.filter((t) => t.bearish > t.bullish);
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      filtered = filtered.filter((t) => t.ticker.includes(q));
    }

    // Sort by total entries descending
    filtered.sort((a, b) => b.total_entries - a.total_entries);

    return filtered;
  }, [tickers, biasFilter, searchQuery, minContracts]);

  const selectedData = filteredTickers.find((t) => t.ticker === selectedTicker);

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 w-full rounded bg-text-muted/20 mb-4" />
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="card h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Search bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-1.5 flex-1 max-w-xs focus-within:border-accent-blue transition-colors">
          <Search size={14} className="text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
            placeholder="Search ticker..."
            className="bg-transparent border-none outline-none text-text-primary font-mono text-xs w-full placeholder:text-text-muted"
          />
        </div>
        <span className="text-xs text-text-muted">
          {filteredTickers.length} tickers tracked
        </span>
      </div>

      {/* Bias + min contracts filter */}
      <BiasFilterBar
        value={biasFilter}
        onChange={setBiasFilter}
        minContracts={minContracts}
        onMinContractsChange={setMinContracts}
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Ticker grid */}
        <div className={selectedTicker ? "col-span-5" : "col-span-12"}>
          {filteredTickers.length === 0 ? (
            <div className="card text-center py-8">
              <Eye size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
              <p className="text-sm text-text-muted">
                No tickers match your filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {filteredTickers.map((ticker) => (
                <TickerGridCard
                  key={ticker.ticker}
                  ticker={ticker}
                  isSelected={selectedTicker === ticker.ticker}
                  onClick={() =>
                    setSelectedTicker(
                      selectedTicker === ticker.ticker ? null : ticker.ticker
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedTicker && selectedData && (
          <div className="col-span-7">
            <TickerDetail ticker={selectedTicker} trackedData={selectedData} />
          </div>
        )}
      </div>
    </div>
  );
}
