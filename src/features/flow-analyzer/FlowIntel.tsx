import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { useTrackedTickers } from "../../api/flow";
import { STALE_TIMES } from "../../lib/constants";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Activity,
  ArrowUpRight, ArrowDownRight, Layers, Search, X, Plus,
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

type IntelView = "accumulation" | "strikes" | "sectors";

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
      const fetches = tickers.slice(0, 15).map(async (t) => {
        try {
          const { data } = await apiClient.get(`/flow/iflow/history?ticker=${t}&days=14`);
          results[t] = data;
        } catch { /* skip */ }
      });
      await Promise.all(fetches);
      return results;
    },
    staleTime: STALE_TIMES.flow * 5,
    enabled: tickers.length > 0,
  });
}

/* ── Utility ───────────────────────────────────────────────── */

function fmtM(n: number) {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const GREEN = "#3fb950";
const RED = "#f85149";
const CYAN = "#58a6ff";
const ORANGE = "#e37f2e";
const PURPLE = "#bc8cff";

/* ── Accumulation Chart ────────────────────────────────────── */

function AccumulationChart({ ticker }: { ticker: string }) {
  const { data, isLoading } = useFlowHistory(ticker);

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

  if (isLoading) return <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />;
  if (!data || chartData.length === 0) return <div className="text-xs text-text-muted py-4 text-center">No history for {ticker}</div>;

  const label = data.accumulation_label || "UNKNOWN";
  const score = data.accumulation_score || 0;
  const labelColor = label.includes("BULL") ? GREEN : label.includes("BEAR") ? RED : ORANGE;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-text-primary">{ticker}</span>
          <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ color: labelColor, background: `${labelColor}15` }}>
            {label.replace(/_/g, " ")}
          </span>
          <span className="text-xs font-mono text-text-muted">score: {score.toFixed(2)}</span>
        </div>
        {data.summary?.strikes_escalating && (
          <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: GREEN }}>
            <ArrowUpRight size={12} /> Strikes Escalating
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
          <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} tickFormatter={(v) => `${Math.abs(v).toFixed(1)}M`} />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, name: string) => [
              `$${Math.abs(v).toFixed(2)}M`,
              name === "bull" ? "Bullish" : "Bearish",
            ]}
          />
          <ReferenceLine y={0} stroke="#30363d" />
          <Bar dataKey="bull" fill={GREEN} radius={[3, 3, 0, 0]} />
          <Bar dataKey="bear" fill={RED} radius={[0, 0, 3, 3]} />
        </BarChart>
      </ResponsiveContainer>

      {/* Exit signals */}
      {data.exit_signals && data.exit_signals.length > 0 && (
        <div className="space-y-1">
          {data.exit_signals.map((sig, i) => (
            <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded" style={{ background: "rgba(248,81,73,0.08)" }}>
              <AlertTriangle size={11} style={{ color: ORANGE }} />
              <span className="text-text-muted">{sig.contract}</span>
              <span className="font-semibold" style={{ color: RED }}>{sig.signal}</span>
              <span className="text-text-muted">{sig.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Strike Escalation Chart ───────────────────────────────── */

function StrikeChart({ ticker }: { ticker: string }) {
  const { data, isLoading } = useFlowHistory(ticker);

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

  if (isLoading) return <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />;
  if (chartData.length < 2) return <div className="text-xs text-text-muted py-4 text-center">Not enough data for strike chart</div>;

  const escalating = data?.summary?.strikes_escalating;
  const first = chartData[0].avgStrike;
  const last = chartData[chartData.length - 1].avgStrike;
  const drift = ((last - first) / first) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-text-primary">{ticker}</span>
          <span className="text-xs text-text-muted">Strike drift:</span>
          <span className="text-xs font-mono font-bold" style={{ color: drift > 0 ? GREEN : drift < 0 ? RED : "var(--text-muted)" }}>
            {drift >= 0 ? "+" : ""}{drift.toFixed(1)}%
          </span>
        </div>
        {escalating && (
          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-semibold" style={{ color: GREEN, background: `${GREEN}15` }}>
            <TrendingUp size={11} /> Escalating
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
          <XAxis dataKey="date" tick={{ fill: "#8b949e", fontSize: 10 }} />
          <YAxis tick={{ fill: "#8b949e", fontSize: 10 }} domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, name: string) => [`$${v.toFixed(1)}`, name === "avgStrike" ? "Avg Strike" : name === "maxStrike" ? "High Strike" : "Low Strike"]}
          />
          <Line type="monotone" dataKey="maxStrike" stroke={GREEN} strokeWidth={1} dot={false} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="avgStrike" stroke={CYAN} strokeWidth={2} dot={{ r: 3, fill: CYAN }} />
          <Line type="monotone" dataKey="minStrike" stroke={RED} strokeWidth={1} dot={false} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
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

function SectorClustering() {
  const { data: allTickers, isLoading } = useTrackedTickers(7, 1);

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
        return {
          sector,
          tickers: found,
          total_entries,
          total_bull,
          total_bear,
          bull_pct,
          net: total_bull - total_bear,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.total_entries - a!.total_entries) as {
        sector: string; tickers: string[]; total_entries: number;
        total_bull: number; total_bear: number; bull_pct: number; net: number;
      }[];
  }, [allTickers]);

  if (isLoading) return <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />;
  if (sectorData.length === 0) return <div className="text-xs text-text-muted py-4 text-center">No sector data</div>;

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sectorData} layout="vertical" margin={{ top: 5, right: 10, left: 70, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.4)" />
          <XAxis type="number" tick={{ fill: "#8b949e", fontSize: 10 }} />
          <YAxis dataKey="sector" type="category" tick={{ fill: "#c9d1d9", fontSize: 11 }} width={65} />
          <Tooltip
            contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number, name: string) => [v, name === "total_bull" ? "Bullish" : "Bearish"]}
          />
          <Bar dataKey="total_bull" stackId="a" fill={GREEN} />
          <Bar dataKey="total_bear" stackId="a" fill={RED} />
        </BarChart>
      </ResponsiveContainer>

      {/* Sector detail cards */}
      <div className="grid grid-cols-2 gap-2">
        {sectorData.filter((s) => s.total_entries >= 2).map((s) => {
          const bullish = s.bull_pct > 55;
          const bearish = s.bull_pct < 45;
          const momentum = s.tickers.length >= 3;
          return (
            <div key={s.sector} className="px-3 py-2 rounded-lg border border-border text-xs space-y-1"
              style={{ borderColor: momentum ? (bullish ? `${GREEN}40` : bearish ? `${RED}40` : undefined) : undefined }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text-primary">{s.sector}</span>
                <span className="font-mono text-text-muted">{s.total_entries} flows</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${s.bull_pct}%`, background: GREEN }} />
                </div>
                <span className="font-mono w-8 text-right" style={{ color: bullish ? GREEN : bearish ? RED : "var(--text-muted)" }}>
                  {s.bull_pct.toFixed(0)}%
                </span>
              </div>
              <div className="text-text-muted">{s.tickers.join(", ")}</div>
              {momentum && (bullish || bearish) && (
                <div className="flex items-center gap-1 font-semibold" style={{ color: bullish ? GREEN : RED }}>
                  {bullish ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                  Sector Momentum ({s.tickers.length} tickers)
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Top Movers (multi-day accumulation ranking) ───────────── */

function TopMovers() {
  const { data: allTickers, isLoading: tickersLoading } = useTrackedTickers(7, 2);
  const topTickers = useMemo(() => (allTickers ?? []).slice(0, 12).map((t) => t.ticker), [allTickers]);
  const { data: histories, isLoading: histLoading } = useMultiTickerHistories(topTickers);

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

  if (tickersLoading || histLoading) return <div className="h-32 bg-bg-card-hover rounded-lg animate-pulse" />;
  if (movers.length === 0) return <div className="text-xs text-text-muted py-4 text-center">No multi-day data</div>;

  return (
    <div className="space-y-1.5">
      {movers.map((m) => {
        const isBull = m.label.includes("BULL");
        const isBear = m.label.includes("BEAR");
        const hasExits = m.exitCount > 0;
        const color = isBull ? GREEN : isBear ? RED : "var(--text-muted)";
        return (
          <div key={m.ticker} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(48,54,61,0.12)" }}>
            <span className="font-mono font-bold text-text-primary w-12">{m.ticker}</span>
            <span className="font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}12` }}>
              {m.label.replace(/_/g, " ").replace("ACCUMULATION", "ACCUM")}
            </span>
            <span className="font-mono text-text-muted">{m.days}d</span>
            {m.escalating && <span style={{ color: GREEN }}><ArrowUpRight size={11} /></span>}
            {hasExits && <span className="flex items-center gap-0.5" style={{ color: ORANGE }}><AlertTriangle size={10} />{m.exitCount}</span>}
            <span className="ml-auto font-mono text-text-muted">{fmtM(m.total)}</span>
            <span className="font-mono font-bold w-14 text-right" style={{ color: m.premiumTrend > 10 ? GREEN : m.premiumTrend < -10 ? RED : "var(--text-muted)" }}>
              {m.premiumTrend >= 0 ? "+" : ""}{m.premiumTrend.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
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
    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
      {all.map((t) => {
        const isPinned = pinned.includes(t);
        const isAuto = tickers.includes(t);
        return (
          <div key={t} className="flex items-center rounded-lg border transition-colors"
            style={{
              background: selected === t ? "rgba(88,166,255,0.15)" : "transparent",
              borderColor: selected === t ? "rgba(88,166,255,0.3)" : isPinned && !isAuto ? `${PURPLE}40` : "var(--border)",
            }}>
            <button onClick={() => onSelect(selected === t ? "" : t)}
              className="px-2 py-1 text-xs font-mono transition-colors"
              style={{ color: selected === t ? CYAN : isPinned && !isAuto ? PURPLE : "var(--text-muted)" }}>
              {t}
            </button>
            {isPinned && (
              <button onClick={() => { onUnpin(t); if (selected === t) onSelect(""); }}
                className="pr-1.5 opacity-40 hover:opacity-100 transition-opacity">
                <X size={10} />
              </button>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-primary px-2 py-1 focus-within:border-accent-blue transition-colors">
        <Search size={11} className="text-text-muted" />
        <input type="text" value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Add ticker..."
          className="bg-transparent border-none outline-none text-text-primary font-mono text-xs w-20 placeholder:text-text-muted" />
        {input && (
          <button onClick={handleAdd} className="text-accent-blue"><Plus size={12} /></button>
        )}
      </div>
    </div>
  );
}

/* ── Main FlowIntel Component ──────────────────────────────── */

export function FlowIntel() {
  const [view, setView] = useState<IntelView>("accumulation");
  const [selectedTicker, setSelectedTicker] = useState("");
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const { data: allTickers } = useTrackedTickers(7, 2);
  const topTickers = useMemo(() => (allTickers ?? []).slice(0, 8).map((t) => t.ticker), [allTickers]);

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

  const ChartComponent = view === "strikes" ? StrikeChart : AccumulationChart;

  return (
    <div className="space-y-4">
      {/* View tabs */}
      <div className="flex items-center gap-2">
        {([
          ["accumulation", "Accumulation", Activity],
          ["strikes", "Strike Drift", TrendingUp],
          ["sectors", "Sectors", Layers],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id as IntelView)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
            style={{
              background: view === id ? "rgba(88,166,255,0.12)" : "transparent",
              color: view === id ? CYAN : "var(--text-muted)",
              border: `1px solid ${view === id ? "rgba(88,166,255,0.3)" : "var(--border)"}`,
            }}>
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Top Movers summary (always visible) */}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Activity size={12} className="text-accent-cyan" /> Multi-Day Movers (7d, 2+ entries)
        </h4>
        <TopMovers />
      </div>

      {/* Accumulation / Strikes views */}
      {(view === "accumulation" || view === "strikes") && (
        <div className="space-y-4">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            {view === "accumulation" ? "Ticker Accumulation Charts" : "Strike Escalation / De-escalation"}
          </h4>
          <TickerSelector
            tickers={topTickers} selected={selectedTicker} onSelect={setSelectedTicker}
            pinned={pinned} onPin={handlePin} onUnpin={handleUnpin}
          />
          {selectedTicker ? (
            <div className="card">
              <ChartComponent ticker={selectedTicker} />
            </div>
          ) : (
            <div className="space-y-3">
              {displayTickers.slice(0, 6).map((t) => (
                <div key={t} className="card">
                  <ChartComponent ticker={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "sectors" && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
            Sector Flow Clustering (7-day)
          </h4>
          <SectorClustering />
        </div>
      )}
    </div>
  );
}
