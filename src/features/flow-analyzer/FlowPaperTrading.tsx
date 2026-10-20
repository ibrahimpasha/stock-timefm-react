import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { SystemRiskStatus } from "./SystemRiskStatus";
import { TradeDecisionLog } from "./TradeDecisionLog";
import { MissedOpportunities } from "./MissedOpportunities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { formatCurrency, changeColor } from "../../lib/utils";
import { Chip, Stat } from "../../components/Glass";
import { premiumChange, markedExposure, signedPercent } from "../../lib/markFreshness";
import { MarkFreshness } from "../../components/MarkFreshness";
import { QueryNotice } from "../../components/QueryNotice";
import { expiryDte } from "../../lib/optionContract";
import { marketDate } from "../../lib/liveFeeds";
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
  ChevronRight,
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
    <span className="text-xs text-text-muted">
      mark{" "}
      <span className="num font-semibold" style={{ color: pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
        {signedPercent(pnl)}
      </span>
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  // Watchlist scores are on the backend's 0-10 prescore scale (capped at 10);
  // >= 7 matches MissedOpportunities' high-conviction cutoff.
  return (
    <span
      className={`num text-xs w-5 text-right ${score >= 7 ? "font-semibold text-text-primary" : "text-text-muted"}`}
      title={`Prescore ${score}/10${score >= 7 ? " (high conviction)" : ""}`}
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
  return <Chip>{source}</Chip>;
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
    <div className="max-w-[72ch] space-y-3">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        // # Title
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={i} className="font-display text-xl font-medium text-text-primary">
              {renderLine(trimmed.slice(2))}
            </h3>
          );
        }

        // ## Section header
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={i} className="pt-3 text-base font-semibold text-text-primary">
              {renderLine(trimmed.slice(3))}
            </h4>
          );
        }

        // Lines starting with medal emojis (priority queue)
        if (/^[🥇🥈🥉]/u.test(trimmed)) {
          return (
            <div key={i} className="prose-read font-medium text-text-primary">
              {renderLine(trimmed)}
            </div>
          );
        }

        // Lines starting with status emojis (positions, exits)
        if (["🟢", "🔵", "🟡", "🔴", "🔥", "⚠️", "🎉", "❌", "🚫", "✅"].some((prefix) => trimmed.startsWith(prefix))) {
          const isGreen = trimmed.startsWith("🟢") || trimmed.startsWith("🔵") || trimmed.startsWith("🎉") || trimmed.startsWith("🔥");
          const isRed = trimmed.startsWith("🔴") || trimmed.startsWith("❌") || trimmed.startsWith("⚠️");
          const dotColor = isGreen ? "var(--accent-green)" : isRed ? "var(--accent-red)" : "var(--text-muted)";
          return (
            <div key={i} className="prose-read flex items-start gap-2.5 text-text-secondary">
              <span className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dotColor }} />
              <span>{renderLine(trimmed)}</span>
            </div>
          );
        }

        // Regular text with emojis
        return (
          <div key={i} className="prose-read text-text-secondary">
            {renderLine(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

/** v2 section heading: serif title, optional sub, actions to the right. */
function SectionHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
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
        className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
      >
        <RefreshCw size={12} /> Retry
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
  const signedMoney = (v: number) => `${v >= 0 ? "+" : ""}${formatCurrency(v)}`;
  const exposure = markedExposure(positions);

  const watchRow = (w: IFlowWatchlistItem, idx: number, analysisOnly: boolean) => {
    const optColor =
      w.option_type === "CALL" || w.option_type === "C"
        ? "var(--accent-green)"
        : "var(--accent-red)";
    const pnl = premiumChange(w.current_premium, w.ref_premium, w.last_marked_at);
    const ref = typeof w.ref_premium === "number" ? w.ref_premium.toFixed(2) : w.ref_premium;
    return (
      <div
        key={w.id ?? idx}
        className="data-row flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 py-2.5"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <ScoreBadge score={w.score} />
          <SideIcon side={w.side} />
          <span className="ticker text-sm">{w.ticker}</span>
          <span className="num text-sm text-text-primary">${w.strike}</span>
          <span className="text-xs" style={{ color: optColor }}>{w.option_type}</span>
          <span className="num text-xs text-text-muted">exp {w.expiry}</span>
          <SourceTag source={w.source} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="num text-xs text-text-muted">ref ${ref}</span>
          {!analysisOnly && w.gate_price != null && (
            <span className="num text-xs font-semibold text-text-primary">
              gate ${typeof w.gate_price === "number" ? w.gate_price.toFixed(2) : w.gate_price}
            </span>
          )}
          {analysisOnly && <span className="text-xs text-text-muted">{w.block_reason ?? "Monitoring"}</span>}
          <MarkFreshness at={w.last_marked_at} />
          <PnlBadge pnl={pnl} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <QueryNotice queries={[summaryQuery, statusQuery, watchlistQuery, synthesisQuery]} label="Flow trader feeds" />
      {(scanMutation.isError || resetMutation.isError || synthesisMutation.isError) && <p role="alert" className="callout" style={{ "--callout": "var(--accent-red)" } as React.CSSProperties}>Trader action failed. Reload before retrying; a timed-out action may have completed.</p>}

      {statusQuery.isError && !iflowStatus && (
        <PaperQueryError label="Unable to load trader status." onRetry={() => void statusQuery.refetch()} />
      )}
      {watchlistQuery.isError && !iflowWatchlist && (
        <PaperQueryError label="Unable to load trader watchlist." onRetry={() => void watchlistQuery.refetch()} />
      )}
      {synthesisQuery.isError && !synthesis && (
        <PaperQueryError label="Unable to load trader synthesis." onRetry={() => void synthesisQuery.refetch()} />
      )}

      {/* Hero: book equity + return is the focal point; supporting stats beside it. */}
      <section className="space-y-4" aria-label="Flow trader book summary">
        <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <div className="text-sm text-text-muted">Flow trader equity</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="num text-3xl font-semibold tracking-tight text-text-primary">
                {formatCurrency(summary.total_value)}
              </span>
              <span className="num text-xl font-semibold" style={{ color: retColor }}>
                {ret >= 0 ? "+" : ""}
                {ret.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Unrealized{" "}
              <span className="num" style={{ color: changeColor(summary.unrealized_pnl) }}>
                {signedMoney(summary.unrealized_pnl)}
              </span>
            </div>
            {/* Action buttons */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => scanMutation.mutate()}
                disabled={scanMutation.isPending}
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-accent-blue px-3 text-sm font-medium text-bg-primary transition-all hover:brightness-110 disabled:opacity-40 md:min-h-8"
              >
                {scanMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                Scan and trade
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm("Reset flow paper trader to $10K?"))
                    resetMutation.mutate();
                }}
                className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm text-text-secondary transition-all hover:bg-bg-card-hover hover:text-accent-red md:min-h-8"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 min-[480px]:grid-cols-3">
            <Stat label="Cash" value={formatCurrency(summary.cash)} />
            <Stat label="In positions" value={formatCurrency(summary.positions_value)} />
            <Stat
              label="Realized"
              tone={summary.realized_pnl >= 0 ? "green" : "red"}
              value={signedMoney(summary.realized_pnl)}
            />
            <Stat label="Win rate" value={`${summary.win_rate.toFixed(0)}%`} sub={`${summary.closed_positions} closed`} />
            <Stat label="Open" value={summary.open_positions} />
            <Stat label="Watching" value={summary.watching} />
          </div>
        </div>

        {exposure.count > 0 && (
          <p className="callout max-w-[72ch]">
            Recorded valuation: <span className="num">{exposure.count}</span> positions (<span className="num">{formatCurrency(exposure.value)}</span> carried exposure) have stale, incomplete, unverified or unknown marks. Return is not a live quote.
          </p>
        )}

        {(macro || slots) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-3 text-sm text-text-muted">
            {macro && (
              <>
                <span className="inline-flex items-center gap-1 text-xs">
                  <Activity size={12} /> Macro
                </span>
                <span>
                  SPY <span className="num text-text-primary">${macro.spy_price.toFixed(2)}</span>{" "}
                  <span className={macro.spy_change_pct >= 0 ? "delta-up" : "delta-down"}>
                    {macro.spy_change_pct >= 0 ? "+" : ""}
                    {macro.spy_change_pct.toFixed(2)}%
                  </span>
                </span>
                <span>
                  VIX{" "}
                  <span
                    className="num"
                    style={{
                      color:
                        macro.vix >= 35
                          ? "var(--accent-red)"
                          : macro.vix >= 25
                            ? "var(--accent-orange)"
                            : "var(--text-primary)",
                    }}
                  >
                    {macro.vix.toFixed(1)}
                  </span>
                </span>
                {macro.is_safe ? (
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <Shield size={12} /> Safe
                  </span>
                ) : (
                  <Chip tone="red">
                    <Shield size={12} /> Unsafe
                  </Chip>
                )}
                <span>{macro.market_status}</span>
              </>
            )}
            {slots && (
              <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1 text-xs">
                  <Layers size={12} /> Slots
                </span>
                {([
                  ["Day trade", slots.day_trade],
                  ["Swing", slots.swing],
                ] as const).map(([label, sl]) => (
                  <span key={label} className="inline-flex items-center gap-1.5">
                    {label}
                    <span className="inline-flex items-center gap-1">
                      {Array.from({ length: sl.max }, (_, i) => (
                        <span
                          key={i}
                          className="h-2.5 w-2.5 rounded-sm border border-border"
                          style={{ background: i < sl.used ? "var(--accent-blue)" : "transparent" }}
                        />
                      ))}
                    </span>
                    <span className="num text-text-primary">
                      {sl.used}/{sl.max}
                    </span>
                  </span>
                ))}
              </span>
            )}
          </div>
        )}
      </section>

      {/* System Risk Status (drawdown, circuit breaker, slots, sector warnings) */}
      <SystemRiskStatus />

      {/* Open Positions */}
      {positions.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title={<>Open positions <span className="num text-base text-text-muted">{positions.length}</span></>}
            sub="Select a row for entry, targets and the analysis behind it."
          />
          <div className="card divide-y divide-border">
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
                  className="data-row cursor-pointer px-2 py-3.5"
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${pos.ticker} position`}
                  onClick={() => setExpandedPos(isExpanded ? null : pos.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setExpandedPos(isExpanded ? null : pos.id);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <SideIcon side={pos.side} />
                      <span className="ticker text-base">{pos.ticker}</span>
                      <span className="num text-sm text-text-primary">
                        ${pos.strike} {pos.option_type}
                      </span>
                      <span className="text-xs text-text-muted">
                        <span className="num">x{pos.contracts}</span>
                        {pos.scaled_out ? " (scaled)" : ""} · <span title={pos.slot_type === "day_trade" ? "Day trade slot" : "Swing slot"}>{slotLabel}</span>
                      </span>
                    </div>
                    <div className="flex items-end gap-6">
                      <div className="text-right text-xs">
                        <div className="text-text-muted">Cost</div>
                        <div className="num text-sm text-text-primary">
                          {formatCurrency(pos.cost_basis)}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-text-muted">Value</div>
                        <div className="num text-sm text-text-primary">
                          {pos.current_value == null ? "Unknown" : formatCurrency(pos.current_value)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-text-muted">P/L</div>
                        <div className="num text-lg font-semibold" style={{ color: pnlColor }}>
                          {signedPercent(pos.pnl_pct)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <MarkFreshness at={pos.last_marked_at ?? pos.updated_at} status={pos.mark_status} quality={pos.mark_quality} />

                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                        <div>
                          <div className="text-text-muted">Side</div>
                          <div className="font-semibold" style={{ color: sideColor }}>
                            {pos.side === "Bull" ? "Bullish" : "Bearish"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry</div>
                          <div className="num text-sm text-text-primary">${pos.entry_premium?.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Current</div>
                          <div className="num text-sm" style={{ color: pnlColor }}>
                            ${pos.current_premium?.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">P/L $</div>
                          <div className="num text-sm font-semibold" style={{ color: pnlColor }}>
                            {pnlDollars == null ? "Unknown" : `${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(0)}`}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-muted">Entry date</div>
                          <div className="num text-text-primary">{pos.entry_date}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Hold days</div>
                          <div className="num text-text-primary">{pos.hold_days ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Expiry</div>
                          <div className="num text-text-primary">{pos.expiry} ({expiryDte(pos.expiry, marketDate()) ?? "?"}d)</div>
                        </div>
                        <div>
                          <div className="text-text-muted">Slot</div>
                          <div className="text-text-primary">{pos.slot_type === "day_trade" ? "Day trade" : "Swing"}</div>
                        </div>
                      </div>

                      {pos.analysis && (
                        <p className="prose-read max-w-[72ch] text-text-secondary">
                          {pos.analysis}
                        </p>
                      )}

                      {!hasPolicy && <p className="text-xs text-text-muted">Exit policy unavailable</p>}
                      {hasPolicy && <div className="flex flex-wrap items-center gap-3 pt-1 text-xs num">
                        <span className="text-text-muted">Targets:</span>
                        <span className="text-accent-red">
                          Stop ${stopTarget.toFixed(2)} ({signedPercent(policy.stop_pct, 0)})
                        </span>
                        <span className="text-text-secondary">
                          TP1 ${tp1Target.toFixed(2)} ({signedPercent(policy.tp1_pct, 0)})
                        </span>
                        <span className="text-accent-green">
                          TP2 ${tp2Target.toFixed(2)} ({signedPercent(policy.tp2_pct, 0)})
                        </span>
                      </div>}

                      {hasPolicy && pos.current_premium != null && <div className="relative h-2 overflow-hidden rounded-full bg-border">
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
        </section>
      )}

      {/* WL-A / WL-B Separated Watchlist */}
      {(wla.length > 0 || wlb.length > 0) && (
        <section className="space-y-3">
          <SectionHead
            title={<>Watchlist <span className="num text-base text-text-muted">{wla.length + wlb.length}</span></>}
            sub="List A enters automatically at the gate price; list B is analysis only. P/L is the mark against the reference premium."
          />
          <div className="card space-y-6">
            {/* WL-A — Auto-Entry */}
            {wla.length > 0 && (
              <div>
                <h3 className="mb-1 inline-flex items-center gap-1.5 text-base font-semibold text-text-primary">
                  <Zap size={14} className="text-text-muted" />List A: auto-entry <span className="num text-sm font-normal text-text-muted">{wla.length}</span>
                </h3>
                <div className="divide-y divide-border">
                  {wla.map((w, idx) => watchRow(w, idx, false))}
                </div>
              </div>
            )}

            {/* WL-B — Analysis Only */}
            {wlb.length > 0 && (
              <div className={wla.length > 0 ? "border-t border-border pt-4" : undefined}>
                <h3 className="mb-1 inline-flex items-center gap-1.5 text-base font-semibold text-text-primary">
                  <Eye size={14} className="text-text-muted" />List B: analysis only <span className="num text-sm font-normal text-text-muted">{wlb.length}</span>
                </h3>
                <div className="divide-y divide-border">
                  {wlb.map((w, idx) => watchRow(w, idx, true))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Trade Decision Log — closed positions with full scoring rationale + exit reason */}
      <details className="group/log">
        <summary className="flex cursor-pointer list-none items-center gap-2 marker:content-none">
          <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-open/log:rotate-90" aria-hidden="true" />
          <span className="section-title">Closed trades and decision log</span>
        </summary>
        <div className="mt-3 text-xs"><TradeDecisionLog /></div>
      </details>

      {/* Missed Opportunities — WL-A unfilled + WL-B high-score with what-if P/L */}
      <details className="group/missed">
        <summary className="flex cursor-pointer list-none items-center gap-2 marker:content-none">
          <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-open/missed:rotate-90" aria-hidden="true" />
          <span className="section-title">Missed opportunities</span>
        </summary>
        <div className="mt-3 text-xs"><MissedOpportunities /></div>
      </details>

      {/* Synthesis Report + trigger */}
      <section className="space-y-3">
        <SectionHead
          title={<>Daily synthesis {synthesis?.date && <span className="num text-sm text-text-muted">{synthesis.date}</span>}</>}
          sub="Claude's read of today's flow, positions and research."
          actions={
            <button
              onClick={() => synthesisMutation.mutate()}
              disabled={synthesisMutation.isPending}
              type="button"
              className="flex min-h-11 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-40 md:min-h-8"
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
        />
        {synthesisMutation.isPending && (
          <div className="flex items-center gap-2 py-3 text-sm text-text-secondary">
            <Loader2 size={14} className="animate-spin" />
            Claude is analyzing flow data + research... this takes 30-60 seconds
          </div>
        )}
        {synthesis?.report ? (
          <SynthesisReport report={synthesis.report} />
        ) : (
          <p className="py-3 text-sm text-text-muted">
            No synthesis report yet — click Generate to create one
          </p>
        )}
      </section>

      {/* Empty state */}
      {positions.length === 0 && wla.length === 0 && wlb.length === 0 && (
        <p className="prose-read py-8 text-center text-text-muted">
          Click <strong>Scan and trade</strong> to analyze flow entries and start
          watching for dip-buy opportunities.
        </p>
      )}
    </div>
  );
}
