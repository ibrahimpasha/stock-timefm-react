import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { formatCurrency, changeColor } from "../../lib/utils";
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  Eye,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Shield,
  Activity,
  Layers,
} from "lucide-react";

interface WatchlistItem {
  id: number;
  ticker: string;
  strike: number;
  option_type: string;
  expiry: string;
  dte: number;
  side: string;
  ref_premium: number;
  current_premium: number | null;
  score: number;
  status: string;
}

interface Position {
  id: number;
  ticker: string;
  side: string;
  strike: number;
  option_type: string;
  expiry: string;
  contracts: number;
  entry_premium: number;
  current_premium: number | null;
  cost_basis: number;
  current_value: number | null;
  pnl_pct: number;
  pnl_dollars: number;
  score: number;
  scaled_out: number;
  status: string;
  exit_reason?: string;
  hold_days: number;
}

interface FlowPaperSummary {
  cash: number;
  positions_value: number;
  total_value: number;
  return_pct: number;
  realized_pnl: number;
  unrealized_pnl: number;
  open_positions: number;
  closed_positions: number;
  win_rate: number;
  watching: number;
  positions: Position[];
  closed: Position[];
  watchlist: WatchlistItem[];
}

interface MacroData {
  spy_price: number;
  spy_change_pct: number;
  vix: number;
  market_status: string;
  is_safe: boolean;
}

interface IFlowStatus {
  portfolio: Record<string, unknown>;
  macro: MacroData;
  slots: {
    day_trade: { used: number; max: number };
    swing: { used: number; max: number };
  };
  watchlist: { wla_count: number; wlb_count: number };
}

interface IFlowWatchlistItem {
  id?: number;
  ticker: string;
  strike: number | string;
  option_type: string;
  expiry: string;
  side: string;
  ref_premium: number;
  gate_price?: number | null;
  score: number;
  source?: string;
  list?: string;
}

interface IFlowWatchlist {
  wla: IFlowWatchlistItem[];
  wlb: IFlowWatchlistItem[];
}

interface IFlowSynthesis {
  date: string;
  report: string;
}

function useFlowPaperSummary() {
  return useQuery<FlowPaperSummary>({
    queryKey: ["flow-paper-summary"],
    queryFn: () => apiClient.get("/flow-paper/summary").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useIFlowTraderStatus() {
  return useQuery<IFlowStatus>({
    queryKey: ["iflow-trader-status"],
    queryFn: () => apiClient.get("/iflow-trader/status").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useIFlowTraderWatchlist() {
  return useQuery<IFlowWatchlist>({
    queryKey: ["iflow-trader-watchlist"],
    queryFn: () => apiClient.get("/iflow-trader/watchlist").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useIFlowSynthesis() {
  return useQuery<IFlowSynthesis>({
    queryKey: ["iflow-synthesis"],
    queryFn: () =>
      apiClient.get("/iflow-trader/synthesis").then((r) => r.data),
    staleTime: 60_000,
  });
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70
      ? "var(--accent-green)"
      : score >= 50
        ? "var(--accent-orange)"
        : "var(--text-muted)";
  return (
    <span
      className="font-mono text-[11px] font-extrabold px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}15` }}
    >
      {score}
    </span>
  );
}

function SideIcon({ side }: { side: string }) {
  if (side === "Bull")
    return <TrendingUp size={12} className="text-accent-green" />;
  return <TrendingDown size={12} className="text-accent-red" />;
}

function SourceTag({ source }: { source?: string }) {
  if (!source) return null;
  const color =
    source === "synthesis"
      ? "var(--accent-cyan)"
      : source === "flash"
        ? "var(--accent-orange)"
        : "var(--text-muted)";
  return (
    <span
      className="text-xs px-1 py-0.5 rounded uppercase tracking-wider font-semibold"
      style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
    >
      {source}
    </span>
  );
}

function SynthesisReport({ report }: { report: string }) {
  // Render markdown-like content: # headers, **bold**, emojis preserved
  function renderLine(text: string) {
    // Convert **bold** to <strong>
    return text.split(/(\*\*[^*]+\*\*)/).map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j} className="text-text-primary">{part.slice(2, -2)}</strong>;
      }
      return <span key={j}>{part}</span>;
    });
  }

  const lines = report.split("\n");

  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        // # Title
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={i} className="text-lg font-bold text-text-primary pb-1 border-b border-border">
              {renderLine(trimmed.slice(2))}
            </h3>
          );
        }

        // ## Section header
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={i} className="text-base font-semibold text-text-primary mt-3 mb-1">
              {renderLine(trimmed.slice(3))}
            </h4>
          );
        }

        // Lines starting with medal emojis (priority queue)
        if (/^[🥇🥈🥉]/.test(trimmed)) {
          return (
            <div key={i} className="pl-3 py-1.5 rounded-md text-sm"
                 style={{ background: "rgba(88,166,255,0.06)", borderLeft: "3px solid var(--accent-blue)" }}>
              {renderLine(trimmed)}
            </div>
          );
        }

        // Lines starting with status emojis (positions, exits)
        if (/^[🟢🔵🟡🔴🔥⚠️🎉❌🚫✅]/.test(trimmed)) {
          const isGreen = trimmed.startsWith("🟢") || trimmed.startsWith("🔵") || trimmed.startsWith("🎉") || trimmed.startsWith("🔥");
          const isRed = trimmed.startsWith("🔴") || trimmed.startsWith("❌") || trimmed.startsWith("⚠️");
          const borderColor = isGreen ? "var(--accent-green)" : isRed ? "var(--accent-red)" : "var(--border)";
          return (
            <div key={i} className="pl-3 py-1 rounded-md text-sm"
                 style={{ background: "rgba(48,54,61,0.12)", borderLeft: `3px solid ${borderColor}` }}>
              {renderLine(trimmed)}
            </div>
          );
        }

        // Regular text with emojis
        return (
          <div key={i} className="text-text-secondary text-sm">
            {renderLine(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

export function FlowPaperTrading() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useFlowPaperSummary();
  const { data: iflowStatus } = useIFlowTraderStatus();
  const { data: iflowWatchlist } = useIFlowTraderWatchlist();
  const { data: synthesis } = useIFlowSynthesis();
  const [showAllWatchlist, setShowAllWatchlist] = useState(false);
  const [expandedPos, setExpandedPos] = useState<number | null>(null);

  const scanMutation = useMutation({
    mutationFn: () => apiClient.post("/flow-paper/scan"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["flow-paper-summary"] }),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiClient.post("/flow-paper/reset"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["flow-paper-summary"] }),
  });

  const synthesisMutation = useMutation({
    mutationFn: () => apiClient.post("/iflow-trader/scan", { type: "synthesis" }, { timeout: 200_000 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["iflow-synthesis"] });
      queryClient.invalidateQueries({ queryKey: ["flow-paper-summary"] });
    },
  });

  if (isLoading || !summary) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading flow trader...
      </div>
    );
  }

  const ret = summary.return_pct;
  const retColor = changeColor(ret);
  const watchlist = summary.watchlist || [];
  const positions = summary.positions || [];
  const closed = summary.closed || [];
  const sortedWatchlist = [...watchlist].sort(
    (a, b) => (b.score || 0) - (a.score || 0)
  );
  const displayWatchlist = showAllWatchlist
    ? sortedWatchlist
    : sortedWatchlist.slice(0, 15);

  // iFlow macro
  const macro = iflowStatus?.macro;
  const slots = iflowStatus?.slots;
  const wla = iflowWatchlist?.wla ?? [];
  const wlb = iflowWatchlist?.wlb ?? [];

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-bg-primary font-semibold text-sm transition-all hover:brightness-110 disabled:opacity-40"
        >
          {scanMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Scan & Trade
        </button>
        <button
          onClick={() => {
            if (confirm("Reset flow paper trader to $10K?"))
              resetMutation.mutate();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-text-secondary text-xs hover:text-accent-red hover:border-accent-red/40 transition-all"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </div>

      {/* Portfolio Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-text-muted">
              Flow Trader Portfolio
            </div>
            <div className="font-mono text-2xl font-extrabold text-text-primary">
              {formatCurrency(summary.total_value)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-text-muted">
              Return
            </div>
            <div
              className="font-mono text-xl font-extrabold"
              style={{ color: retColor }}
            >
              {ret >= 0 ? "+" : ""}
              {ret.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
          <div>
            <div className="text-text-muted">Cash</div>
            <div className="font-mono text-text-primary">
              {formatCurrency(summary.cash)}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Positions</div>
            <div className="font-mono text-text-primary">
              {formatCurrency(summary.positions_value)}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Realized</div>
            <div
              className="font-mono"
              style={{ color: changeColor(summary.realized_pnl) }}
            >
              {summary.realized_pnl >= 0 ? "+" : ""}
              {formatCurrency(summary.realized_pnl)}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Win Rate</div>
            <div className="font-mono text-text-primary">
              {summary.win_rate.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-text-muted flex items-center gap-1">
              <Eye size={10} />
              Watching
            </div>
            <div className="font-mono text-accent-orange">
              {summary.watching}
            </div>
          </div>
          <div>
            <div className="text-text-muted flex items-center gap-1">
              <Target size={10} />
              Open
            </div>
            <div className="font-mono text-accent-blue">
              {summary.open_positions}
            </div>
          </div>
        </div>
      </div>

      {/* Macro Status Bar */}
      {macro && (
        <div
          className="card flex items-center justify-between py-2 px-4"
          style={{ borderLeft: "3px solid var(--accent-cyan)" }}
        >
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 text-text-muted">
              <Activity size={10} />
              <span>Macro</span>
            </div>
            <span className="font-mono">
              SPY ${macro.spy_price.toFixed(2)}{" "}
              <span
                style={{
                  color:
                    macro.spy_change_pct >= 0
                      ? "var(--accent-green)"
                      : "var(--accent-red)",
                }}
              >
                {macro.spy_change_pct >= 0 ? "+" : ""}
                {macro.spy_change_pct.toFixed(2)}%
              </span>
            </span>
            <span className="font-mono">
              VIX{" "}
              <span
                style={{
                  color:
                    macro.vix >= 35
                      ? "var(--accent-red)"
                      : macro.vix >= 25
                        ? "var(--accent-orange)"
                        : "var(--accent-green)",
                }}
              >
                {macro.vix.toFixed(1)}
              </span>
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded font-semibold uppercase tracking-wider"
              style={{
                color: macro.is_safe
                  ? "var(--accent-green)"
                  : "var(--accent-red)",
                background: macro.is_safe
                  ? "rgba(63,185,80,0.12)"
                  : "rgba(248,81,73,0.12)",
                border: `1px solid ${macro.is_safe ? "rgba(63,185,80,0.3)" : "rgba(248,81,73,0.3)"}`,
              }}
            >
              <Shield
                size={9}
                style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }}
              />
              {macro.is_safe ? "SAFE" : "UNSAFE"}
            </span>
          </div>
          <span className="text-sm text-text-muted">{macro.market_status}</span>
        </div>
      )}

      {/* Slot Visualization */}
      {slots && (
        <div
          className="card flex items-center gap-6 py-2 px-4"
          style={{ borderLeft: "3px solid var(--border)" }}
        >
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <Layers size={10} />
            <span>Slots</span>
          </div>
          {/* Day Trade slots */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">DT:</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: slots.day_trade.max }, (_, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded"
                  style={{
                    background:
                      i < slots.day_trade.used
                        ? "var(--accent-blue)"
                        : "transparent",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
            <span className="text-text-muted font-mono text-xs">
              {slots.day_trade.used}/{slots.day_trade.max}
            </span>
          </div>
          {/* Swing slots */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted">SW:</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: slots.swing.max }, (_, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded"
                  style={{
                    background:
                      i < slots.swing.used
                        ? "var(--accent-purple)"
                        : "transparent",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
            <span className="text-text-muted font-mono text-xs">
              {slots.swing.used}/{slots.swing.max}
            </span>
          </div>
        </div>
      )}

      {/* Open Positions — moved to top */}
      {positions.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-accent-blue font-semibold mb-2 flex items-center gap-1">
            <Zap size={10} />
            Open Positions ({positions.length})
          </div>
          <div className="space-y-2">
            {positions.map((pos) => {
              const pnlColor = changeColor(pos.pnl_pct);
              const sideColor =
                pos.side === "Bull"
                  ? "var(--accent-green)"
                  : "var(--accent-red)";
              const isExpanded = expandedPos === pos.id;
              const pnlDollars = pos.pnl_dollars ?? ((pos.current_value ?? 0) - pos.cost_basis);
              const stopTarget = pos.entry_premium * 0.7;
              const tp1Target = pos.entry_premium * 1.5;
              const tp2Target = pos.entry_premium * 2.0;
              const slotLabel = pos.slot_type === "day_trade" ? "DT" : "SW";

              return (
                <div
                  key={pos.id}
                  className="card cursor-pointer transition-all hover:brightness-110"
                  style={{ borderLeft: `3px solid ${sideColor}` }}
                  onClick={() => setExpandedPos(isExpanded ? null : pos.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1 py-0.5 rounded" style={{
                        background: pos.slot_type === "day_trade" ? "rgba(88,166,255,0.15)" : "rgba(188,140,255,0.15)",
                        color: pos.slot_type === "day_trade" ? "var(--accent-blue)" : "var(--accent-purple)",
                      }}>{slotLabel}</span>
                      <span className="font-mono text-base font-extrabold text-text-primary">
                        {pos.ticker}
                      </span>
                      <span className="font-mono text-sm text-text-primary">
                        ${pos.strike} {pos.option_type}
                      </span>
                      <span className="text-text-muted text-xs">
                        x{pos.contracts}
                        {pos.scaled_out ? " (scaled)" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <div className="text-text-muted">Cost</div>
                        <div className="font-mono text-text-primary">
                          {formatCurrency(pos.cost_basis)}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-text-muted">Value</div>
                        <div className="font-mono text-text-primary">
                          {formatCurrency(pos.current_value ?? 0)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-text-muted text-xs">P/L</div>
                        <div
                          className="font-mono text-sm font-extrabold"
                          style={{ color: pnlColor }}
                        >
                          {pos.pnl_pct >= 0 ? "+" : ""}
                          {pos.pnl_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-text-muted">Side</div>
                          <div className="font-mono font-semibold" style={{ color: sideColor }}>
                            {pos.side === "Bull" ? "Bullish" : "Bearish"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry</div>
                          <div className="font-mono text-text-primary">${pos.entry_premium?.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Current</div>
                          <div className="font-mono" style={{ color: pnlColor }}>
                            ${pos.current_premium?.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">P/L $</div>
                          <div className="font-mono font-semibold" style={{ color: pnlColor }}>
                            {pnlDollars >= 0 ? "+" : ""}${pnlDollars.toFixed(0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry Date</div>
                          <div className="font-mono text-text-primary">{pos.entry_date}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Hold Days</div>
                          <div className="font-mono text-text-primary">{pos.hold_days ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Expiry</div>
                          <div className="font-mono text-text-primary">{pos.expiry}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Slot</div>
                          <div className="font-mono" style={{
                            color: pos.slot_type === "day_trade" ? "var(--accent-blue)" : "var(--accent-purple)"
                          }}>{pos.slot_type === "day_trade" ? "Day Trade" : "Swing"}</div>
                        </div>
                      </div>

                      {pos.analysis && (
                        <div className="text-xs text-text-secondary leading-relaxed rounded-md px-2 py-1.5"
                             style={{ background: "rgba(13,17,23,0.5)" }}>
                          {pos.analysis}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs font-mono pt-1">
                        <span className="text-text-muted">Targets:</span>
                        <span className="text-accent-red">
                          Stop ${stopTarget.toFixed(2)} (-30%)
                        </span>
                        <span className="text-accent-orange">
                          TP1 ${tp1Target.toFixed(2)} (+50%)
                        </span>
                        <span className="text-accent-green">
                          TP2 ${tp2Target.toFixed(2)} (+100%)
                        </span>
                      </div>

                      <div className="relative h-2 rounded-full bg-border overflow-hidden">
                        {(() => {
                          const range = tp2Target - stopTarget;
                          const pos_pct = range > 0
                            ? Math.max(0, Math.min(100, ((pos.current_premium ?? pos.entry_premium) - stopTarget) / range * 100))
                            : 50;
                          const tp1_pct = range > 0 ? ((tp1Target - stopTarget) / range * 100) : 66;
                          return (
                            <>
                              <div
                                className="absolute h-full rounded-full transition-all"
                                style={{
                                  width: `${pos_pct}%`,
                                  background: pos.pnl_pct >= 0
                                    ? "var(--accent-green)"
                                    : "var(--accent-red)",
                                }}
                              />
                              <div
                                className="absolute h-full w-px bg-accent-orange"
                                style={{ left: `${tp1_pct}%` }}
                              />
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Closed Positions */}
      {closed.length > 0 && (
        <details className="text-xs">
          <summary className="text-xs uppercase tracking-wider text-text-muted font-semibold cursor-pointer mb-2">
            Closed Positions ({closed.length})
          </summary>
          <div className="space-y-1 mt-2">
            {closed.map((pos) => {
              const pnlColor = changeColor(pos.pnl_pct);
              return (
                <div
                  key={pos.id}
                  className="flex items-center justify-between px-3 py-1.5 border-b border-border"
                >
                  <span className="font-mono text-text-muted">
                    {pos.ticker} ${pos.strike} {pos.option_type} x
                    {pos.contracts}
                  </span>
                  <span className="font-mono font-bold" style={{ color: pnlColor }}>
                    {pos.pnl_pct >= 0 ? "+" : ""}
                    {pos.pnl_pct.toFixed(1)}% — {pos.exit_reason}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* WL-A / WL-B Separated Watchlist */}
      {(wla.length > 0 || wlb.length > 0) && (
        <div className="space-y-3">
          {/* WL-A — Auto-Entry */}
          {wla.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-accent-green font-semibold flex items-center gap-1 mb-2">
                <Zap size={10} />
                WL-A — Auto-Entry ({wla.length})
              </div>
              <div className="space-y-1">
                {wla.map((w, idx) => {
                  const optColor =
                    w.option_type === "CALL" || w.option_type === "C"
                      ? "var(--accent-green)"
                      : "var(--accent-red)";
                  return (
                    <div
                      key={w.id ?? idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-md"
                      style={{
                        background: "rgba(63,185,80,0.05)",
                        borderLeft: "3px solid var(--accent-green)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={w.score} />
                        <SideIcon side={w.side} />
                        <span className="font-mono text-sm font-bold text-text-primary">
                          {w.ticker}
                        </span>
                        <span className="font-mono text-xs text-text-primary">
                          ${w.strike}
                        </span>
                        <span className="text-xs" style={{ color: optColor }}>
                          {w.option_type}
                        </span>
                        <span className="text-xs text-accent-blue">
                          exp {w.expiry}
                        </span>
                        <SourceTag source={w.source} />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-text-muted">
                          ref ${typeof w.ref_premium === "number" ? w.ref_premium.toFixed(2) : w.ref_premium}
                        </span>
                        {w.gate_price != null && (
                          <span className="font-mono text-xs text-accent-green font-semibold">
                            gate ${typeof w.gate_price === "number" ? w.gate_price.toFixed(2) : w.gate_price}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* WL-B — Analysis Only */}
          {wlb.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-accent-orange font-semibold flex items-center gap-1 mb-2">
                <Eye size={10} />
                WL-B — Analysis Only ({wlb.length})
              </div>
              <div className="space-y-1">
                {wlb.map((w, idx) => {
                  const optColor =
                    w.option_type === "CALL" || w.option_type === "C"
                      ? "var(--accent-green)"
                      : "var(--accent-red)";
                  return (
                    <div
                      key={w.id ?? idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-md"
                      style={{
                        background: "rgba(255,165,0,0.05)",
                        borderLeft: "3px solid var(--accent-orange)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ScoreBadge score={w.score} />
                        <SideIcon side={w.side} />
                        <span className="font-mono text-sm font-bold text-text-primary">
                          {w.ticker}
                        </span>
                        <span className="font-mono text-xs text-text-primary">
                          ${w.strike}
                        </span>
                        <span className="text-xs" style={{ color: optColor }}>
                          {w.option_type}
                        </span>
                        <span className="text-xs text-accent-blue">
                          exp {w.expiry}
                        </span>
                        <SourceTag source={w.source} />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-text-muted">
                          ref ${typeof w.ref_premium === "number" ? w.ref_premium.toFixed(2) : w.ref_premium}
                        </span>
                        <span className="text-xs text-text-muted italic">
                          awaiting ML
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Synthesis Report Panel + trigger */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-accent-cyan font-semibold flex items-center gap-1">
            <Activity size={10} />
            Daily Synthesis
            {synthesis?.date && (
              <span className="text-text-muted font-normal ml-1 normal-case tracking-normal">
                — {synthesis.date}
              </span>
            )}
          </div>
          <button
            onClick={() => synthesisMutation.mutate()}
            disabled={synthesisMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25 transition-colors disabled:opacity-40"
          >
            {synthesisMutation.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Generating with Claude...
              </>
            ) : (
              <>
                <RefreshCw size={12} />
                Generate
              </>
            )}
          </button>
        </div>
        {synthesisMutation.isPending && (
          <div className="flex items-center gap-2 py-3 text-sm text-accent-cyan">
            <Loader2 size={14} className="animate-spin" />
            Claude is analyzing flow data + research... this takes 30-60 seconds
          </div>
        )}
        {synthesis?.report ? (
          <SynthesisReport report={synthesis.report} />
        ) : (
          <p className="text-xs text-text-muted text-center py-3">
            No synthesis report yet — click Generate to create one
          </p>
        )}
      </div>

      {/* Empty state */}
      {positions.length === 0 && wla.length === 0 && wlb.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          Click <strong>Scan & Trade</strong> to analyze flow entries and start
          watching for dip-buy opportunities.
        </div>
      )}
    </div>
  );
}
