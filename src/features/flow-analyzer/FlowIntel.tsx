import { Fragment, useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { Segmented } from "../../components/Glass";
import { BarRow, HeatTile, KpiTile, Tile, TileGrid } from "../../components/Cockpit";
import { useTrackedTickers } from "../../api/flow";
import { STALE_TIMES } from "../../lib/constants";
import { formatPremium } from "../../lib/utils";
import type { OHLCV } from "../../lib/types";
import { useAppStore } from "../../store/useAppStore";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp, AlertTriangle, Activity,
  ArrowUpRight, ArrowDownRight, Layers, Search, X, Plus,
  Zap, Target, Calendar, Crosshair, RefreshCw,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

interface ByDateEntry {
  entries: any[];
  bull_premium: number;
  bear_premium: number;
  entry_count: number;
  strikes: number[];
}

interface HistoryResponse {
  ticker: string;
  by_date: Record<string, ByDateEntry>;
  summary: {
    total_bull_premium: number;
    total_bear_premium: number;
    bull_bear_ratio: number;
    dominant_side: string;
    days_active: number;
    strikes_escalating: boolean;
  };
  accumulation_score: number;
  accumulation_label: string;
  exit_signals: { contract: string; signal: string; detail: string }[];
}

type IntelView = "accumulation" | "strikes" | "sectors" | "unusual" | "contracts" | "flowprice" | "expiry";

/* ── Hooks ─────────────────────────────────────────────────── */

function useFlowHistory(ticker: string) {
  return useQuery<HistoryResponse>({
    queryKey: ["iflow", "history-full", ticker],
    queryFn: () => apiClient.get(`/flow/iflow/history?ticker=${ticker}&days=30`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

function useMultiTickerHistories(tickers: string[]) {
  return useQuery<Record<string, HistoryResponse>>({
    queryKey: ["iflow", "multi-history", tickers.join(",")],
    queryFn: async () => {
      const results: Record<string, HistoryResponse> = {};
      let failures = 0;
      const fetches = tickers.slice(0, 15).map(async (t) => {
        try {
          const { data } = await apiClient.get(`/flow/iflow/history?ticker=${t}&days=14`);
          results[t] = data;
        } catch {
          failures += 1;
        }
      });
      await Promise.all(fetches);
      if (fetches.length > 0 && failures === fetches.length) {
        throw new Error("Unable to load flow histories");
      }
      return results;
    },
    staleTime: STALE_TIMES.flow * 5,
    enabled: tickers.length > 0,
  });
}

function useRecentEntries(_days: number = 7) {
  return useQuery<{ dates: { date: string; entries: number }[] }>({
    queryKey: ["iflow", "dates"],
    queryFn: () => apiClient.get("/flow/iflow/dates").then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

function useAllEntriesForDates(dates: string[]) {
  return useQuery<any[]>({
    queryKey: ["iflow", "all-entries", dates.join(",")],
    queryFn: async () => {
      const all: any[] = [];
      let failures = 0;
      const fetches = dates.slice(0, 10).map(async (d) => {
        try {
          const { data } = await apiClient.get(`/flow/iflow/entries?date=${d}`);
          for (const e of data.entries || []) {
            all.push({ ...e, _date: d });
          }
        } catch {
          failures += 1;
        }
      });
      await Promise.all(fetches);
      if (fetches.length > 0 && failures === fetches.length) {
        throw new Error("Unable to load flow entries");
      }
      return all;
    },
    staleTime: STALE_TIMES.flow * 2,
    enabled: dates.length > 0,
  });
}

function usePriceHistory(ticker: string) {
  return useQuery<OHLCV[]>({
    queryKey: ["market-history-short", ticker],
    queryFn: () => apiClient.get(`/market/history?ticker=${ticker}&days=30`).then((r) => r.data),
    staleTime: STALE_TIMES.flow * 5,
    enabled: !!ticker,
  });
}

function QueryErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs text-accent-red">
      <AlertTriangle size={13} />
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
      >
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

/* ── Utility ───────────────────────────────────────────────── */

function parsePremium(s: string): number {
  const c = (s || "").replace("$", "").replace(/,/g, "").trim();
  if (c.toUpperCase().endsWith("M")) return parseFloat(c) * 1e6;
  if (c.toUpperCase().endsWith("K")) return parseFloat(c) * 1e3;
  return parseFloat(c) || 0;
}

/* Recharts palette — SVG chart colors only (exempt from the CSS-var rule).
 * All non-chart chrome below uses CSS vars. */
const GREEN = "#3fb950";
const RED = "#f85149";
const CYAN = "#58a6ff";


type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

const tickerTitle = (t: string) => <span className="ticker text-base">{t}</span>;
const skeleton = <div className="h-48 animate-pulse rounded-lg bg-bg-card-hover" />;
const empty = (msg: string) => <div className="py-6 text-center text-xs text-text-muted">{msg}</div>;
const signColor = (n: number, band = 0) =>
  n > band ? "var(--accent-green)" : n < -band ? "var(--accent-red)" : "var(--text-muted)";
const pctStr = (n: number, dp = 0) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;

/* ── Accumulation Chart ────────────────────────────────────── */

function AccumulationChart({ ticker, span }: { ticker: string; span: Span }) {
  const { data, isLoading, isError, refetch } = useFlowHistory(ticker);

  const chartData = useMemo(() => {
    if (!data?.by_date) return [];
    return Object.entries(data.by_date)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date: date.slice(5),
        bull: d.bull_premium / 1e6,
        bear: -(d.bear_premium / 1e6),
        entries: d.entry_count,
        net: (d.bull_premium - d.bear_premium) / 1e6,
      }));
  }, [data]);

  const label = data?.accumulation_label || "UNKNOWN";
  const score = data?.accumulation_score || 0;
  const labelColor = label.includes("BULL") ? "var(--accent-green)" : label.includes("BEAR") ? "var(--accent-red)" : "var(--text-muted)";
  const ready = !isLoading && !isError && data && chartData.length > 0;

  return (
    <Tile
      span={span}
      title={tickerTitle(ticker)}
      meta={ready ? <>score <span className="num text-text-primary">{score.toFixed(2)}</span></> : undefined}
      actions={ready ? (
        <>
          <span className="tag" style={{ "--tag": labelColor } as React.CSSProperties}>{label.replace(/_/g, " ").toLowerCase()}</span>
          {data.summary?.strikes_escalating && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-green)" }}>
              <ArrowUpRight size={12} /> Strikes escalating
            </span>
          )}
        </>
      ) : undefined}
    >
      {isLoading ? skeleton : isError ? (
        <QueryErrorState message={`Failed to load history for ${ticker}`} onRetry={() => void refetch()} />
      ) : !ready ? empty(`No history for ${ticker}`) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
              <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} />
              <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} tickFormatter={(v) => `${Math.abs(v).toFixed(1)}M`} />
              <Tooltip
                contentStyle={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                formatter={(v, name) => [
                  `$${Math.abs(Number(v)).toFixed(2)}M`,
                  name === "bull" ? "Bullish" : "Bearish",
                ]}
              />
              <ReferenceLine y={0} stroke="#30363d" />
              <Bar dataKey="bull" fill={GREEN} radius={[3, 3, 0, 0]} />
              <Bar dataKey="bear" fill={RED} radius={[0, 0, 3, 3]} />
            </BarChart>
          </ResponsiveContainer>

          {data.exit_signals && data.exit_signals.length > 0 && (
            <div className="callout space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={12} /> Exit signals
              </div>
              {data.exit_signals.map((sig, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num">{sig.contract}</span>
                  <span className="font-semibold">{sig.signal}</span>
                  <span className="text-text-secondary">{sig.detail}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Tile>
  );
}

/* ── Strike Escalation Chart ───────────────────────────────── */

function StrikeChart({ ticker, span }: { ticker: string; span: Span }) {
  const { data, isLoading, isError, refetch } = useFlowHistory(ticker);

  const chartData = useMemo(() => {
    if (!data?.by_date) return [];
    return Object.entries(data.by_date)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => {
        const strikes = d.strikes || [];
        return {
          date: date.slice(5),
          minStrike: strikes.length ? Math.min(...strikes) : 0,
          maxStrike: strikes.length ? Math.max(...strikes) : 0,
          avgStrike: strikes.length ? strikes.reduce((a, b) => a + b, 0) / strikes.length : 0,
          count: d.entry_count,
        };
      })
      .filter((d) => d.avgStrike > 0);
  }, [data]);

  const ready = !isLoading && !isError && chartData.length >= 2;
  const drift = ready
    ? ((chartData[chartData.length - 1].avgStrike - chartData[0].avgStrike) / chartData[0].avgStrike) * 100
    : 0;

  return (
    <Tile
      span={span}
      title={tickerTitle(ticker)}
      meta={ready ? <>strike drift <span className="num font-semibold" style={{ color: signColor(drift) }}>{pctStr(drift, 1)}</span></> : undefined}
      actions={ready && data?.summary?.strikes_escalating ? (
        <span className="flex items-center gap-1 text-xs font-medium" style={{ color: "var(--accent-green)" }}>
          <TrendingUp size={11} /> Escalating
        </span>
      ) : undefined}
    >
      {isLoading ? skeleton : isError ? (
        <QueryErrorState message={`Failed to load history for ${ticker}`} onRetry={() => void refetch()} />
      ) : !ready ? empty("Not enough data for strike chart") : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
            <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} />
            <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
            <Tooltip
              contentStyle={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v, name) => [`$${Number(v).toFixed(1)}`, name === "avgStrike" ? "Avg Strike" : name === "maxStrike" ? "High Strike" : "Low Strike"]}
            />
            <Line type="monotone" dataKey="maxStrike" stroke={GREEN} strokeWidth={1} dot={false} strokeDasharray="4 2" />
            <Line type="monotone" dataKey="avgStrike" stroke={CYAN} strokeWidth={2} dot={{ r: 3, fill: CYAN }} />
            <Line type="monotone" dataKey="minStrike" stroke={RED} strokeWidth={1} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Tile>
  );
}

/* ── Sector Clustering ─────────────────────────────────────── */

const SECTOR_MAP: Record<string, string[]> = {
  "AI/Semis": ["NVDA", "AMD", "AVGO", "QCOM", "MRVL", "AMAT", "LRCX", "KLAC", "ASML", "TSM", "ON", "SMCI", "MU"],
  "Crypto": ["COIN", "MSTR", "RIOT", "MARA", "HUT", "CLSK", "IREN", "CIFR", "IBIT"],
  "Cloud/SaaS": ["MSFT", "GOOGL", "AMZN", "META", "ORCL", "CRM", "NOW", "SNOW"],
  "Energy": ["OXY", "COP", "DVN", "SLB", "CVX", "XLE", "USO", "SHEL", "BP"],
  "Financials": ["JPM", "BAC", "GS", "MS", "SCHW", "BX", "AXP", "XLF", "V"],
  "Biotech": ["HIMS", "SMMT", "BMY", "MRK", "LMND"],
  "Space/Defense": ["RKLB", "ASTS", "LMT", "NOC", "RTX", "OKLO", "PL"],
  "Metals": ["GLD", "SLV", "GDX", "RIO"],
  "Retail/Consumer": ["BABA", "SHOP", "W", "BROS", "CAVA", "BUD"],
};

interface SectorRow {
  sector: string; tickers: string[]; total_entries: number;
  total_bull: number; total_bear: number; bull_pct: number; net: number;
}

/** Same tracked-tickers query the sector view always used; derivation only. */
function useSectorData() {
  const query = useTrackedTickers(7, 1);
  const { data: allTickers } = query;
  const sectorData = useMemo(() => {
    if (!allTickers) return [];
    const tickerMap = new Map(allTickers.map((t) => [t.ticker, t]));

    return Object.entries(SECTOR_MAP)
      .map(([sector, tickers]) => {
        const found = tickers.filter((t) => tickerMap.has(t));
        if (found.length === 0) return null;
        const total_bull = found.reduce((s, t) => s + (tickerMap.get(t)?.bullish || 0), 0);
        const total_bear = found.reduce((s, t) => s + (tickerMap.get(t)?.bearish || 0), 0);
        const total_entries = found.reduce((s, t) => s + (tickerMap.get(t)?.total_entries || 0), 0);
        const bull_pct = total_entries > 0 ? (total_bull / total_entries) * 100 : 50;
        return { sector, tickers: found, total_entries, total_bull, total_bear, bull_pct, net: total_bull - total_bear };
      })
      .filter(Boolean)
      .sort((a, b) => b!.total_entries - a!.total_entries) as SectorRow[];
  }, [allTickers]);
  return { ...query, sectorData };
}

/** Lead-row overview: one heat tile per sector, fill = how one-sided it is. */
function SectorHeat() {
  const { sectorData, isLoading, isError, refetch } = useSectorData();
  if (isLoading) return skeleton;
  if (isError) return <QueryErrorState message="Failed to load sector flow" onRetry={() => void refetch()} />;
  if (sectorData.length === 0) return empty("No sector data");
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {sectorData.map((s) => (
        <div key={s.sector} className="grid min-w-0" title={`${s.sector}: ${s.tickers.join(", ")}`}>
          <HeatTile
            label={s.sector}
            value={`${s.bull_pct.toFixed(0)}%`}
            sub={`${s.total_entries} flows · ${s.tickers.length} names`}
            tone={s.bull_pct >= 50 ? "up" : "down"}
            intensity={Math.abs(s.bull_pct - 50) / 50}
          />
        </div>
      ))}
    </div>
  );
}

function SectorClustering() {
  const { sectorData, isLoading, isError, refetch } = useSectorData();

  if (isLoading) return <Tile span={12}>{skeleton}</Tile>;
  if (isError) return <Tile span={12}><QueryErrorState message="Failed to load sector flow" onRetry={() => void refetch()} /></Tile>;
  if (sectorData.length === 0) return <Tile span={12}>{empty("No sector data")}</Tile>;

  return (
    <>
      <Tile span={7} title="Bull vs bear entries by sector" meta="7 days">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={sectorData} layout="vertical" margin={{ top: 5, right: 10, left: 70, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
            <XAxis type="number" tick={{ fill: "#8b949e", fontSize: 10 }} />
            <YAxis dataKey="sector" type="category" tick={{ fill: "#c9d1d9", fontSize: 11 }} width={65} />
            <Tooltip
              contentStyle={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v, name) => [Number(v), name === "total_bull" ? "Bullish" : "Bearish"]}
            />
            <Bar dataKey="total_bull" stackId="a" fill={GREEN} />
            <Bar dataKey="total_bear" stackId="a" fill={RED} />
          </BarChart>
        </ResponsiveContainer>
      </Tile>

      <Tile span={5} title="Sector detail" meta="2+ flows">
        <div className="divide-y divide-border">
          {sectorData.filter((s) => s.total_entries >= 2).map((s) => {
            const bullish = s.bull_pct > 55;
            const bearish = s.bull_pct < 45;
            const momentum = s.tickers.length >= 3;
            return (
              <div key={s.sector} className="space-y-1 py-2.5 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-text-primary">{s.sector}</span>
                  <span className="text-text-muted">
                    <span className="num">{s.total_entries}</span> flows ·{" "}
                    <span className="num font-semibold" style={{ color: bullish ? "var(--accent-green)" : bearish ? "var(--accent-red)" : "var(--text-muted)" }}>
                      {s.bull_pct.toFixed(0)}% bull
                    </span>
                  </span>
                </div>
                <div className="num text-text-muted">{s.tickers.join(" · ")}</div>
                {momentum && (bullish || bearish) && (
                  <div className="flex items-center gap-1 font-medium" style={{ color: bullish ? "var(--accent-green)" : "var(--accent-red)" }}>
                    {bullish ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    Sector momentum ({s.tickers.length} tickers)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Tile>
    </>
  );
}

/* ── Top Movers (multi-day accumulation ranking) ───────────── */

function TopMovers() {
  const tickersQuery = useTrackedTickers(7, 2);
  const { data: allTickers, isLoading: tickersLoading } = tickersQuery;
  const topTickers = useMemo(() => (allTickers ?? []).slice(0, 12).map((t) => t.ticker), [allTickers]);
  const historiesQuery = useMultiTickerHistories(topTickers);
  const { data: histories, isLoading: histLoading } = historiesQuery;

  const movers = useMemo(() => {
    if (!histories) return [];
    return Object.entries(histories)
      .map(([ticker, h]) => {
        const dates = Object.keys(h.by_date || {}).sort();
        if (dates.length < 2) return null;
        const label = h.accumulation_label || "";
        const score = h.accumulation_score || 0;
        const exitCount = (h.exit_signals || []).length;
        const escalating = h.summary?.strikes_escalating || false;
        const ratio = h.summary?.bull_bear_ratio || 1;
        const total = (h.summary?.total_bull_premium || 0) + (h.summary?.total_bear_premium || 0);

        // Compute trend: is premium increasing over days?
        const dailyPremiums = dates.map((d) => (h.by_date[d]?.bull_premium || 0) + (h.by_date[d]?.bear_premium || 0));
        const firstHalf = dailyPremiums.slice(0, Math.ceil(dailyPremiums.length / 2));
        const secondHalf = dailyPremiums.slice(Math.ceil(dailyPremiums.length / 2));
        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length || 1;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length || 0;
        const premiumTrend = ((avgSecond - avgFirst) / avgFirst) * 100;

        return { ticker, label, score, exitCount, escalating, ratio, total, premiumTrend, days: dates.length };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.score + (b!.escalating ? 0.5 : 0)) - (a!.score + (a!.escalating ? 0.5 : 0))) as {
        ticker: string; label: string; score: number; exitCount: number;
        escalating: boolean; ratio: number; total: number; premiumTrend: number; days: number;
      }[];
  }, [histories]);

  if (tickersLoading || histLoading) return <div className="h-64 animate-pulse rounded-lg bg-bg-card-hover" />;
  if (tickersQuery.isError || historiesQuery.isError) {
    return (
      <QueryErrorState
        message="Failed to load multi-day movers"
        onRetry={() => void Promise.all([tickersQuery.refetch(), historiesQuery.refetch()])}
      />
    );
  }
  if (movers.length === 0) return empty("No multi-day data");

  const maxTrend = Math.max(10, ...movers.map((m) => Math.abs(m.premiumTrend)));
  const escalating = movers.filter((m) => m.escalating);
  const exiting = movers.filter((m) => m.exitCount > 0);

  return (
    <>
      <div className="grid gap-2.5 px-1 text-xs text-text-muted" style={{ gridTemplateColumns: "4.25rem minmax(0,1fr) 4.5rem 2.75rem" }}>
        <span>Ticker</span>
        <span className="text-center">Premium trend, recent half vs early half</span>
        <span className="text-right">Trend</span>
        <span className="text-right">Total</span>
      </div>
      {movers.map((m) => {
        const side = m.label.includes("BULL") ? "var(--accent-green)" : m.label.includes("BEAR") ? "var(--accent-red)" : "var(--text-muted)";
        const flags = [
          m.label.replace(/_/g, " ").toLowerCase() || "no label",
          `score ${m.score.toFixed(2)}`,
          `${m.days}d active`,
          m.escalating ? "strikes escalating" : "",
          m.exitCount ? `${m.exitCount} exit signal${m.exitCount > 1 ? "s" : ""}` : "",
          `total premium ${formatPremium(m.total)}`,
        ].filter(Boolean).join(" · ");
        return (
          <BarRow
            key={m.ticker}
            label={
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: side }} aria-hidden="true" />
                {m.ticker}
              </span>
            }
            value={m.premiumTrend}
            max={maxTrend}
            diverging
            tone={Math.abs(m.premiumTrend) <= 10 ? "neutral" : undefined}
            display={pctStr(m.premiumTrend)}
            trailing={formatPremium(m.total)}
            title={`${m.ticker}: ${flags}`}
          />
        );
      })}
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-2.5 text-xs text-text-muted">
        <span>Dot = accumulation side. Ranked by accumulation score; hover a row for the full read.</span>
        {escalating.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1.5" style={{ color: "var(--accent-green)" }}>
            <ArrowUpRight size={11} /> Escalating
            {escalating.map((m) => <span key={m.ticker} className="ticker">{m.ticker}</span>)}
          </span>
        )}
        {exiting.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1.5" style={{ color: "var(--accent-orange)" }}>
            <AlertTriangle size={11} /> Exit signals
            {exiting.map((m) => <span key={m.ticker} className="ticker">{m.ticker} <span className="num">{m.exitCount}</span></span>)}
          </span>
        )}
      </div>
    </>
  );
}

/* ── Unusual Activity Scanner ──────────────────────────────── */

const TH = "px-2 py-2 text-xs font-medium text-text-muted";
const TD = "px-2 py-2";

function UnusualActivity() {
  const datesQuery = useRecentEntries();
  const { data: datesData } = datesQuery;
  const recentDates = useMemo(() => (datesData?.dates ?? []).slice(0, 5).map((d) => d.date), [datesData]);
  const entriesQuery = useAllEntriesForDates(recentDates);
  const { data: entries, isLoading } = entriesQuery;

  const unusual = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    // Score each entry for "unusualness"
    return entries
      .map((e: any) => {
        const prem = parsePremium(e.premium || "$0");
        const voi = e.vol_oi_ratio || 0;
        const ask = e.ask_pct || 0;
        let score = 0;

        // Premium outlier: > $1M is notable, > $5M is extreme
        if (prem >= 5e6) score += 4;
        else if (prem >= 2e6) score += 3;
        else if (prem >= 1e6) score += 2;
        else if (prem >= 500e3) score += 1;

        // Vol/OI outlier
        if (voi >= 100) score += 3;
        else if (voi >= 20) score += 2;
        else if (voi >= 5) score += 1;

        // Ask% conviction
        if (ask >= 95) score += 2;
        else if (ask >= 85) score += 1;

        // Combo bonus: high premium + high voi + high ask = very unusual
        if (prem >= 1e6 && voi >= 10 && ask >= 90) score += 2;

        return { ...e, _unusualScore: score, _premium: prem };
      })
      .filter((e: any) => e._unusualScore >= 3)
      .sort((a: any, b: any) => b._unusualScore - a._unusualScore)
      .slice(0, 30);
  }, [entries]);

  const body = datesQuery.isLoading || isLoading ? skeleton
    : datesQuery.isError || entriesQuery.isError ? (
      <QueryErrorState message="Failed to load unusual activity" onRetry={() => void Promise.all([datesQuery.refetch(), entriesQuery.refetch()])} />
    ) : unusual.length === 0 ? empty("No unusual activity detected in the last 5 days") : (
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className={`${TH} text-right`}>Score</th>
              <th className={TH}>Ticker</th>
              <th className={TH}>Side</th>
              <th className={`${TH} text-right`}>Contract</th>
              <th className={`${TH} text-right`}>Expiry</th>
              <th className={`${TH} text-right`}>Vol/OI</th>
              <th className={`${TH} text-right`}>Ask</th>
              <th className={`${TH} text-right`}>Premium</th>
              <th className={`${TH} text-right`}>Date</th>
            </tr>
          </thead>
          <tbody>
            {unusual.map((e: any, i: number) => {
              const side = (e._corrected_side || e.side || "").toLowerCase();
              const isBull = side.includes("bull");
              const optType = e.type || e.option_type || "";
              return (
                <tr key={i} className="data-row border-b border-border">
                  <td className={`${TD} num text-right text-sm ${e._unusualScore >= 6 ? "font-semibold text-accent" : "text-text-muted"}`}>{e._unusualScore}</td>
                  <td className={`${TD} ticker text-sm`}>{e.ticker}</td>
                  <td className={`${TD} font-medium`} style={{ color: isBull ? "var(--accent-green)" : "var(--accent-red)" }}>{isBull ? "Bull" : "Bear"}</td>
                  <td className={`${TD} num text-right text-text-primary`}>${e.strike} {optType}</td>
                  <td className={`${TD} num text-right text-text-muted`}>{e.expiry}</td>
                  <td className={`${TD} num text-right text-text-secondary`}>{e.vol_oi_ratio > 0 ? `${Number(e.vol_oi_ratio).toFixed(1)}x` : ""}</td>
                  <td className={`${TD} num text-right text-text-secondary`}>{e.ask_pct > 0 ? `${e.ask_pct}%` : ""}</td>
                  <td className={`${TD} num text-right text-sm font-semibold text-text-primary`}>{e.premium}</td>
                  <td className={`${TD} num text-right text-text-muted`}>{e._date?.slice(5)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <Tile span={12} title="Unusual activity" meta={`5 days, score 3+${unusual.length ? ` · ${unusual.length} prints` : ""}`}>
      {body}
    </Tile>
  );
}

/* ── Contract Tracker ─────────────────────────────────────── */

function ContractTracker() {
  const datesQuery = useRecentEntries();
  const { data: datesData } = datesQuery;
  const recentDates = useMemo(() => (datesData?.dates ?? []).slice(0, 10).map((d) => d.date), [datesData]);
  const entriesQuery = useAllEntriesForDates(recentDates);
  const { data: entries, isLoading } = entriesQuery;

  const contracts = useMemo(() => {
    if (!entries) return [];

    // Group by contract key: ticker+strike+expiry+type
    const groups: Record<string, { entries: any[]; dates: Set<string>; totalPremium: number }> = {};
    for (const e of entries) {
      if (!e.ticker || !e.strike) continue;
      const key = `${e.ticker}_${e.strike}_${e.expiry}_${(e.type || e.option_type || "").toUpperCase()}`;
      if (!groups[key]) groups[key] = { entries: [], dates: new Set(), totalPremium: 0 };
      groups[key].entries.push(e);
      groups[key].dates.add(e._date);
      groups[key].totalPremium += parsePremium(e.premium || "$0");
    }

    // Only keep contracts that appear on 2+ different days
    return Object.entries(groups)
      .filter(([, g]) => g.dates.size >= 2)
      .map(([key, g]) => {
        const first = g.entries[0];
        const side = (first._corrected_side || first.side || "").toLowerCase();
        const datesArr = [...g.dates].sort();
        return {
          key,
          ticker: first.ticker,
          strike: first.strike,
          expiry: first.expiry,
          optType: first.type || first.option_type || "",
          side,
          daysActive: g.dates.size,
          totalEntries: g.entries.length,
          totalPremium: g.totalPremium,
          dates: datesArr,
          entries: g.entries.sort((a: any, b: any) => (a._date || "").localeCompare(b._date || "")),
        };
      })
      .sort((a, b) => b.daysActive - a.daysActive || b.totalPremium - a.totalPremium)
      .slice(0, 25);
  }, [entries]);

  const [expanded, setExpanded] = useState<string | null>(null);

  const body = datesQuery.isLoading || isLoading ? skeleton
    : datesQuery.isError || entriesQuery.isError ? (
      <QueryErrorState message="Failed to load repeated contracts" onRetry={() => void Promise.all([datesQuery.refetch(), entriesQuery.refetch()])} />
    ) : contracts.length === 0 ? empty("No repeated contracts in the last 10 days") : (
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className={TH}>Ticker</th>
              <th className={TH}>Side</th>
              <th className={`${TH} text-right`}>Contract</th>
              <th className={`${TH} text-right`}>Expiry</th>
              <th className={`${TH} text-right`}>Days</th>
              <th className={`${TH} text-right`}>Hits</th>
              <th className={`${TH} text-right`}>Premium</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const isBull = c.side.includes("bull");
              const isExpanded = expanded === c.key;
              return (
                <Fragment key={c.key}>
                  <tr
                    className="data-row cursor-pointer border-b border-border"
                    onClick={() => setExpanded(isExpanded ? null : c.key)}
                    aria-expanded={isExpanded}
                  >
                    <td className={`${TD} ticker text-sm`}>{c.ticker}</td>
                    <td className={`${TD} font-medium`} style={{ color: isBull ? "var(--accent-green)" : "var(--accent-red)" }}>{isBull ? "Bull" : "Bear"}</td>
                    <td className={`${TD} num text-right text-text-primary`}>${c.strike} {c.optType}</td>
                    <td className={`${TD} num text-right text-text-muted`}>{c.expiry}</td>
                    <td className={`${TD} num text-right ${c.daysActive >= 3 ? "font-semibold text-accent" : "text-text-secondary"}`}>{c.daysActive}d</td>
                    <td className={`${TD} num text-right text-text-secondary`}>{c.totalEntries}x</td>
                    <td className={`${TD} num text-right text-sm font-semibold text-text-primary`}>{formatPremium(c.totalPremium)}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-border">
                      <td colSpan={7} className="px-2 pb-2.5 pt-1">
                        <div className="grid gap-0.5 pl-16">
                          {c.entries.map((e: any, i: number) => (
                            <div key={i} className="flex items-center gap-3 text-xs text-text-muted">
                              <span className="num w-12">{e._date?.slice(5)}</span>
                              <span className="num text-text-primary">{e.premium}</span>
                              {e.vol_oi_ratio > 0 && <span className="num text-text-secondary" title="Vol/OI">{Number(e.vol_oi_ratio).toFixed(1)}x</span>}
                              {e.ask_pct > 0 && <span className="num text-text-secondary">{e.ask_pct}% ask</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <Tile span={12} title="Repeated contracts" meta="10 days · click a row for the daily breakdown">
      {body}
    </Tile>
  );
}

/* ── Flow vs Price ────────────────────────────────────────── */

function FlowVsPrice({ ticker, span }: { ticker: string; span: Span }) {
  const historyQuery = useFlowHistory(ticker);
  const priceQuery = usePriceHistory(ticker);
  const { data: histData, isLoading: histLoading } = historyQuery;
  const { data: priceData, isLoading: priceLoading } = priceQuery;

  const chartData = useMemo(() => {
    if (!histData?.by_date || !priceData) return [];
    const priceMap = new Map(priceData.map((p) => [p.date, p.close]));

    const dates = new Set([
      ...Object.keys(histData.by_date),
      ...priceData.map((p) => p.date),
    ]);

    return [...dates].sort().map((date) => {
      const flow = histData.by_date[date];
      const price = priceMap.get(date);
      return {
        date: date.slice(5),
        price: price || null,
        bullPremium: flow ? flow.bull_premium / 1e6 : 0,
        bearPremium: flow ? flow.bear_premium / 1e6 : 0,
        netFlow: flow ? (flow.bull_premium - flow.bear_premium) / 1e6 : 0,
        hasFlow: !!flow,
      };
    });
  }, [histData, priceData]);

  return (
    <Tile span={span} title={tickerTitle(ticker)} meta="price and daily flow, 30 days">
      {histLoading || priceLoading ? skeleton : historyQuery.isError || priceQuery.isError ? (
        <QueryErrorState message={`Failed to load price/flow data for ${ticker}`} onRetry={() => void Promise.all([historyQuery.refetch(), priceQuery.refetch()])} />
      ) : chartData.length === 0 ? empty(`No data for ${ticker}`) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
            <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} />
            <YAxis yAxisId="price" tick={{ fill: "#8b949e", fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="flow" orientation="right" tick={{ fill: "#8b949e", fontSize: 10 }} tickFormatter={(v) => `${Number(v).toFixed(1)}M`} />
            <Tooltip
              contentStyle={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v, name) => {
                if (name === "price") return [`$${Number(v).toFixed(2)}`, "Price"];
                return [`$${Math.abs(Number(v)).toFixed(2)}M`, name === "bullPremium" ? "Bull Flow" : name === "bearPremium" ? "Bear Flow" : "Net Flow"];
              }}
            />
            <Area yAxisId="price" type="monotone" dataKey="price" stroke={CYAN} fill={`${CYAN}15`} strokeWidth={2} dot={false} connectNulls />
            <Bar yAxisId="flow" dataKey="bullPremium" fill={`${GREEN}60`} />
            <Bar yAxisId="flow" dataKey="bearPremium" fill={`${RED}60`} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Tile>
  );
}

/* ── Expiry Heatmap ───────────────────────────────────────── */

function ExpiryHeatmap() {
  const datesQuery = useRecentEntries();
  const { data: datesData } = datesQuery;
  const recentDates = useMemo(() => (datesData?.dates ?? []).slice(0, 7).map((d) => d.date), [datesData]);
  const entriesQuery = useAllEntriesForDates(recentDates);
  const { data: entries, isLoading } = entriesQuery;

  const expiryData = useMemo(() => {
    if (!entries) return [];

    // Group by expiry date
    const groups: Record<string, { bullPremium: number; bearPremium: number; count: number; tickers: Set<string> }> = {};
    for (const e of entries) {
      const exp = e.expiry;
      if (!exp) continue;
      if (!groups[exp]) groups[exp] = { bullPremium: 0, bearPremium: 0, count: 0, tickers: new Set() };
      const prem = parsePremium(e.premium || "$0");
      const side = (e._corrected_side || e.side || "").toLowerCase();
      if (side.includes("bull")) groups[exp].bullPremium += prem;
      else groups[exp].bearPremium += prem;
      groups[exp].count += 1;
      groups[exp].tickers.add(e.ticker);
    }

    return Object.entries(groups)
      .map(([expiry, g]) => ({
        expiry,
        bullPremium: g.bullPremium,
        bearPremium: g.bearPremium,
        totalPremium: g.bullPremium + g.bearPremium,
        count: g.count,
        tickers: [...g.tickers].sort(),
        bullPct: g.bullPremium + g.bearPremium > 0
          ? (g.bullPremium / (g.bullPremium + g.bearPremium)) * 100 : 50,
      }))
      .sort((a, b) => b.totalPremium - a.totalPremium)
      .slice(0, 20);
  }, [entries]);

  if (datesQuery.isLoading || isLoading) return <Tile span={12}>{skeleton}</Tile>;
  if (datesQuery.isError || entriesQuery.isError) {
    return <Tile span={12}><QueryErrorState message="Failed to load expiry data" onRetry={() => void Promise.all([datesQuery.refetch(), entriesQuery.refetch()])} /></Tile>;
  }
  if (expiryData.length === 0) return <Tile span={12}>{empty("No expiry data")}</Tile>;

  return (
    <>
      <Tile span={7} title="Premium by expiry" meta="7 days · tall bars = gamma walls">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={expiryData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
            <XAxis dataKey="expiry" tick={{ fill: "#8b949e", fontSize: 9 }} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} tickFormatter={(v) => formatPremium(v)} />
            <Tooltip
              contentStyle={{ background: "var(--bg-card-hover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(v, name) => [formatPremium(Number(v)), name === "bullPremium" ? "Bullish" : "Bearish"]}
            />
            <Bar dataKey="bullPremium" stackId="a" fill={GREEN} radius={[3, 3, 0, 0]} />
            <Bar dataKey="bearPremium" stackId="a" fill={RED} />
          </BarChart>
        </ResponsiveContainer>
      </Tile>

      <Tile span={5} title="Top expiries" meta="fill = bull or bear lean">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {expiryData.slice(0, 9).map((d) => (
            <div key={d.expiry} className="grid min-w-0" title={`${d.expiry}: ${d.tickers.join(", ")}`}>
              <HeatTile
                label={<span className="num">{d.expiry}</span>}
                value={formatPremium(d.totalPremium)}
                sub={`${d.count}x · ${d.tickers.slice(0, 3).join(" ")}${d.tickers.length > 3 ? ` +${d.tickers.length - 3}` : ""}`}
                tone={d.bullPct >= 50 ? "up" : "down"}
                intensity={Math.abs(d.bullPct - 50) / 50}
              />
            </div>
          ))}
        </div>
      </Tile>
    </>
  );
}

/* ── Ticker Selector (search + pinned + auto-detected) ─────── */

const LS_PINNED_KEY = "flow_intel_pinned";

function loadPinned(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_PINNED_KEY) || "[]"); } catch { return []; }
}
function savePinned(tickers: string[]) {
  try { localStorage.setItem(LS_PINNED_KEY, JSON.stringify(tickers)); } catch { /* */ }
}

function TickerSelector({ tickers, selected, onSelect, pinned, onPin, onUnpin }: {
  tickers: string[]; selected: string; onSelect: (t: string) => void;
  pinned: string[]; onPin: (t: string) => void; onUnpin: (t: string) => void;
}) {
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const t = input.trim().toUpperCase();
    if (t && !pinned.includes(t) && !tickers.includes(t)) {
      onPin(t);
      onSelect(t);
    } else if (t) {
      onSelect(t);
    }
    setInput("");
  };

  const all = useMemo(() => {
    const set = new Set([...pinned, ...tickers]);
    return [...set];
  }, [pinned, tickers]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs text-text-muted">Tickers</span>
      {all.map((t) => {
        const isPinned = pinned.includes(t);
        const isAuto = tickers.includes(t);
        const on = selected === t;
        return (
          <div
            key={t}
            className={`flex items-center rounded-md border transition-colors ${
              on ? "border-transparent bg-accent text-[var(--accent-ink)]" : "border-border bg-bg-card text-text-secondary hover:text-text-primary"
            }`}
          >
            <button onClick={() => onSelect(on ? "" : t)}
              title={isPinned && !isAuto ? "Pinned" : undefined}
              aria-pressed={on}
              className="num px-2 py-1 text-xs font-semibold">
              {t}
            </button>
            {isPinned && (
              <button onClick={() => { onUnpin(t); if (on) onSelect(""); }}
                aria-label={`Unpin ${t}`}
                className="pr-1.5 opacity-50 transition-opacity hover:opacity-100">
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 transition-colors focus-within:border-accent">
        <Search size={11} className="text-text-muted" />
        <input type="text" value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Add ticker..."
          aria-label="Add ticker"
          className="num w-20 border-none bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted" />
        {input && (
          <button onClick={handleAdd} className="text-accent" aria-label="Add"><Plus size={12} /></button>
        )}
      </div>
    </div>
  );
}

/* ── Main FlowIntel Component ──────────────────────────────── */

const LENS_NOTE: Record<IntelView, string> = {
  accumulation: "Daily bull vs bear premium per ticker, 30 days. Pick a ticker to focus one chart.",
  strikes: "Average strike per day with high and low band. Rising strikes = buyers reaching further out.",
  unusual: "Entries scored by premium outlier + vol/OI spike + ask% conviction. Higher score = more abnormal.",
  contracts: "Same contract (ticker+strike+expiry) appearing on multiple days = institutional conviction.",
  flowprice: "Price action overlaid with daily bull/bear flow. Did the stock move after institutional flow?",
  expiry: "Where is premium concentrated by expiry? Shows which dates institutions are targeting.",
  sectors: "Tracked tickers grouped into sectors, 7 days.",
};

export function FlowIntel() {
  const [view, setView] = useState<IntelView>("accumulation");
  const [selectedTicker, setSelectedTicker] = useState("");
  const activeTicker = useAppStore((s) => s.activeTicker);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const { data: allTickers } = useTrackedTickers(7, 2);
  const topTickers = useMemo(() => (allTickers ?? []).slice(0, 8).map((t) => t.ticker), [allTickers]);

  useEffect(() => {
    setSelectedTicker(activeTicker);
  }, [activeTicker]);

  const handleSelectTicker = (ticker: string) => {
    setSelectedTicker(ticker);
    setActiveTicker(ticker);
  };

  const handlePin = (t: string) => {
    const next = [...pinned, t];
    setPinned(next);
    savePinned(next);
  };
  const handleUnpin = (t: string) => {
    const next = pinned.filter((p) => p !== t);
    setPinned(next);
    savePinned(next);
  };

  // Combine pinned + auto for chart display
  const displayTickers = useMemo(() => {
    const set = new Set([...pinned, ...topTickers]);
    return [...set];
  }, [pinned, topTickers]);

  // KPI strip: pure sums over the 7d tracked-ticker list already loaded.
  const kpi = useMemo(() => {
    const list = allTickers ?? [];
    const entries = list.reduce((s, t) => s + (t.total_entries || 0), 0);
    const bull = list.reduce((s, t) => s + (t.bullish || 0), 0);
    const bear = list.reduce((s, t) => s + (t.bearish || 0), 0);
    const top = list.reduce<(typeof list)[number] | null>((m, t) => (!m || t.total_entries > m.total_entries ? t : m), null);
    return { names: list.length, entries, bull, bear, bullPct: bull + bear > 0 ? (bull / (bull + bear)) * 100 : null, top };
  }, [allTickers]);

  const ChartComponent = view === "strikes" ? StrikeChart : AccumulationChart;
  const usesTickers = view === "accumulation" || view === "strikes" || view === "flowprice";

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <TileGrid>
        <KpiTile label="Active names, 7d" value={kpi.names} sub="2+ flow entries" />
        <KpiTile label="Flow entries, 7d" value={kpi.entries.toLocaleString()} sub={`${kpi.bull} bull · ${kpi.bear} bear`} />
        <KpiTile
          label="Bull share"
          value={kpi.bullPct == null ? "—" : `${kpi.bullPct.toFixed(0)}%`}
          delta={kpi.bullPct == null ? undefined : kpi.bullPct >= 50 ? "bull lean" : "bear lean"}
          tone={kpi.bullPct == null ? "neutral" : kpi.bullPct >= 50 ? "up" : "down"}
          sub="of directional entries"
        />
        <KpiTile
          label="Most active"
          value={kpi.top ? <span className="ticker">{kpi.top.ticker}</span> : "—"}
          sub={kpi.top ? `${kpi.top.total_entries} entries · ${kpi.top.net_premium}` : undefined}
        />
      </TileGrid>

      {/* Lead row: who is being accumulated + where sectors lean */}
      <TileGrid>
        <Tile span={7} title="Multi-day movers" meta="7 days, 2+ entries">
          <TopMovers />
        </Tile>
        <Tile span={5} title="Sector lean" meta="bull share of entries, 7 days">
          <SectorHeat />
        </Tile>
      </TileGrid>

      {/* Deep dive */}
      <section className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold text-text-primary">Deep dive</h2>
          <Segmented<IntelView>
            className="flex-wrap"
            value={view}
            onChange={setView}
            options={([
              ["accumulation", "Accumulation", Activity],
              ["strikes", "Strike drift", TrendingUp],
              ["unusual", "Unusual", Zap],
              ["contracts", "Contracts", Target],
              ["flowprice", "Flow vs price", Crosshair],
              ["expiry", "Expiry map", Calendar],
              ["sectors", "Sectors", Layers],
            ] as const).map(([id, label, Icon]) => ({
              value: id as IntelView,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Icon size={12} />
                  {label}
                </span>
              ),
            }))}
          />
        </div>
        <p className="m-0 max-w-[80ch] text-xs text-text-muted">{LENS_NOTE[view]}</p>

        {usesTickers && (
          <TickerSelector
            tickers={topTickers} selected={selectedTicker} onSelect={handleSelectTicker}
            pinned={pinned} onPin={handlePin} onUnpin={handleUnpin}
          />
        )}

        <TileGrid>
          {(view === "accumulation" || view === "strikes") && (
            selectedTicker
              ? <ChartComponent key={selectedTicker} ticker={selectedTicker} span={12} />
              : displayTickers.slice(0, 6).map((t) => <ChartComponent key={t} ticker={t} span={6} />)
          )}

          {view === "flowprice" && (
            selectedTicker
              ? <FlowVsPrice ticker={selectedTicker} span={12} />
              : displayTickers.slice(0, 4).map((t) => <FlowVsPrice key={t} ticker={t} span={6} />)
          )}

          {view === "unusual" && <UnusualActivity />}
          {view === "contracts" && <ContractTracker />}
          {view === "expiry" && <ExpiryHeatmap />}
          {view === "sectors" && <SectorClustering />}
        </TileGrid>
      </section>
    </div>
  );
}
