import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTrackedTickers, useFlowEntries, useFlowPicks } from "../../api/flow";
import apiClient from "../../api/client";
import { BullBearBar } from "../../components/BullBearBar";
import { PickCard } from "../../components/PickCard";
import { formatDate, formatCurrency } from "../../lib/utils";
import { STALE_TIMES } from "../../lib/constants";
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
  Calendar,
} from "lucide-react";
import type { TrackedTicker, FlowEntry } from "../../lib/types";

/* ── OWLS date hooks ─────────────────────────────────────── */

function useOwlsDates() {
  return useQuery<{ dates: { date: string; entries: number; images: number; channels: string[] }[] }>({
    queryKey: ["owls", "dates"],
    queryFn: () => apiClient.get("/flow/owls/dates").then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

function useOwlsSummary(date: string) {
  return useQuery<{
    date: string; total_entries: number; bull_count: number; bear_count: number;
    net_sentiment: string; tickers: { ticker: string; count: number; bull: number; bear: number; total_premium: number }[];
  }>({
    queryKey: ["owls", "summary", date],
    queryFn: () => apiClient.get(`/flow/owls/summary?date=${date}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useOwlsTickerEntries(ticker: string) {
  return useQuery<{ entries: any[]; total: number }>({
    queryKey: ["owls", "entries", "ticker", ticker],
    queryFn: () => apiClient.get(`/flow/owls/entries?ticker=${ticker}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

function TickerDetail({
  ticker,
  trackedData,
}: {
  ticker: string;
  trackedData: TrackedTicker;
}) {
  const { data: dbEntries, isLoading: dbLoading } = useFlowEntries(ticker);
  const { data: owlsData, isLoading: owlsLoading } = useOwlsTickerEntries(ticker);
  const { data: allPicks } = useFlowPicks("open");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  const entriesLoading = dbLoading || owlsLoading;

  // Merge: prefer OWLS entries (have vol_oi, ask%, analysis), fallback to DB entries
  const mergedEntries = useMemo(() => {
    const owlsEntries = owlsData?.entries ?? [];
    const fallback = dbEntries ?? [];
    // Use OWLS if available, else DB
    if (owlsEntries.length > 0) return owlsEntries;
    return fallback;
  }, [owlsData, dbEntries]);

  // Group entries by date
  const groupedEntries = useMemo(() => {
    const groups: Record<string, any[]> = {};
    mergedEntries.forEach((entry: any) => {
      const date = entry._date || entry.flow_date || (entry.created_at ?? "").split(" ")[0] || "unknown";
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return groups;
  }, [mergedEntries]);

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
                  {groupedEntries[date].map((entry: any, idx: number) => {
                    const sideColor =
                      (entry.side || "").toLowerCase().includes("bull")
                        ? "var(--accent-green)"
                        : "var(--accent-red)";
                    const optType = entry.option_type || entry.type || "";
                    const volOi = entry.vol_oi_ratio;
                    const askPct = entry.ask_pct;
                    const entryKey = `${date}-${idx}`;
                    const isExpanded = expandedEntry === idx && dateKeys[0] === date;

                    return (
                      <div key={entryKey}>
                        <div
                          className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-bg-card-hover transition-colors cursor-pointer"
                          onClick={() => setExpandedEntry(isExpanded ? null : idx)}
                        >
                          <span
                            className="font-mono font-semibold w-10 shrink-0"
                            style={{ color: sideColor }}
                          >
                            {entry.side}
                          </span>
                          <span className="font-mono font-bold text-text-primary">
                            ${entry.strike} {optType}
                          </span>
                          <span className="text-text-muted">{entry.expiry}</span>
                          {volOi != null && volOi > 0 && (
                            <span className="text-accent-cyan font-mono">
                              {volOi.toFixed(1)}x
                            </span>
                          )}
                          {askPct != null && askPct > 0 && (
                            <span className="text-accent-orange font-mono">
                              {askPct}%ask
                            </span>
                          )}
                          <span className="text-text-secondary ml-auto font-mono">
                            {entry.premium}
                          </span>
                        </div>
                        {/* Expanded analysis */}
                        {isExpanded && entry.analysis && (
                          <div className="ml-12 mr-2 mb-2 px-2 py-1.5 rounded text-[10px] text-text-secondary leading-relaxed"
                               style={{ background: "rgba(13,17,23,0.5)" }}>
                            {entry.analysis}
                            {entry.underlying_price && (
                              <div className="mt-1 font-mono text-text-muted">
                                Underlying: ${entry.underlying_price}
                                {entry.avg_price ? ` · Avg fill: $${entry.avg_price}` : ""}
                                {entry.dte ? ` · ${entry.dte} DTE` : ""}
                              </div>
                            )}
                          </div>
                        )}
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
  const [dateFilter, setDateFilter] = useState<string>(""); // "" = all dates (DB), "2026-03-24" = OWLS date

  const { data: owlsDates } = useOwlsDates();
  const { data: owlsSummary, isLoading: owlsLoading } = useOwlsSummary(dateFilter);
  const { data: tickers, isLoading: tickersLoading } = useTrackedTickers(30, minContracts);

  const isLoading = dateFilter ? owlsLoading : tickersLoading;

  // When a date is selected, convert OWLS summary tickers into TrackedTicker shape
  const activeTickers: TrackedTicker[] = useMemo(() => {
    if (dateFilter && owlsSummary) {
      return owlsSummary.tickers.map((t) => ({
        ticker: t.ticker,
        total_entries: t.count,
        bullish: t.bull,
        bearish: t.bear,
        net_premium: t.total_premium > 1_000_000
          ? `$${(t.total_premium / 1_000_000).toFixed(1)}M`
          : t.total_premium > 1_000
          ? `$${(t.total_premium / 1_000).toFixed(0)}K`
          : `$${t.total_premium.toFixed(0)}`,
      }));
    }
    return tickers ?? [];
  }, [dateFilter, owlsSummary, tickers]);

  // Apply filters
  const filteredTickers = useMemo(() => {
    let filtered = [...activeTickers];

    // Min entries filter (only for all-dates view)
    if (!dateFilter) {
      filtered = filtered.filter((t) => t.total_entries >= minContracts);
    }

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
  }, [activeTickers, biasFilter, searchQuery, minContracts, dateFilter]);

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
      {/* Date filter + Search bar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => { setDateFilter(""); setSelectedTicker(null); }}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: !dateFilter ? "rgba(88,166,255,0.15)" : "transparent",
              color: !dateFilter ? "var(--accent-blue)" : "var(--text-muted)",
            }}
          >
            All Dates
          </button>
          {(owlsDates?.dates ?? []).slice(0, 7).map((d) => (
            <button
              key={d.date}
              onClick={() => { setDateFilter(d.date); setSelectedTicker(null); }}
              className="px-2.5 py-1.5 text-xs font-mono transition-colors border-l border-border"
              style={{
                background: dateFilter === d.date ? "rgba(88,166,255,0.15)" : "transparent",
                color: dateFilter === d.date ? "var(--accent-blue)" : "var(--text-muted)",
              }}
            >
              {d.date.slice(5)}
              <span className="ml-1 opacity-60">{d.entries}</span>
            </button>
          ))}
        </div>

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
          {filteredTickers.length} tickers
          {dateFilter && owlsSummary && (
            <> — <span style={{ color: owlsSummary.net_sentiment === "BULLISH" ? "var(--accent-green)" : owlsSummary.net_sentiment === "BEARISH" ? "var(--accent-red)" : "var(--accent-orange)" }}>
              {owlsSummary.net_sentiment}
            </span> ({owlsSummary.bull_count}B / {owlsSummary.bear_count}R)</>
          )}
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
