import { useState, useMemo } from "react";
import { SystemRiskStatus } from "./SystemRiskStatus";
import { TradeDecisionLog } from "./TradeDecisionLog";
import { MissedOpportunities } from "./MissedOpportunities";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { formatCurrency, changeColor } from "../../lib/utils";
import { Chip } from "../../components/Glass";
import { TileGrid, Tile, Kpi, BarRow, Gauge, CockpitButton, toneOf } from "../../components/Cockpit";
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
  const positions = summary.positions || [];
  const signedMoney = (v: number) => `${v >= 0 ? "+" : ""}${formatCurrency(v)}`;
  const exposure = markedExposure(positions);

  const deployedPct = summary.total_value > 0 ? (summary.positions_value / summary.total_value) * 100 : 0;
  const byTicker = new Map<string, number>();
  let callValue = 0;
  let putValue = 0;
  for (const p of positions) {
    const v = p.current_value ?? p.cost_basis;
    byTicker.set(p.ticker, (byTicker.get(p.ticker) ?? 0) + v);
    if (p.option_type === "CALL" || p.option_type === "C") callValue += v;
    else putValue += v;
  }
  const alloc = [...byTicker.entries()].sort((a, b) => b[1] - a[1]);
  const allocMax = alloc[0]?.[1] ?? 0;
  const optValue = callValue + putValue;
  const pnlMax = Math.max(1, ...positions.map((p) => Math.abs(p.pnl_pct ?? 0)));

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
        className="data-row flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 py-2"
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
    <div className="space-y-4">
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

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <CockpitButton primary onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
          {scanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Scan and trade
        </CockpitButton>
        <CockpitButton
          onClick={() => {
            if (confirm("Reset flow paper trader to $10K?"))
              resetMutation.mutate();
          }}
        >
          <RotateCcw size={14} />
          Reset
        </CockpitButton>
      </div>

      <TileGrid>
        {/* KPI strip */}
        <Tile span={3}>
          <Kpi
            size="xl"
            label="Flow trader equity"
            value={formatCurrency(summary.total_value, 0)}
            delta={`${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`}
            tone={toneOf(ret)}
            sub={<>cash <span className="num">{formatCurrency(summary.cash, 0)}</span></>}
          />
        </Tile>
        <Tile span={3}>
          <Kpi
            label="Unrealized P/L"
            value={<span style={{ color: changeColor(summary.unrealized_pnl) }}>{signedMoney(summary.unrealized_pnl)}</span>}
            sub={<>realized <span className="num" style={{ color: changeColor(summary.realized_pnl) }}>{signedMoney(summary.realized_pnl)}</span></>}
          />
        </Tile>
        <Tile span={3}>
          <Kpi
            label="Deployed"
            value={`${deployedPct.toFixed(0)}%`}
            sub={<><span className="num">{formatCurrency(summary.positions_value, 0)}</span> in positions</>}
          />
          <div className="h-1.5 rounded-full" style={{ background: "var(--track)" }} aria-hidden="true">
            <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.min(100, deployedPct)}%` }} />
          </div>
        </Tile>
        <Tile span={3}>
          <Kpi
            label="Open positions"
            value={summary.open_positions}
            sub={<><span className="num">{summary.watching}</span> watching · win <span className="num">{summary.win_rate.toFixed(0)}%</span> of <span className="num">{summary.closed_positions}</span></>}
          />
        </Tile>

        {exposure.count > 0 && (
          <p className="callout max-w-[90ch] lg:col-span-12">
            Recorded valuation: <span className="num">{exposure.count}</span> positions (<span className="num">{formatCurrency(exposure.value)}</span> carried exposure) have stale, incomplete, unverified or unknown marks. Return is not a live quote.
          </p>
        )}

        {/* Open positions (primary) */}
        <Tile
          span={8}
          title={<>Open positions <span className="num font-normal text-text-muted">{positions.length}</span></>}
          meta="Select a row for entry, targets and the analysis behind it"
        >
          {positions.length === 0 ? (
            <p className="py-6 text-sm text-text-muted">No open positions.</p>
          ) : (
            <div className="divide-y divide-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_9rem] gap-3 px-2 pb-2 text-xs text-text-muted md:grid">
                <span>Contract</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Value</span>
                <span className="text-right">P/L</span>
              </div>
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
              const barPct = pos.pnl_pct ? Math.max(4, (Math.abs(pos.pnl_pct) / pnlMax) * 100) : 0;

              return (
                <div
                  key={pos.id}
                  className="data-row cursor-pointer px-2 py-2.5"
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
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem_9rem]">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                      <SideIcon side={pos.side} />
                      <span className="ticker text-sm">{pos.ticker}</span>
                      <span className="num text-sm text-text-primary">
                        ${pos.strike} {pos.option_type}
                      </span>
                      <span className="text-xs text-text-muted">
                        <span className="num">x{pos.contracts}</span>
                        {pos.scaled_out ? " (scaled)" : ""} · <span title={pos.slot_type === "day_trade" ? "Day trade slot" : "Swing slot"}>{slotLabel}</span>
                      </span>
                      <MarkFreshness at={pos.last_marked_at ?? pos.updated_at} status={pos.mark_status} quality={pos.mark_quality} />
                    </div>
                    <span className="num hidden text-right text-sm text-text-secondary md:block">{formatCurrency(pos.cost_basis, 0)}</span>
                    <span className="num hidden text-right text-sm text-text-primary md:block">
                      {pos.current_value == null ? "Unknown" : formatCurrency(pos.current_value, 0)}
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-2 w-12 rounded-[2px]" style={{ background: "var(--track)" }} aria-hidden="true">
                        <span className="block h-2 rounded-[2px]" style={{ width: `${barPct}%`, background: pnlColor }} />
                      </span>
                      <span className="num w-16 text-right text-sm font-semibold" style={{ color: pnlColor }}>
                        {signedPercent(pos.pnl_pct)}
                      </span>
                    </span>
                  </div>

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
                        <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">
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
          )}
        </Tile>

        {/* Market + allocation column */}
        <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-4">
          <Tile title="Market" meta={macro?.market_status}>
            {macro ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <Kpi
                    size="md"
                    label="SPY"
                    value={`$${macro.spy_price.toFixed(2)}`}
                    delta={`${macro.spy_change_pct >= 0 ? "+" : ""}${macro.spy_change_pct.toFixed(2)}%`}
                    tone={toneOf(macro.spy_change_pct)}
                  />
                  {macro.is_safe ? (
                    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                      <Shield size={12} /> Safe
                    </span>
                  ) : (
                    <Chip tone="red">
                      <Shield size={12} /> Unsafe
                    </Chip>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                    <Activity size={12} /> VIX <span className="num text-text-primary">{macro.vix.toFixed(1)}</span>
                  </span>
                  <Gauge value={macro.vix} min={10} max={40} ticks={["10", "20", "30", "40+"]} />
                </div>
              </>
            ) : (
              <p className="text-sm text-text-muted">Macro unavailable.</p>
            )}
            {slots && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="inline-flex items-center gap-1 text-xs text-text-muted">
                  <Layers size={12} /> Slots
                </span>
                {([
                  ["Day trade", slots.day_trade],
                  ["Swing", slots.swing],
                ] as const).map(([label, sl]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                    <span>{label}</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        {Array.from({ length: sl.max }, (_, i) => (
                          <span
                            key={i}
                            className="h-3 w-3 rounded-[3px]"
                            style={{ background: i < sl.used ? "var(--accent)" : "var(--track)" }}
                          />
                        ))}
                      </span>
                      <span className="num text-text-primary">
                        {sl.used}/{sl.max}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Tile>

          <Tile title="Exposure" meta="carried value">
            {alloc.length === 0 ? (
              <p className="text-sm text-text-muted">No open positions.</p>
            ) : (
              <>
                {optValue > 0 && (
                  <div className="flex flex-col gap-1.5 pb-1">
                    <div className="flex h-3 overflow-hidden rounded-[3px]" style={{ background: "var(--track)" }} aria-hidden="true">
                      <span style={{ width: `${(callValue / optValue) * 100}%`, background: "var(--accent-green)" }} />
                      <span style={{ width: `${(putValue / optValue) * 100}%`, background: "var(--accent-red)" }} />
                    </div>
                    <div className="num flex justify-between text-xs">
                      <span className="text-accent-green">Calls {formatCurrency(callValue, 0)}</span>
                      <span className="text-accent-red">Puts {formatCurrency(putValue, 0)}</span>
                    </div>
                  </div>
                )}
                {alloc.map(([t, v]) => (
                  <BarRow
                    key={t}
                    label={t}
                    value={v}
                    max={allocMax}
                    tone="info"
                    display={formatCurrency(v, 0)}
                    trailing={summary.total_value > 0 ? `${((v / summary.total_value) * 100).toFixed(0)}%` : "—"}
                  />
                ))}
              </>
            )}
          </Tile>
        </div>

        {/* System Risk Status (drawdown, circuit breaker, slots, sector warnings) */}
        <div className="min-w-0 lg:col-span-12">
          <SystemRiskStatus />
        </div>

        {/* WL-A / WL-B Separated Watchlist */}
        {(wla.length > 0 || wlb.length > 0) && (
          <Tile
            span={12}
            title={<>Watchlist <span className="num font-normal text-text-muted">{wla.length + wlb.length}</span></>}
            meta="List A enters at the gate price; list B is analysis only. P/L is the mark against the reference premium."
          >
            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Zap size={14} className="text-accent" />List A: auto-entry <span className="num font-normal text-text-muted">{wla.length}</span>
                </h3>
                <div className="divide-y divide-border">
                  {wla.length ? wla.map((w, idx) => watchRow(w, idx, false)) : <p className="py-2 text-sm text-text-muted">Empty.</p>}
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                  <Eye size={14} className="text-text-muted" />List B: analysis only <span className="num font-normal text-text-muted">{wlb.length}</span>
                </h3>
                <div className="divide-y divide-border">
                  {wlb.length ? wlb.map((w, idx) => watchRow(w, idx, true)) : <p className="py-2 text-sm text-text-muted">Empty.</p>}
                </div>
              </div>
            </div>
          </Tile>
        )}

        {/* Trade Decision Log — closed positions with full scoring rationale + exit reason */}
        <details className="group/log min-w-0 lg:col-span-12">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-bg-card px-4 text-[0.9375rem] font-semibold text-text-primary marker:content-none hover:bg-bg-card-hover">
            <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-open/log:rotate-90" aria-hidden="true" />
            Closed trades and decision log
          </summary>
          <div className="mt-3 text-xs"><TradeDecisionLog /></div>
        </details>

        {/* Missed Opportunities — WL-A unfilled + WL-B high-score with what-if P/L */}
        <details className="group/missed min-w-0 lg:col-span-12">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-bg-card px-4 text-[0.9375rem] font-semibold text-text-primary marker:content-none hover:bg-bg-card-hover">
            <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-open/missed:rotate-90" aria-hidden="true" />
            Missed opportunities
          </summary>
          <div className="mt-3 text-xs"><MissedOpportunities /></div>
        </details>

        {/* Synthesis Report + trigger (long-form reading keeps the serif) */}
        <Tile
          span={12}
          title={<>Daily synthesis {synthesis?.date && <span className="num font-normal text-text-muted">{synthesis.date}</span>}</>}
          meta="Claude's read of today's flow, positions and research"
          actions={
            <CockpitButton onClick={() => synthesisMutation.mutate()} disabled={synthesisMutation.isPending}>
              {synthesisMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Generating with Claude...
                </>
              ) : (
                <>
                  <RefreshCw size={14} />
                  Generate
                </>
              )}
            </CockpitButton>
          }
        >
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
        </Tile>
      </TileGrid>

      {/* Empty state */}
      {positions.length === 0 && wla.length === 0 && wlb.length === 0 && (
        <p className="py-8 text-center text-sm text-text-muted">
          Click <strong>Scan and trade</strong> to analyze flow entries and start
          watching for dip-buy opportunities.
        </p>
      )}
    </div>
  );
}
