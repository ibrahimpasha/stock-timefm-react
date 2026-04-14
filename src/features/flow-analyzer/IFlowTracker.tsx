import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFlowPicks, useTrackedTickers } from "../../api/flow";
import apiClient from "../../api/client";
import { BullBearBar } from "../../components/BullBearBar";
import { PickCard } from "../../components/PickCard";
import { formatDate } from "../../lib/utils";
import { STALE_TIMES } from "../../lib/constants";
import {
  Eye, Search, Filter, TrendingUp, TrendingDown, Download,
} from "lucide-react";
import type { TrackedTicker } from "../../lib/types";

/* ═══════════════════════════════════════════════════════════
   TYPES & UTILS
   ═══════════════════════════════════════════════════════════ */
type BiasFilter = "all" | "bullish" | "bearish";
type DteFilter = "all" | "lotto" | "swing" | "leap";

function classifySide(optType: string, askPct?: number | null, volOi?: number | null, fallback?: string) {
  const t = (optType || "").toUpperCase();
  const ask = askPct ?? 50;
  const voi = volOi ?? 0;
  const buying = ask >= 55 ? true : ask < 40 ? false : voi >= 1.5;
  if (t.includes("CALL")) return buying ? { side: "Bull" as const, action: "call buying" } : { side: "Bear" as const, action: "call selling" };
  if (t.includes("PUT")) return buying ? { side: "Bear" as const, action: "put buying" } : { side: "Bull" as const, action: "put selling" };
  return { side: ((fallback || "").toLowerCase().includes("bull") ? "Bull" : "Bear") as "Bull" | "Bear", action: "" };
}

function parsePremium(s: string): number {
  const c = (s || "").replace("$", "").replace(/,/g, "").trim();
  if (c.toUpperCase().endsWith("M")) return parseFloat(c) * 1e6;
  if (c.toUpperCase().endsWith("K")) return parseFloat(c) * 1e3;
  return parseFloat(c) || 0;
}

function fmtPremium(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function matchesDte(dte: number | null | undefined, f: DteFilter) {
  if (f === "all") return true;
  const d = dte || 0;
  if (d <= 0) return false;
  if (f === "lotto") return d <= 14;
  if (f === "swing") return d > 14 && d <= 60;
  if (f === "leap") return d > 60;
  return true;
}

function dteTag(dte: number | null | undefined) {
  const d = dte || 0;
  if (d > 0 && d <= 14) return { text: "LOTTO", color: "var(--accent-orange)", bg: "rgba(227,127,46,0.12)" };
  if (d > 14 && d <= 60) return { text: "SWING", color: "var(--accent-blue)", bg: "rgba(88,166,255,0.12)" };
  if (d > 60) return { text: "LEAP", color: "var(--accent-cyan)", bg: "rgba(56,211,168,0.12)" };
  return null;
}

function scoreEntry(e: any) {
  let s = 0;
  const prem = parsePremium(e.premium || "$0"), voi = e.vol_oi_ratio || 0, ask = e.ask_pct || 0, dte = e.dte || 0;
  const { side } = classifySide(e.type || e.option_type, e.ask_pct, e.vol_oi_ratio, e.side);
  const t = (e.type || e.option_type || "").toUpperCase();
  if (prem >= 5e6) s += 2.5; else if (prem >= 1e6) s += 2; else if (prem >= 5e5) s += 1.5; else if (prem >= 2e5) s += 1;
  if (ask >= 90) s += 2; else if (ask >= 75) s += 1.5; else if (ask >= 50) s += 1;
  if (voi >= 100) s += 3; else if (voi >= 10) s += 2; else if (voi >= 5) s += 1.5; else if (voi >= 2) s += 1;
  if ((side === "Bear" && t.includes("PUT")) || (side === "Bull" && t.includes("CALL"))) s += 1.5;
  if (dte < 3) s -= 3; else if (dte < 7) s -= 1.5; else if (dte >= 90) s += 0.5;
  return s;
}

/* ═══════════════════════════════════════════════════════════
   API HOOKS
   ═══════════════════════════════════════════════════════════ */
function useIFlowDates() {
  return useQuery<{ dates: { date: string; entries: number }[] }>({
    queryKey: ["iflow", "dates"],
    queryFn: () => apiClient.get("/flow/iflow/dates").then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

function useIFlowSummary(date: string, dte: DteFilter) {
  const p = dte === "lotto" ? "&dte_min=1&dte_max=14" : dte === "swing" ? "&dte_min=15&dte_max=60" : dte === "leap" ? "&dte_min=61" : "";
  return useQuery<{ total_entries: number; bull_count: number; bear_count: number; net_sentiment: string; tickers: { ticker: string; count: number; bull: number; bear: number; total_premium: number }[] }>({
    queryKey: ["iflow", "summary", date, dte],
    queryFn: () => apiClient.get(`/flow/iflow/summary?date=${date}${p}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

function useIFlowEntries(date: string, ticker?: string) {
  const t = ticker ? `&ticker=${ticker}` : "";
  return useQuery<{ entries: any[] }>({
    queryKey: ["iflow", "entries", date, ticker || ""],
    queryFn: () => apiClient.get(`/flow/iflow/entries?date=${date}${t}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

function useIFlowHistory(ticker: string) {
  return useQuery<{ by_date: Record<string, { entries: any[]; entry_count: number }> }>({
    queryKey: ["iflow", "history", ticker],
    queryFn: () => apiClient.get(`/flow/iflow/history?ticker=${ticker}&days=30`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

function useStockPrice(ticker: string) {
  return useQuery<{ price: number }>({
    queryKey: ["market-price", ticker],
    queryFn: () => apiClient.get(`/market/price?ticker=${ticker}`).then((r) => r.data),
    staleTime: 30_000, refetchInterval: 60_000, enabled: !!ticker,
  });
}

/* ═══════════════════════════════════════════════════════════
   ENTRY ROW — reusable for TopPicks and TickerDetail
   ═══════════════════════════════════════════════════════════ */
/**
 * Estimate option P/L % using delta approximation + time decay.
 *
 * Given: underlying at fill, current underlying, option fill price, strike, DTE at fill, option type
 * Approximation:
 *   1. Estimate delta from moneyness: ATM ~0.50, ITM ~0.65-0.80, OTM ~0.20-0.40
 *   2. Option price change ≈ delta × (underlying change) - theta decay
 *   3. Theta ≈ fill_price / (dte_at_fill * theta_factor) per day elapsed
 *   4. P/L % = estimated_change / fill_price × 100
 */
function estimateOptionPnl(
  underlyingAtFill: number, currentPrice: number, optFill: number,
  strike: number, dteAtFill: number, optType: string, flowDate?: string,
): number | null {
  if (!underlyingAtFill || !currentPrice || !optFill || optFill <= 0 || !strike) return null;

  const isPut = optType.toUpperCase().includes("PUT");
  const stockMove = currentPrice - underlyingAtFill;

  // Moneyness: how far ITM/OTM as fraction of strike
  const moneyness = isPut
    ? (strike - currentPrice) / strike
    : (currentPrice - strike) / strike;

  // Delta estimate based on moneyness
  let delta: number;
  if (moneyness > 0.10) delta = 0.72;       // deep ITM
  else if (moneyness > 0.02) delta = 0.58;  // slightly ITM
  else if (moneyness > -0.02) delta = 0.50; // ATM
  else if (moneyness > -0.10) delta = 0.35; // slightly OTM
  else if (moneyness > -0.20) delta = 0.20; // OTM
  else delta = 0.10;                          // deep OTM

  // Gamma boost: if stock moved significantly, delta shifted
  const pctMove = Math.abs(stockMove / underlyingAtFill);
  if (pctMove > 0.05) delta = Math.min(0.90, delta + 0.10); // big move = delta expanded

  // Intrinsic value change from stock movement
  const optionDelta = isPut ? -delta : delta;
  const deltaGain = optionDelta * stockMove;

  // Theta decay: estimate days elapsed from flow_date
  let daysElapsed = 0;
  if (flowDate) {
    const fd = new Date(flowDate);
    const now = new Date();
    daysElapsed = Math.max(0, Math.round((now.getTime() - fd.getTime()) / 86400000));
  }
  // Theta accelerates as expiry approaches. Rough: daily decay = fill / (dte * 1.5)
  // But cap it — theta shouldn't eat more than 60% of the option value over the period
  const effectiveDte = Math.max(dteAtFill || 30, 5);
  const dailyTheta = optFill / (effectiveDte * 1.8);
  const thetaLoss = Math.min(dailyTheta * daysElapsed, optFill * 0.6);

  // Estimated current option price
  const estCurrentOpt = Math.max(0.01, optFill + deltaGain - thetaLoss);
  const pnlPct = ((estCurrentOpt - optFill) / optFill) * 100;

  return Math.round(Math.max(-100, Math.min(pnlPct, 999)));
}

function EntryRow({ entry, price, expandedKey, entryKey, onToggle }: {
  entry: any; price: number; expandedKey: string | null; entryKey: string; onToggle: (k: string) => void;
}) {
  const optType = entry.type || entry.option_type || "";
  const { side, action } = classifySide(optType, entry.ask_pct, entry.vol_oi_ratio, entry.side);
  const color = side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
  const expanded = expandedKey === entryKey;
  const dl = dteTag(entry.dte);

  // P/L: use delta-based estimate if we have option fill price, else fall back to underlying change
  const uf = entry.underlying_price || 0;
  const optFill = entry.avg_price || 0;
  const strike = entry.strike || 0;
  const dte = entry.dte || 30;
  const flowDate = entry._date || entry.flow_date || "";

  let pnl: number | null = null;
  if (price > 0 && uf > 0 && optFill > 0 && strike > 0) {
    // Full delta-based estimate
    pnl = estimateOptionPnl(uf, price, optFill, strike, dte, optType, flowDate);
  } else if (price > 0 && uf > 0) {
    // Fallback: simple underlying % change
    pnl = Math.round(((price - uf) / uf) * 100 * (optType.toUpperCase().includes("PUT") ? -1 : 1));
    pnl = Math.max(-100, Math.min(pnl, 999));
  }
  return (
    <div>
      <div className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => onToggle(entryKey)}>
        <span className="font-mono font-semibold w-10 shrink-0" style={{ color }}>{side}</span>
        <span className="text-text-muted italic w-16 shrink-0">{action}</span>
        <span className="font-mono font-bold text-text-primary">${entry.strike} {optType}</span>
        <span className="text-text-muted">{entry.expiry}</span>
        {dl && <span className="font-mono px-1 rounded" style={{ color: dl.color, background: dl.bg }}>{dl.text}</span>}
        {entry.vol_oi_ratio > 0 && <span className="text-accent-cyan font-mono">{Number(entry.vol_oi_ratio).toFixed(1)}x</span>}
        {entry.ask_pct > 0 && <span className="text-accent-orange font-mono">{entry.ask_pct}%ask</span>}
        {pnl !== null && <span className="font-mono font-bold shrink-0" style={{ color: pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{pnl >= 0 ? "+" : ""}{pnl}%</span>}
        <span className="text-text-secondary ml-auto font-mono">{entry.premium}</span>
      </div>
      {expanded && entry.analysis && (
        <div className="ml-12 mr-2 mb-2 px-2 py-1.5 rounded text-xs text-text-secondary leading-relaxed" style={{ background: "rgba(13,17,23,0.5)" }}>
          {entry.analysis}
          {(entry.underlying_price || entry.avg_price) && (
            <div className="mt-1 font-mono text-text-muted">
              {entry.underlying_price ? `Underlying @ fill: $${entry.underlying_price}` : ""}
              {price > 0 ? ` | Now: $${price.toFixed(2)}` : ""}
              {entry.underlying_price && price > 0 ? ` (${((price - entry.underlying_price) / entry.underlying_price * 100).toFixed(1)}%)` : ""}
              {entry.avg_price ? ` | Opt fill: $${entry.avg_price}` : ""}
              {entry.dte ? ` | ${entry.dte} DTE` : ""}
              {pnl !== null ? ` | Est P/L: ${pnl >= 0 ? "+" : ""}${pnl}%` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TOP PICKS — conviction entries for a single date
   ═══════════════════════════════════════════════════════════ */
function TopPicks({ date, dteFilter }: { date: string; dteFilter: DteFilter }) {
  const { data } = useIFlowEntries(date);
  if (!data?.entries?.length) return null;
  const scored = data.entries
    .filter((e: any) => e.ticker && (e.vol_oi_ratio > 0 || e.ask_pct > 0))
    .filter((e: any) => matchesDte(e.dte, dteFilter))
    .map((e: any) => ({ ...e, _score: scoreEntry(e) }))
    .filter((e: any) => e._score >= 7.0)
    .sort((a: any, b: any) => b._score - a._score)
    .slice(0, 15);
  if (!scored.length) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-accent-green uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <TrendingUp size={12} /> Top Conviction Flow — {formatDate(date)} ({scored.length})
      </h4>
      <div className="space-y-1">
        {scored.map((e: any, i: number) => {
          const { side, action } = classifySide(e.type || e.option_type, e.ask_pct, e.vol_oi_ratio, e.side);
          const color = side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          const mega = parsePremium(e.premium || "$0") >= 1e6 && (e.vol_oi_ratio || 0) >= 10 && (e.ask_pct || 0) >= 95;
          const dl = dteTag(e.dte);
          return (
            <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ background: mega ? "rgba(63,185,80,0.08)" : "rgba(48,54,61,0.12)", border: mega ? "1px solid rgba(63,185,80,0.25)" : "1px solid transparent" }}>
              <span className="font-mono text-xs font-bold text-accent-cyan w-6">{e._score.toFixed(1)}</span>
              <span className="font-mono font-bold text-text-primary w-14">{e.ticker}</span>
              <span className="font-mono text-text-primary">${e.strike} {e.type || e.option_type}</span>
              <span style={{ color }} className="font-semibold">{side}</span>
              <span className="text-text-muted italic">{action}</span>
              <span className="text-text-muted">{e.expiry}</span>
              {dl && <span className="font-mono px-1 rounded" style={{ color: dl.color, background: dl.bg }}>{dl.text}</span>}
              {e.vol_oi_ratio > 0 && <span className="text-accent-cyan font-mono">{Number(e.vol_oi_ratio).toFixed(1)}x</span>}
              {e.ask_pct > 0 && <span className="text-accent-orange font-mono">{e.ask_pct}%ask</span>}
              <span className="text-text-secondary ml-auto font-mono">{e.premium}</span>
              {mega && <span className="text-xs font-bold text-accent-green">MEGA</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TICKER CARD — grid card
   ═══════════════════════════════════════════════════════════ */
function TickerCard({ t, selected, onClick }: { t: TrackedTicker; selected: boolean; onClick: () => void }) {
  const net = t.bullish > t.bearish;
  return (
    <button onClick={onClick} className="card text-left transition-all py-2 px-3"
      style={{ borderColor: selected ? "var(--accent-blue)" : undefined, background: selected ? "rgba(88,166,255,0.08)" : undefined }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono font-bold text-sm text-text-primary">{t.ticker}</span>
        <span className="text-xs font-mono text-text-muted">{t.total_entries}</span>
      </div>
      <BullBearBar bull={t.bullish} total={t.bullish + t.bearish} height={6} showLabels={false} />
      <div className="flex items-center justify-between mt-1 text-xs">
        <span className="flex items-center gap-0.5" style={{ color: net ? "var(--accent-green)" : "var(--accent-red)" }}>
          {net ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {net ? "Bullish" : "Bearish"}
        </span>
        <span className="text-text-muted font-mono">{t.net_premium}</span>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   TICKER DETAIL — right panel
   Two modes:
     - Single date: fetch entries for date+ticker, filter by DTE
     - All dates: fetch history, group by date, filter by DTE
   ═══════════════════════════════════════════════════════════ */
function TickerDetail({ ticker, trackedData, dateFilter, dteFilter }: {
  ticker: string; trackedData: TrackedTicker; dateFilter: string; dteFilter: DteFilter;
}) {
  const isAllDates = !dateFilter;
  const { data: singleData, isLoading: singleLoading } = useIFlowEntries(isAllDates ? "" : dateFilter, ticker);
  const { data: historyData, isLoading: historyLoading } = useIFlowHistory(isAllDates ? ticker : "");
  const { data: priceData } = useStockPrice(ticker);
  const { data: allPicks } = useFlowPicks("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const price = priceData?.price || 0;
  const loading = isAllDates ? historyLoading : singleLoading;

  // Build grouped entries {date: entries[]} with DTE filter applied
  const grouped: Record<string, any[]> = useMemo(() => {
    const g: Record<string, any[]> = {};
    if (isAllDates && historyData?.by_date) {
      for (const [date, v] of Object.entries(historyData.by_date)) {
        const filtered = ((v as any).entries ?? []).filter((e: any) => e.ticker && matchesDte(e.dte, dteFilter));
        if (filtered.length) g[date] = filtered;
      }
    } else if (singleData?.entries) {
      const filtered = singleData.entries.filter((e: any) => matchesDte(e.dte, dteFilter));
      if (filtered.length) g[dateFilter] = filtered;
    }
    return g;
  }, [isAllDates, historyData, singleData, dateFilter, dteFilter]);

  const dateKeys = Object.keys(grouped).sort().reverse();
  const totalEntries = dateKeys.reduce((n, d) => n + grouped[d].length, 0);
  const tickerPicks = (allPicks ?? []).filter((p) => p.ticker === ticker);
  const total = trackedData.bullish + trackedData.bearish;
  const toggle = (k: string) => setExpanded(expanded === k ? null : k);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-accent-cyan" />
            <span className="font-mono font-bold text-lg text-text-primary">{ticker}</span>
          </div>
          <span className="text-xs text-text-muted">{trackedData.total_entries} total</span>
        </div>
        <BullBearBar bull={trackedData.bullish} total={total} />
        <div className="text-xs text-text-muted mt-2">Net Premium: {trackedData.net_premium}</div>
      </div>

      {tickerPicks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase mb-2">Picks ({tickerPicks.length})</h4>
          <div className="space-y-2">{tickerPicks.map((p) => <PickCard key={p.id} pick={p} />)}</div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase mb-2">
          {isAllDates ? `Flow History (${totalEntries})` : `Flow — ${formatDate(dateFilter)} (${totalEntries})`}
        </h4>
        {loading ? (
          <div className="text-xs text-text-muted animate-pulse">Loading...</div>
        ) : dateKeys.length === 0 ? (
          <div className="text-xs text-text-muted">No entries match filters</div>
        ) : (
          <div className="space-y-3">
            {dateKeys.map((date) => (
              <div key={date}>
                {dateKeys.length > 1 && <div className="text-xs font-semibold text-accent-blue mb-1">{formatDate(date)}</div>}
                <div className="space-y-0.5 pl-2 border-l-2 border-border">
                  {grouped[date].map((entry: any, idx: number) => (
                    <EntryRow key={`${date}-${idx}`} entry={entry} price={price}
                      expandedKey={expanded} entryKey={`${date}-${idx}`} onToggle={toggle} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN — IFlowTracker
   ═══════════════════════════════════════════════════════════ */
export function IFlowTracker() {
  const [bias, setBias] = useState<BiasFilter>("all");
  const [dte, setDte] = useState<DteFilter>("all");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<string>("");

  const { data: datesData } = useIFlowDates();
  const dates = datesData?.dates ?? [];
  const isAllDates = !dateFilter;

  // Data sources: iFlow summary (single date) OR DB tickers (all dates)
  const { data: summary, isLoading: summaryLoading } = useIFlowSummary(dateFilter, dte);
  const { data: allTickers, isLoading: allLoading } = useTrackedTickers(30, 1);

  const loading = isAllDates ? allLoading : summaryLoading;

  // Build ticker list
  const tickers: TrackedTicker[] = useMemo(() => {
    if (isAllDates) return (allTickers ?? []).map((t) => ({ ...t, net_premium: t.net_premium || "" }));
    if (!summary) return [];
    return summary.tickers.map((t) => ({
      ticker: t.ticker, total_entries: t.count, bullish: t.bull, bearish: t.bear,
      net_premium: fmtPremium(t.total_premium),
    }));
  }, [isAllDates, allTickers, summary]);

  // Filter: bias + search
  const filtered = useMemo(() => {
    let list = [...tickers];
    if (bias === "bullish") list = list.filter((t) => t.bullish > t.bearish);
    else if (bias === "bearish") list = list.filter((t) => t.bearish > t.bullish);
    if (search) list = list.filter((t) => t.ticker.toUpperCase().includes(search));
    list.sort((a, b) => b.total_entries - a.total_entries);
    return list;
  }, [tickers, bias, search]);

  const selectedData = tickers.find((t) => t.ticker === selectedTicker);
  const select = (d: string) => { setDateFilter(d); setSelectedTicker(null); };

  return (
    <div>
      {/* ── Date bar + Search ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button onClick={() => select("")}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{ background: isAllDates ? "rgba(88,166,255,0.15)" : "transparent", color: isAllDates ? "var(--accent-blue)" : "var(--text-muted)" }}>
            All Dates
          </button>
          {dates.slice(0, 8).map((d) => (
            <button key={d.date} onClick={() => select(d.date)}
              className="px-2.5 py-1.5 text-xs font-mono transition-colors border-l border-border"
              style={{ background: dateFilter === d.date ? "rgba(88,166,255,0.15)" : "transparent", color: dateFilter === d.date ? "var(--accent-blue)" : "var(--text-muted)" }}>
              {d.date.slice(5)}<span className="ml-1 opacity-60">{d.entries}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-1.5 flex-1 max-w-xs focus-within:border-accent-blue transition-colors">
          <Search size={14} className="text-text-muted" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="Search ticker..." className="bg-transparent border-none outline-none text-text-primary font-mono text-xs w-full placeholder:text-text-muted" />
        </div>
        <span className="text-xs text-text-muted">
          {filtered.length} tickers
          {!isAllDates && summary && (
            <> — <span style={{ color: summary.net_sentiment === "BULLISH" ? "var(--accent-green)" : summary.net_sentiment === "BEARISH" ? "var(--accent-red)" : "var(--accent-orange)" }}>
              {summary.net_sentiment}</span> ({summary.bull_count}B / {summary.bear_count}R)</>
          )}
        </span>
        {!isAllDates && (
          <button onClick={() => {
            apiClient.get(`/flow/iflow/entries?date=${dateFilter}`).then(({ data }) => {
              const entries = data.entries || []; if (!entries.length) return;
              const h = ["ticker","strike","type","side","expiry","dte","premium","vol_oi_ratio","ask_pct","underlying_price","avg_price","analysis"];
              const rows = entries.map((e: any) => h.map(k => { const v = e[k] ?? ""; return typeof v === "string" && v.includes(",") ? `"${v}"` : v; }).join(","));
              const blob = new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `iflow-${dateFilter}.csv`; a.click(); URL.revokeObjectURL(url);
            });
          }} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-accent-blue hover:bg-accent-blue/15 transition-colors">
            <Download size={12} /> CSV
          </button>
        )}
      </div>

      {/* ── Filters: Bias + DTE ── */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={13} className="text-text-muted" />
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {([["All","all","var(--text-secondary)"],["Bullish","bullish","var(--accent-green)"],["Bearish","bearish","var(--accent-red)"]] as const).map(([l,v,c]) => (
            <button key={v} onClick={() => setBias(v as BiasFilter)} className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{ background: bias === v ? `${c}15` : "transparent", color: bias === v ? c : "var(--text-muted)", borderRight: "1px solid var(--border)" }}>{l}</button>
          ))}
        </div>
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {([["All DTE","all","var(--text-secondary)"],["Lotto","lotto","var(--accent-orange)"],["Swing","swing","var(--accent-blue)"],["Leap","leap","var(--accent-cyan)"]] as const).map(([l,v,c]) => (
            <button key={v} onClick={() => { setDte(v as DteFilter); setSelectedTicker(null); }} className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{ background: dte === v ? `${c}15` : "transparent", color: dte === v ? c : "var(--text-muted)", borderRight: "1px solid var(--border)" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Top Picks (single date only) ── */}
      {!isAllDates && dateFilter && <TopPicks date={dateFilter} dteFilter={dte} />}

      {/* ── Loading ── */}
      {loading && (
        <div className="animate-pulse"><div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {[...Array(10)].map((_, i) => <div key={i} className="card h-20" />)}
        </div></div>
      )}

      {/* ── Grid + Detail ── */}
      {!loading && (
        <div className="grid grid-cols-12 gap-4">
          <div className={selectedTicker ? "col-span-5" : "col-span-12"}>
            {filtered.length === 0 ? (
              <div className="card text-center py-8">
                <Eye size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
                <p className="text-sm text-text-muted">No tickers match your filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {filtered.map((t) => (
                  <TickerCard key={t.ticker} t={t} selected={selectedTicker === t.ticker}
                    onClick={() => setSelectedTicker(selectedTicker === t.ticker ? null : t.ticker)} />
                ))}
              </div>
            )}
          </div>
          {selectedTicker && selectedData && (
            <div className="col-span-7">
              <TickerDetail ticker={selectedTicker} trackedData={selectedData} dateFilter={dateFilter} dteFilter={dte} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
