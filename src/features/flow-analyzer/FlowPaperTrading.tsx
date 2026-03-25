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

function useFlowPaperSummary() {
  return useQuery<FlowPaperSummary>({
    queryKey: ["flow-paper-summary"],
    queryFn: () => apiClient.get("/flow-paper/summary").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
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

export function FlowPaperTrading() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useFlowPaperSummary();
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
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              Flow Trader Portfolio
            </div>
            <div className="font-mono text-2xl font-extrabold text-text-primary">
              {formatCurrency(summary.total_value)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
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

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-accent-orange font-semibold flex items-center gap-1">
              <Eye size={10} />
              Watchlist — Top by Score ({watchlist.length})
            </div>
            {watchlist.length > 15 && (
              <button
                onClick={() => setShowAllWatchlist(!showAllWatchlist)}
                className="text-[10px] text-accent-blue hover:underline"
              >
                {showAllWatchlist ? "Show less" : `Show all ${watchlist.length}`}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {displayWatchlist.map((w) => {
              const dip =
                w.ref_premium > 0 && w.current_premium
                  ? ((w.current_premium - w.ref_premium) / w.ref_premium) * 100
                  : 0;
              const dipColor =
                dip < -5
                  ? "var(--accent-green)"
                  : dip < 0
                    ? "var(--accent-orange)"
                    : "var(--text-muted)";
              const optColor =
                w.option_type === "CALL" || w.option_type === "C"
                  ? "var(--accent-green)"
                  : "var(--accent-red)";

              return (
                <div
                  key={w.id}
                  className="flex items-center justify-between px-3 py-1.5 rounded-md"
                  style={{
                    background: "rgba(48,54,61,0.12)",
                    borderLeft: `3px solid ${w.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)"}`,
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
                    <span className="text-[10px] text-accent-blue">
                      exp {w.expiry}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-text-muted">
                      ref ${w.ref_premium.toFixed(2)}
                    </span>
                    <span
                      className="font-mono text-xs font-bold"
                      style={{ color: dipColor }}
                    >
                      {dip.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Open Positions */}
      {positions.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-accent-blue font-semibold mb-2 flex items-center gap-1">
            <Zap size={10} />
            Open Positions
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

              return (
                <div
                  key={pos.id}
                  className="card cursor-pointer transition-all hover:brightness-110"
                  style={{ borderLeft: `3px solid ${sideColor}` }}
                  onClick={() => setExpandedPos(isExpanded ? null : pos.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={pos.score} />
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
                        <div className="text-text-muted text-[10px]">P/L</div>
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

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-text-muted">Side</div>
                          <div className="font-mono font-semibold" style={{ color: sideColor }}>
                            {pos.side === "Bull" ? "🐂 Bullish" : "🐻 Bearish"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry Premium</div>
                          <div className="font-mono text-text-primary">${pos.entry_premium?.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Current Premium</div>
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
                          <div className="text-text-muted">Score</div>
                          <div className="font-mono text-accent-blue">{(pos.score / 10).toFixed(1)}</div>
                        </div>
                      </div>

                      {/* Exit targets */}
                      <div className="flex items-center gap-3 text-[10px] font-mono pt-1">
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

                      {/* Analysis / Reasoning */}
                      {pos.analysis && (
                        <div className="text-[10px] text-text-secondary leading-relaxed rounded-md px-2 py-1.5"
                             style={{ background: "rgba(13,17,23,0.5)" }}>
                          {pos.analysis}
                        </div>
                      )}

                      {/* Progress bar: stop ← current → TP2 */}
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
          <summary className="text-[10px] uppercase tracking-wider text-text-muted font-semibold cursor-pointer mb-2">
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

      {/* Empty state */}
      {positions.length === 0 && watchlist.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          Click <strong>Scan & Trade</strong> to analyze flow entries and start
          watching for dip-buy opportunities.
        </div>
      )}
    </div>
  );
}
