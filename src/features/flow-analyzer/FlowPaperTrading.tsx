import { useState, useMemo } from "react";
import { SystemRiskStatus } from "./SystemRiskStatus";
import { TradeDecisionLog } from "./TradeDecisionLog";
import { MissedOpportunities } from "./MissedOpportunities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { formatCurrency, changeColor } from "../../lib/utils";
import { GlassPanel, Chip, Stat } from "../../components/Glass";
import { premiumChange, markedExposure, signedPercent } from "../../lib/markFreshness";
import { MarkFreshness } from "../../components/MarkFreshness";
import { QueryNotice } from "../../components/QueryNotice";
import { expiryDte } from "../../lib/optionContract";
import { marketDate } from "../../lib/liveFeeds";
import type { ChipTone } from "../../components/Glass";
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  Eye,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  Activity,
  Layers,
  AlertTriangle,
} from "lucide-react";

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
  pnl_pct: number | null;
  pnl_dollars: number | null;
  score: number;
  scaled_out: number;
  status: string;
  exit_reason?: string;
  hold_days: number;
  slot_type?: string;
  entry_date?: string;
  analysis?: string;
  last_marked_at?: string | null;
  updated_at?: string | null;
  mark_status?: string | null;
  mark_quality?: string | null;
  exit_policy?: { stop_pct: number; tp1_pct: number; tp2_pct: number } | null;
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
  tier?: string;
  current_premium?: number | null;
  last_marked_at?: string | null;
  updated_at?: string | null;
  block_reason?: string | null;
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
    queryKey: ["flow-paper-status"],
    queryFn: () => apiClient.get("/flow-paper/status").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useIFlowTraderWatchlist() {
  return useQuery<IFlowWatchlistItem[]>({
    queryKey: ["flow-paper-watchlist"],
    queryFn: () => apiClient.get("/flow-paper/watchlist").then((r) => r.data),
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

function PnlBadge({ pnl }: { pnl: number | null }) {
  if (pnl === null) return <span className="text-xs text-text-muted">Mark unknown</span>;
  return (
    <Chip tone={pnl >= 0 ? "green" : "red"} className="num">
      mark {signedPercent(pnl)}
    </Chip>
  );
}

function ScoreBadge({ score }: { score: number }) {
  // Watchlist scores are on the backend's 0-10 prescore scale (capped at 10);
  // >= 7 matches MissedOpportunities' high-conviction cutoff.
  const tone: ChipTone =
    score >= 7 ? "green" : score >= 5 ? "orange" : "neutral";
  return (
    <Chip tone={tone} className="num">
      {score}
    </Chip>
  );
}

function SideIcon({ side }: { side: string }) {
  if (side === "Bull")
    return <TrendingUp size={12} className="text-accent-green" />;
  return <TrendingDown size={12} className="text-accent-red" />;
}

function SourceTag({ source }: { source?: string }) {
  if (!source) return null;
  const tone: ChipTone =
    source === "synthesis" ? "cyan" : source === "flash" ? "orange" : "neutral";
  return (
    <Chip tone={tone} className="uppercase tracking-wider">
      {source}
    </Chip>
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
        if (/^[🥇🥈🥉]/u.test(trimmed)) {
          return (
            <div key={i} className="pl-3 py-1.5 rounded-md text-sm"
                 style={{ background: "color-mix(in srgb, var(--accent-blue) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-blue) 28%, transparent)" }}>
              {renderLine(trimmed)}
            </div>
          );
        }

        // Lines starting with status emojis (positions, exits)
        if (["🟢", "🔵", "🟡", "🔴", "🔥", "⚠️", "🎉", "❌", "🚫", "✅"].some((prefix) => trimmed.startsWith(prefix))) {
          const isGreen = trimmed.startsWith("🟢") || trimmed.startsWith("🔵") || trimmed.startsWith("🎉") || trimmed.startsWith("🔥");
          const isRed = trimmed.startsWith("🔴") || trimmed.startsWith("❌") || trimmed.startsWith("⚠️");
          const borderColor = isGreen ? "var(--accent-green)" : isRed ? "var(--accent-red)" : "var(--border)";
          return (
            <div key={i} className="pl-3 py-1 rounded-md text-sm"
                 style={{ background: "color-mix(in srgb, var(--border) 12%, transparent)", border: `1px solid color-mix(in srgb, ${borderColor} 28%, transparent)` }}>
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

function PaperQueryError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="card flex items-center gap-2 py-2 px-3 text-xs text-accent-red">
      <AlertTriangle size={12} />
      <span>{label}</span>
      <button
        type="button"
        onClick={onRetry}
        className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
      >
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

export function FlowPaperTrading() {
  const queryClient = useQueryClient();
  const summaryQuery = useFlowPaperSummary();
  const { data: summary, isLoading, refetch } = summaryQuery;
  const statusQuery = useIFlowTraderStatus();
  const watchlistQuery = useIFlowTraderWatchlist();
  const synthesisQuery = useIFlowSynthesis();
  const riskQuery = useQuery<{ risk: { exit_policy?: Record<string, { stop_pct: number; trim_pct: number; take_profit_pct: number }> } }>({
    queryKey: ["iflow-trader-risk"],
    queryFn: () => apiClient.get("/iflow-trader/status").then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const { data: iflowStatus } = statusQuery;
  const { data: iflowWatchlist } = watchlistQuery;
  const { data: synthesis } = synthesisQuery;
  const [expandedPos, setExpandedPos] = useState<number | null>(null);

  const invalidateFlowTraderData = () => {
    queryClient.invalidateQueries({ queryKey: ["flow-paper-summary"] });
    queryClient.invalidateQueries({ queryKey: ["flow-paper-status"] });
    queryClient.invalidateQueries({ queryKey: ["flow-paper-watchlist"] });
    queryClient.invalidateQueries({ queryKey: ["iflow-trader-risk"] });
    queryClient.invalidateQueries({ queryKey: ["iflow-trader-closed"] });
    queryClient.invalidateQueries({ queryKey: ["iflow-trader-history"] });
  };

  const scanMutation = useMutation({
    mutationFn: () => apiClient.post("/flow-paper/scan"),
    onSuccess: invalidateFlowTraderData,
  });

  const resetMutation = useMutation({
    mutationFn: () => apiClient.post("/flow-paper/reset"),
    onSuccess: invalidateFlowTraderData,
  });

  const synthesisMutation = useMutation({
    mutationFn: () => apiClient.post("/iflow-trader/scan", { type: "synthesis" }, { timeout: 200_000 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["iflow-synthesis"] });
      invalidateFlowTraderData();
    },
  });

  // iFlow macro
  const macro = iflowStatus?.macro;
  const slots = iflowStatus?.slots;
  const wla = useMemo(
    () => (iflowWatchlist ?? []).filter((item) => item.list === "A" || item.tier === "A"),
    [iflowWatchlist],
  );
  const wlb = useMemo(
    () => (iflowWatchlist ?? []).filter((item) => item.list === "B" || item.tier === "B"),
    [iflowWatchlist],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading flow trader...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center py-12 text-accent-red text-sm gap-2">
        <AlertTriangle size={16} />
        <span>Unable to load flow trader.</span>
        <QueryNotice queries={[summaryQuery]} label="Flow trader" />
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  const ret = summary.return_pct;
  const retColor = changeColor(ret);
  const positions = summary.positions || [];

  return (
    <div className="space-y-4">
      <QueryNotice queries={[summaryQuery, statusQuery, watchlistQuery, synthesisQuery]} label="Flow trader feeds" />
      {(scanMutation.isError || resetMutation.isError || synthesisMutation.isError) && <p role="alert" className="text-xs text-accent-red">Trader action failed. Reload before retrying; a timed-out action may have completed.</p>}
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

      {statusQuery.isError && !iflowStatus && (
        <PaperQueryError label="Unable to load trader status." onRetry={() => void statusQuery.refetch()} />
      )}
      {watchlistQuery.isError && !iflowWatchlist && (
        <PaperQueryError label="Unable to load trader watchlist." onRetry={() => void watchlistQuery.refetch()} />
      )}
      {synthesisQuery.isError && !synthesis && (
        <PaperQueryError label="Unable to load trader synthesis." onRetry={() => void synthesisQuery.refetch()} />
      )}

      {/* System Risk Status (drawdown, circuit breaker, slots, sector warnings) */}
      <SystemRiskStatus />

      {/* Portfolio Summary */}
      <GlassPanel title="Flow Trader Portfolio">
        {(() => { const exposure = markedExposure(positions); return exposure.count > 0 && <p className="mb-3 text-xs text-accent-orange">Recorded valuation: {exposure.count} positions ({formatCurrency(exposure.value)} carried exposure) have stale, incomplete, unverified or unknown marks. Return is not a live quote.</p>; })()}
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="num text-2xl font-extrabold text-text-primary">
            {formatCurrency(summary.total_value)}
          </div>
          <div className="text-right">
            <div className="text-xs text-text-muted">Return</div>
            <div
              className="num text-lg font-extrabold"
              style={{ color: retColor }}
            >
              {ret >= 0 ? "+" : ""}
              {ret.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Stat label="Cash" value={formatCurrency(summary.cash)} />
          <Stat
            label="Positions"
            value={formatCurrency(summary.positions_value)}
          />
          <Stat
            label="Realized"
            tone={summary.realized_pnl >= 0 ? "green" : "red"}
            value={`${summary.realized_pnl >= 0 ? "+" : ""}${formatCurrency(summary.realized_pnl)}`}
          />
          <Stat label="Win Rate" value={`${summary.win_rate.toFixed(0)}%`} />
          <Stat label="Watching" value={summary.watching} />
          <Stat label="Open" value={summary.open_positions} />
        </div>
      </GlassPanel>

      {/* Macro Status Bar */}
      {macro && (
        <div
          className="card flex items-center justify-between py-2 px-4"
          style={{ background: "color-mix(in srgb, var(--accent-cyan) 4%, var(--card-bg))" }}
        >
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1 text-text-muted">
              <Activity size={10} />
              <span>Macro</span>
            </div>
            <span className="num">
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
            <span className="num">
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
            <Chip
              tone={macro.is_safe ? "green" : "red"}
              className="uppercase tracking-wider"
            >
              <Shield size={9} />
              {macro.is_safe ? "SAFE" : "UNSAFE"}
            </Chip>
          </div>
          <span className="text-sm text-text-muted">{macro.market_status}</span>
        </div>
      )}

      {/* Slot Visualization */}
      {slots && (
        <div className="card flex items-center gap-6 py-2 px-4">
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
            <span className="text-text-muted num text-xs">
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
            <span className="text-text-muted num text-xs">
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
              const pnlColor = pos.pnl_pct == null ? "var(--text-muted)" : changeColor(pos.pnl_pct);
              const sideColor =
                pos.side === "Bull"
                  ? "var(--accent-green)"
                  : "var(--accent-red)";
              const isExpanded = expandedPos === pos.id;
              const pnlDollars = pos.pnl_dollars;
              const configured = riskQuery.data?.risk?.exit_policy?.[pos.slot_type ?? ""];
              const policy = pos.exit_policy ?? (configured ? { stop_pct: configured.stop_pct, tp1_pct: configured.trim_pct, tp2_pct: configured.take_profit_pct } : null);
              const hasPolicy = policy && [policy.stop_pct, policy.tp1_pct, policy.tp2_pct].every(Number.isFinite);
              const stopTarget = pos.entry_premium * (1 + (policy?.stop_pct ?? 0) / 100);
              const tp1Target = pos.entry_premium * (1 + (policy?.tp1_pct ?? 0) / 100);
              const tp2Target = pos.entry_premium * (1 + (policy?.tp2_pct ?? 0) / 100);
              const slotLabel = pos.slot_type === "day_trade" ? "DT" : "SW";

              return (
                <div
                  key={pos.id}
                  className="card card-interactive cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${pos.ticker} position`}
                  style={{ borderColor: `color-mix(in srgb, ${sideColor} 35%, var(--border))` }}
                  onClick={() => setExpandedPos(isExpanded ? null : pos.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpandedPos(isExpanded ? null : pos.id);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip
                        tone={pos.slot_type === "day_trade" ? "blue" : "purple"}
                        className="num"
                      >
                        {slotLabel}
                      </Chip>
                      <span className="font-mono text-base font-extrabold text-text-primary">
                        {pos.ticker}
                      </span>
                      <span className="num text-sm text-text-primary">
                        ${pos.strike} {pos.option_type}
                      </span>
                      <span className="text-text-muted text-xs num">
                        x{pos.contracts}
                        {pos.scaled_out ? " (scaled)" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-xs">
                        <div className="text-text-muted">Cost</div>
                        <div className="num text-text-primary">
                          {formatCurrency(pos.cost_basis)}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-text-muted">Value</div>
                        <div className="num text-text-primary">
                          {pos.current_value == null ? "Unknown" : formatCurrency(pos.current_value)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-text-muted text-xs">P/L</div>
                        <div
                          className="num text-sm font-extrabold"
                          style={{ color: pnlColor }}
                        >
                          {signedPercent(pos.pnl_pct)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <MarkFreshness at={pos.last_marked_at ?? pos.updated_at} status={pos.mark_status} quality={pos.mark_quality} />

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border space-y-2">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-text-muted">Side</div>
                          <div className="font-semibold" style={{ color: sideColor }}>
                            {pos.side === "Bull" ? "Bullish" : "Bearish"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry</div>
                          <div className="num text-text-primary">${pos.entry_premium?.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Current</div>
                          <div className="num" style={{ color: pnlColor }}>
                            ${pos.current_premium?.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">P/L $</div>
                          <div className="num font-semibold" style={{ color: pnlColor }}>
                            {pnlDollars == null ? "Unknown" : `${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(0)}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry Date</div>
                          <div className="num text-text-primary">{pos.entry_date}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Hold Days</div>
                          <div className="num text-text-primary">{pos.hold_days ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Expiry</div>
                          <div className="num text-text-primary">{pos.expiry} ({expiryDte(pos.expiry, marketDate()) ?? "?"}d)</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Slot</div>
                          <div style={{
                            color: pos.slot_type === "day_trade" ? "var(--accent-blue)" : "var(--accent-purple)"
                          }}>{pos.slot_type === "day_trade" ? "Day Trade" : "Swing"}</div>
                        </div>
                      </div>

                      {pos.analysis && (
                        <div className="text-xs text-text-secondary leading-relaxed rounded-md px-2 py-1.5"
                             style={{ background: "color-mix(in srgb, var(--bg-card) 50%, transparent)" }}>
                          {pos.analysis}
                        </div>
                      )}

                      {!hasPolicy && <p className="text-xs text-text-muted">Exit policy unavailable</p>}
                      {hasPolicy && <div className="flex flex-wrap items-center gap-3 text-xs num pt-1">
                        <span className="text-text-muted">Targets:</span>
                        <span className="text-accent-red">
                          Stop ${stopTarget.toFixed(2)} ({signedPercent(policy.stop_pct, 0)})
                        </span>
                        <span className="text-accent-orange">
                          TP1 ${tp1Target.toFixed(2)} ({signedPercent(policy.tp1_pct, 0)})
                        </span>
                        <span className="text-accent-green">
                          TP2 ${tp2Target.toFixed(2)} ({signedPercent(policy.tp2_pct, 0)})
                        </span>
                      </div>}

                      {hasPolicy && pos.current_premium != null && <div className="relative h-2 rounded-full bg-border overflow-hidden">
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
                                  background: (pos.pnl_pct ?? 0) >= 0
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
                      </div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trade Decision Log — closed positions with full scoring rationale + exit reason */}
      <details className="text-xs">
        <summary className="text-xs uppercase tracking-wider text-text-muted font-semibold cursor-pointer mb-2">
          Trade Decision Log
        </summary>
        <div className="mt-2"><TradeDecisionLog /></div>
      </details>

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
                  const pnl = premiumChange(w.current_premium, w.ref_premium, w.last_marked_at);
                  return (
                    <div
                      key={w.id ?? idx}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-md"
                      style={{
                        background: "color-mix(in srgb, var(--accent-green) 5%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent-green) 24%, transparent)",
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <ScoreBadge score={w.score} />
                        <SideIcon side={w.side} />
                        <span className="font-mono text-sm font-bold text-text-primary">
                          {w.ticker}
                        </span>
                        <span className="num text-xs text-text-primary">
                          ${w.strike}
                        </span>
                        <span className="text-xs" style={{ color: optColor }}>
                          {w.option_type}
                        </span>
                        <span className="text-xs text-accent-blue num">
                          exp {w.expiry}
                        </span>
                        <SourceTag source={w.source} />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-text-muted num">
                          ref ${typeof w.ref_premium === "number" ? w.ref_premium.toFixed(2) : w.ref_premium}
                        </span>
                        {w.gate_price != null && (
                          <span className="num text-xs text-accent-green font-semibold">
                            gate ${typeof w.gate_price === "number" ? w.gate_price.toFixed(2) : w.gate_price}
                          </span>
                        )}
                        <PnlBadge pnl={pnl} />
                        <MarkFreshness at={w.last_marked_at} />
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
                  const pnl = premiumChange(w.current_premium, w.ref_premium, w.last_marked_at);
                  return (
                    <div
                      key={w.id ?? idx}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-md"
                      style={{
                        background: "color-mix(in srgb, var(--accent-orange) 5%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent-orange) 24%, transparent)",
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <ScoreBadge score={w.score} />
                        <SideIcon side={w.side} />
                        <span className="font-mono text-sm font-bold text-text-primary">
                          {w.ticker}
                        </span>
                        <span className="num text-xs text-text-primary">
                          ${w.strike}
                        </span>
                        <span className="text-xs" style={{ color: optColor }}>
                          {w.option_type}
                        </span>
                        <span className="text-xs text-accent-blue num">
                          exp {w.expiry}
                        </span>
                        <SourceTag source={w.source} />
                      </div>
                      <div className="flex items-center gap-3">
                        <PnlBadge pnl={pnl} />
                        <MarkFreshness at={w.last_marked_at} />
                        <span className="text-sm text-text-muted num">
                          ref ${typeof w.ref_premium === "number" ? w.ref_premium.toFixed(2) : w.ref_premium}
                        </span>
                        <span className="text-xs text-text-muted italic">
                          {w.block_reason ?? "Monitoring"}
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

      {/* Missed Opportunities — WL-A unfilled + WL-B high-score with what-if P/L */}
      <details className="text-xs">
        <summary className="text-xs uppercase tracking-wider text-text-muted font-semibold cursor-pointer mb-2">
          Missed Opportunities
        </summary>
        <div className="mt-2"><MissedOpportunities /></div>
      </details>

      {/* Synthesis Report Panel + trigger */}
      <GlassPanel
        title={
          <span className="inline-flex items-center gap-1 text-accent-cyan">
            <Activity size={10} />
            Daily Synthesis
            {synthesis?.date && (
              <span className="text-text-muted font-normal ml-1 normal-case tracking-normal num">
                — {synthesis.date}
              </span>
            )}
          </span>
        }
        actions={
          <button
            onClick={() => synthesisMutation.mutate()}
            disabled={synthesisMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25 transition-colors disabled:opacity-40"
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
        }
      >
        {synthesisMutation.isPending && (
          <div className="flex items-center gap-2 py-3 text-sm text-accent-cyan">
            <Loader2 size={14} className="animate-spin" />
            Claude is analyzing flow data + research... this takes 30-60 seconds
          </div>
        )}
        {synthesis?.report ? (
          <SynthesisReport report={synthesis.report} />
        ) : (
          <p className="text-sm text-text-muted text-center py-3">
            No synthesis report yet — click Generate to create one
          </p>
        )}
      </GlassPanel>

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
