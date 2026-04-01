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
  Download,
} from "lucide-react";
import type { TrackedTicker, FlowEntry } from "../../lib/types";

/* ── iFlow date hooks ────────────────────────────────────── */

function useIFlowDates() {
  return useQuery<{ dates: { date: string; entries: number; images: number; channels: string[] }[] }>({
    queryKey: ["iflow", "dates"],
    queryFn: () => apiClient.get("/flow/iflow/dates").then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

function useIFlowSummary(date: string) {
  return useQuery<{
    date: string; total_entries: number; bull_count: number; bear_count: number;
    net_sentiment: string; tickers: { ticker: string; count: number; bull: number; bear: number; total_premium: number }[];
  }>({
    queryKey: ["iflow", "summary", date],
    queryFn: () => apiClient.get(`/flow/iflow/summary?date=${date}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

function useIFlowDateEntries(date: string) {
  return useQuery<{ entries: any[]; total: number; raw_total: number }>({
    queryKey: ["iflow", "entries-all", date],
    queryFn: () => apiClient.get(`/flow/iflow/entries?date=${date}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

/* ── Top Picks for a Date ─────────────────────────────────── */

function DayTopPicks({ date }: { date: string }) {
  const { data } = useIFlowDateEntries(date);
  if (!data || !data.entries.length) return null;

  // Score entries and pick top conviction ones
  const scored = data.entries
    .filter((e: any) => e.vol_oi_ratio > 0 || e.ask_pct > 0)
    .map((e: any) => {
      let score = 0;
      const premium = parsePremium(e.premium || "$0");
      const volOi = e.vol_oi_ratio || 0;
      const askPct = e.ask_pct || 0;
      const dte = e.dte || 0;
      const side = e.side || "";
      const optType = (e.type || e.option_type || "").toUpperCase();

      // Premium
      if (premium >= 5_000_000) score += 2.5;
      else if (premium >= 1_000_000) score += 2.0;
      else if (premium >= 500_000) score += 1.5;
      else if (premium >= 200_000) score += 1.0;
      // Ask%
      if (askPct >= 90) score += 2.0;
      else if (askPct >= 75) score += 1.5;
      else if (askPct >= 50) score += 1.0;
      // Vol/OI
      if (volOi >= 100) score += 3.0;
      else if (volOi >= 10) score += 2.0;
      else if (volOi >= 5) score += 1.5;
      else if (volOi >= 2) score += 1.0;
      // Side match
      if ((side === "Bear" && optType.includes("PUT")) || (side === "Bull" && optType.includes("CALL"))) score += 1.5;
      // DTE
      if (dte < 3) score -= 3.0;
      else if (dte < 7) score -= 1.5;
      else if (dte >= 90) score += 0.5;

      return { ...e, _score: score };
    })
    .filter((e: any) => e._score >= 7.0)
    .sort((a: any, b: any) => b._score - a._score)
    .slice(0, 15);

  if (scored.length === 0) return null;

  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-accent-green uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <TrendingUp size={12} />
        Top Conviction Flow — {formatDate(date)} ({scored.length})
      </h4>
      <div className="space-y-1">
        {scored.map((e: any, i: number) => {
          const fa = flowAction(e.side, e.type || e.option_type, e.ask_pct);
          const sideColor = fa.correctedSide === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          const isMega = (parsePremium(e.premium || "$0") >= 1_000_000) && (e.vol_oi_ratio >= 10) && (e.ask_pct >= 95);
          return (
            <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                 style={{
                   background: isMega ? "rgba(63,185,80,0.08)" : "rgba(48,54,61,0.12)",
                   border: isMega ? "1px solid rgba(63,185,80,0.25)" : "1px solid transparent",
                 }}>
              <span className="font-mono text-xs font-bold text-accent-cyan w-6">{e._score.toFixed(1)}</span>
              <span className="font-mono font-bold text-text-primary w-14">{e.ticker}</span>
              <span className="font-mono text-text-primary">${e.strike} {e.type || e.option_type}</span>
              <span style={{ color: sideColor }} className="font-semibold">{fa.correctedSide}</span>
              <span className="text-text-muted text-xs italic">{fa.action}</span>
              <span className="text-text-muted">{e.expiry}</span>
              {e.vol_oi_ratio > 0 && <span className="text-accent-cyan font-mono">{e.vol_oi_ratio.toFixed(1)}x</span>}
              {e.ask_pct > 0 && <span className="text-accent-orange font-mono">{e.ask_pct}%ask</span>}
              <span className="text-text-secondary ml-auto font-mono">{e.premium}</span>
              {isMega && <span className="text-xs font-bold text-accent-green">🔥MEGA</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function flowAction(side: string, optType: string, askPct?: number | null): { action: string; correctedSide: string } {
  const t = (optType || "").toUpperCase();
  const ask = askPct ?? 50;

  // ask >= 50% = buyers (lifting the ask) = aggressive entry
  // ask < 50% = sellers (hitting the bid) = selling the contract
  const isBuying = ask >= 50;

  if (t.includes("CALL")) {
    if (isBuying) return { action: "call buying", correctedSide: "Bull" };
    return { action: "call selling", correctedSide: "Bear" };
  }
  if (t.includes("PUT")) {
    if (isBuying) return { action: "put buying", correctedSide: "Bear" };
    return { action: "put selling", correctedSide: "Bull" };
  }

  // Fallback to original side
  const s = (side || "").toLowerCase();
  return { action: "", correctedSide: s.includes("bull") ? "Bull" : "Bear" };
}

function parsePremium(s: string): number {
  const clean = s.replace("$", "").replace(/,/g, "").trim();
  if (clean.toUpperCase().endsWith("M")) return parseFloat(clean) * 1_000_000;
  if (clean.toUpperCase().endsWith("K")) return parseFloat(clean) * 1_000;
  return parseFloat(clean) || 0;
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
function useIFlowTickerEntries(ticker: string) {
  return useQuery<{ entries: any[]; total: number }>({
    queryKey: ["iflow", "entries", "ticker", ticker],
    queryFn: () => apiClient.get(`/flow/iflow/entries?ticker=${ticker}`).then((r) => r.data),
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
  const { data: iflowData, isLoading: iflowLoading } = useIFlowTickerEntries(ticker);
  const { data: allPicks } = useFlowPicks("open");
  const { data: closedPicks } = useFlowPicks("closed");
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);
  const [expandedPick, setExpandedPick] = useState<number | null>(null);

  // Fetch current stock price for P/L calculation
  const { data: priceData } = useQuery({
    queryKey: ["market-price", ticker],
    queryFn: () => apiClient.get(`/market/price?ticker=${ticker}`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!ticker,
  });
  const currentStockPrice = priceData?.price || 0;

  const entriesLoading = dbLoading || iflowLoading;

  // Merge: prefer iFlow entries (have vol_oi, ask%, analysis), fallback to DB entries
  const mergedEntries = useMemo(() => {
    const iflowEntries = iflowData?.entries ?? [];
    const fallback = dbEntries ?? [];
    // Use iFlow if available, else DB
    if (iflowEntries.length > 0) return iflowEntries;
    return fallback;
  }, [iflowData, dbEntries]);

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

      {/* Picks for this ticker */}
      {(() => {
        const allTickerPicks = [...(tickerPicks || []), ...(closedPicks ?? []).filter((p) => p.ticker === ticker)];
        if (allTickerPicks.length === 0) return null;
        return (
          <div>
            <h4 className="text-xs font-semibold text-accent-blue uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <BarChart3 size={12} />
              Picks ({allTickerPicks.length})
            </h4>
            <div className="space-y-1">
              {allTickerPicks.map((pick) => {
                const pnlColor = (pick.option_pnl_pct ?? pick.pnl_pct ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)";
                const pnl = pick.option_pnl_pct ?? pick.pnl_pct ?? 0;
                const isOpen = pick.status === "open";
                const isPickExpanded = expandedPick === pick.id;
                return (
                  <div key={pick.id}
                    className="rounded-lg px-3 py-2 cursor-pointer transition-all"
                    style={{
                      background: isOpen ? "rgba(88,166,255,0.06)" : "rgba(48,54,61,0.12)",
                      border: `1px solid ${isOpen ? "rgba(88,166,255,0.2)" : "var(--border)"}`,
                    }}
                    onClick={() => setExpandedPick(isPickExpanded ? null : pick.id)}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold" style={{ color: pick.direction === "bullish" ? "var(--accent-green)" : "var(--accent-red)" }}>
                        {pick.direction === "bullish" ? "🐂" : "🐻"} {pick.conviction?.toUpperCase()}
                      </span>
                      <span className="font-mono text-text-primary">
                        ${pick.strike} {pick.option_type}
                      </span>
                      <span className="text-text-muted">{pick.expiry}</span>
                      <span className="ml-auto font-mono font-semibold" style={{ color: pnlColor }}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${isOpen ? "bg-accent-blue/15 text-accent-blue" : "bg-text-muted/15 text-text-muted"}`}>
                        {isOpen ? "OPEN" : "CLOSED"}
                      </span>
                    </div>
                    {isPickExpanded && pick.rationale && (
                      <div className="mt-2 text-xs text-text-secondary leading-relaxed"
                           style={{ background: "rgba(13,17,23,0.5)", borderRadius: 6, padding: "6px 8px" }}>
                        {pick.rationale}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

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
                    const optType = entry.option_type || entry.type || "";
                    const volOi = entry.vol_oi_ratio;
                    const askPct = entry.ask_pct;
                    const fa = flowAction(entry.side, optType, askPct);
                    const sideColor = fa.correctedSide === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
                    const entryKey = `${date}-${idx}`;
                    const isExpanded = expandedEntry === idx && dateKeys[0] === date;

                    // Estimate P/L from underlying price movement
                    const underlyingAtFill = entry.underlying_price || 0;
                    const strike = entry.strike || 0;
                    const isPut = optType.toUpperCase().includes("P");
                    let estimatedPnl: number | null = null;
                    if (currentStockPrice > 0 && underlyingAtFill > 0 && strike > 0) {
                      const stockMovePct = (currentStockPrice - underlyingAtFill) / underlyingAtFill;
                      // Delta approximation: ATM ~0.5, ITM ~0.7, OTM ~0.3
                      const moneyness = isPut
                        ? (strike - currentStockPrice) / strike
                        : (currentStockPrice - strike) / strike;
                      const delta = moneyness > 0.05 ? 0.65 : moneyness > -0.05 ? 0.5 : 0.3;
                      const leverage = currentStockPrice / (entry.avg_price || 1);
                      const optPnl = isPut ? -stockMovePct * delta * leverage * 100 : stockMovePct * delta * leverage * 100;
                      estimatedPnl = Math.round(optPnl);
                    }

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
                            {fa.correctedSide}
                          </span>
                          <span className="text-text-muted italic w-16 shrink-0">
                            {fa.action}
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
                          {estimatedPnl !== null && (
                            <span
                              className="font-mono font-bold shrink-0"
                              style={{ color: estimatedPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
                            >
                              {estimatedPnl >= 0 ? "+" : ""}{estimatedPnl}%
                            </span>
                          )}
                          <span className="text-text-secondary ml-auto font-mono">
                            {entry.premium}
                          </span>
                        </div>
                        {/* Expanded analysis */}
                        {isExpanded && entry.analysis && (
                          <div className="ml-12 mr-2 mb-2 px-2 py-1.5 rounded text-xs text-text-secondary leading-relaxed"
                               style={{ background: "rgba(13,17,23,0.5)" }}>
                            {entry.analysis}
                            {(entry.underlying_price || entry.avg_price) && (
                              <div className="mt-1 font-mono text-text-muted">
                                {entry.underlying_price ? `Underlying @ fill: $${entry.underlying_price}` : ""}
                                {currentStockPrice > 0 ? ` | Now: $${currentStockPrice.toFixed(2)}` : ""}
                                {entry.underlying_price && currentStockPrice > 0 ? ` (${((currentStockPrice - entry.underlying_price) / entry.underlying_price * 100).toFixed(1)}%)` : ""}
                                {entry.avg_price ? ` | Opt fill: $${entry.avg_price}` : ""}
                                {entry.dte ? ` | ${entry.dte} DTE` : ""}
                                {estimatedPnl !== null ? ` | Est P/L: ${estimatedPnl >= 0 ? "+" : ""}${estimatedPnl}%` : ""}
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

/* ── Main IFlowTracker ───────────────────────────────────── */

export function IFlowTracker() {
  const [biasFilter, setBiasFilter] = useState<BiasFilter>("all");
  const [minContracts, setMinContracts] = useState(2);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<string>(""); // "" = all dates (DB), "2026-03-24" = iFlow date

  const { data: iflowDates } = useIFlowDates();
  const { data: iflowSummary, isLoading: iflowLoading } = useIFlowSummary(dateFilter);
  const { data: tickers, isLoading: tickersLoading } = useTrackedTickers(30, minContracts);

  const isLoading = dateFilter ? iflowLoading : tickersLoading;

  // When a date is selected, convert iFlow summary tickers into TrackedTicker shape
  const activeTickers: TrackedTicker[] = useMemo(() => {
    if (dateFilter && iflowSummary) {
      return iflowSummary.tickers.map((t) => ({
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
  }, [dateFilter, iflowSummary, tickers]);

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
          {(iflowDates?.dates ?? []).slice(0, 7).map((d) => (
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
          {dateFilter && iflowSummary && (
            <> — <span style={{ color: iflowSummary.net_sentiment === "BULLISH" ? "var(--accent-green)" : iflowSummary.net_sentiment === "BEARISH" ? "var(--accent-red)" : "var(--accent-orange)" }}>
              {iflowSummary.net_sentiment}
            </span> ({iflowSummary.bull_count}B / {iflowSummary.bear_count}R)</>
          )}
        </span>
        {dateFilter && (
          <button
            onClick={() => {
              // Fetch entries and download as CSV
              apiClient.get(`/flow/iflow/entries?date=${dateFilter}`).then(({ data }) => {
                const entries = data.entries || [];
                if (!entries.length) return;
                const headers = ["ticker","strike","type","side","expiry","dte","premium","vol_oi_ratio","ask_pct","underlying_price","avg_price","analysis"];
                const rows = entries.map((e: any) => headers.map(h => {
                  const val = e[h] ?? "";
                  return typeof val === "string" && val.includes(",") ? `"${val}"` : val;
                }).join(","));
                const csv = [headers.join(","), ...rows].join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `iflow-${dateFilter}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              });
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-accent-blue hover:bg-accent-blue/15 transition-colors"
          >
            <Download size={12} />
            CSV
          </button>
        )}
      </div>

      {/* Bias + min contracts filter */}
      <BiasFilterBar
        value={biasFilter}
        onChange={setBiasFilter}
        minContracts={minContracts}
        onMinContractsChange={setMinContracts}
      />

      {/* Top conviction picks for selected date */}
      {dateFilter && <DayTopPicks date={dateFilter} />}

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
