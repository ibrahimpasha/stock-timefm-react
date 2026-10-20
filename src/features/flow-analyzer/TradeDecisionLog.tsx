import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronRight, Target,
  AlertOctagon, Activity, RefreshCw,
} from "lucide-react";
import { Segmented, Stat } from "../../components/Glass";

interface ClosedPosition {
  ticker: string;
  option_type: string;
  strike: number;
  expiry: string;
  entry_price: number;
  exit_price: number;
  pnl_pct: number;
  contracts: number;
  cost: number;
  score: number;
  dte: number;
  filled_at: string;
  closed_at: string;
  exit_reason: string;
  source?: string;
  reasons?: string[];
  flags?: string[];
  ml_label?: string;
  gex_regime?: string;
  accum_label?: string;
  trim_level?: number;
  is_lotto?: boolean;
  build_phase?: boolean;
  build_fills?: { price: number; contracts: number; at: string }[];
}

function useClosedTrades(limit: number = 50) {
  return useQuery<ClosedPosition[]>({
    queryKey: ["iflow-trader-closed", limit],
    queryFn: () => apiClient.get(`/iflow-trader/positions?status=closed&limit=${limit}`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/* Color only where the exit is a state worth noticing (stops red, forced
 * exits orange); profit exits stay neutral — the P/L number carries the sign. */
function exitReasonLabel(reason: string): { label: string; color: string; Icon: React.ElementType } {
  const r = (reason || "").toUpperCase();
  const neutral = "var(--text-secondary)";
  if (r.includes("TRIM1")) return { label: "Trim 1 (+25%)", color: neutral, Icon: Target };
  if (r.includes("TRIM2")) return { label: "Trim 2 (risk-free)", color: neutral, Icon: Target };
  if (r.includes("TRIM3")) return { label: "Trim 3 (+100%)", color: neutral, Icon: Target };
  if (r.includes("RUNNER") || r.includes("TRAIL")) return { label: "Runner trail", color: neutral, Icon: TrendingUp };
  if (r.includes("STOP") && !r.includes("UNDERLYING")) return { label: "Stop loss", color: "var(--accent-red)", Icon: AlertOctagon };
  if (r.includes("UNDERLYING")) return { label: "Underlying stop", color: "var(--accent-red)", Icon: AlertOctagon };
  if (r.includes("CIRCUIT")) return { label: "Circuit breaker", color: "var(--accent-orange)", Icon: AlertOctagon };
  if (r.includes("EVICT")) return { label: "Evicted", color: "var(--accent-orange)", Icon: AlertOctagon };
  if (r.includes("LOTTO_TP")) return { label: r, color: neutral, Icon: Target };
  if (r.includes("TP")) return { label: r, color: neutral, Icon: Target };
  return { label: reason || "Closed", color: "var(--text-muted)", Icon: Activity };
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch { return iso.slice(5, 16); }
}

function holdDuration(entryIso: string, exitIso: string): string {
  if (!entryIso || !exitIso) return "?";
  try {
    const ms = new Date(exitIso).getTime() - new Date(entryIso).getTime();
    const hours = ms / 3600000;
    if (hours < 1) return `${Math.round(ms / 60000)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
  } catch { return "?"; }
}

function ReasonChips({ reasons, flags }: { reasons?: string[]; flags?: string[] }) {
  // Plain text list; only blocking/rejecting flags get color (red).
  const items: { text: string; color: string }[] = [];
  for (const r of reasons || []) items.push({ text: r, color: "var(--text-secondary)" });
  for (const f of flags || []) {
    const blocked = f.includes("BLOCK") || f.includes("REJECT");
    items.push({ text: f, color: blocked ? "var(--accent-red)" : "var(--text-muted)" });
  }
  if (items.length === 0) return <span className="text-xs text-text-muted">No rationale stored</span>;
  return (
    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
      {items.map((it, i) => (
        <span key={i} className="text-xs num" style={{ color: it.color }}>
          {it.text}
        </span>
      ))}
    </div>
  );
}

function TradeRow({ pos }: { pos: ClosedPosition }) {
  const [expanded, setExpanded] = useState(false);
  const exitInfo = exitReasonLabel(pos.exit_reason || "");
  const ExitIcon = exitInfo.Icon;
  const isWin = pos.pnl_pct > 0;
  const sideBull = pos.option_type === "CALL";
  const SideIcon = sideBull ? TrendingUp : TrendingDown;
  const sideColor = sideBull ? "var(--accent-green)" : "var(--accent-red)";
  const pnlColor = isWin ? "var(--accent-green)" : "var(--accent-red)";

  return (
    <div>
      <div
        className="data-row flex cursor-pointer items-center gap-3 px-2 py-2.5"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {expanded ? <ChevronDown size={14} className="shrink-0 text-text-muted" /> : <ChevronRight size={14} className="shrink-0 text-text-muted" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <SideIcon size={13} className="shrink-0 self-center" style={{ color: sideColor }} />
            <span className="ticker text-sm">{pos.ticker}</span>
            <span className="num truncate text-xs text-text-secondary">
              ${pos.strike} {pos.option_type} {pos.expiry} <span className="text-text-muted">×{pos.contracts}</span>
            </span>
            {pos.is_lotto && <span className="tag">lotto</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: exitInfo.color }}>
            <ExitIcon size={12} />
            {exitInfo.label}
            <span className="num ml-2 text-text-muted">{fmtDate(pos.closed_at)}</span>
          </div>
        </div>
        <span className={`w-20 shrink-0 text-right text-lg font-semibold ${isWin ? "delta-up" : "delta-down"}`}>
          {pos.pnl_pct >= 0 ? "+" : ""}{pos.pnl_pct.toFixed(1)}%
        </span>
      </div>
      {expanded && (
        <div className="space-y-4 pb-4 pl-9 pr-2 pt-1 text-xs">
          {/* Trade lifecycle */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            <div>
              <div className="text-text-muted">Entry</div>
              <div className="num text-sm text-text-primary">${pos.entry_price?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">Exit</div>
              <div className="num text-sm" style={{ color: pnlColor }}>${pos.exit_price?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">Hold</div>
              <div className="num text-sm text-text-primary">{holdDuration(pos.filled_at, pos.closed_at)}</div>
            </div>
            <div>
              <div className="text-text-muted">Score</div>
              <div className="num text-sm text-text-primary">{pos.score?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">DTE at fill</div>
              <div className="num text-sm text-text-primary">{pos.dte}</div>
            </div>
            <div>
              <div className="text-text-muted">Cost basis</div>
              <div className="num text-sm text-text-primary">${pos.cost?.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-text-muted">Trim level</div>
              <div className="num text-sm text-text-primary">{pos.trim_level ?? 0}</div>
            </div>
            <div>
              <div className="text-text-muted">Filled at</div>
              <div className="num text-sm text-text-primary">{fmtDate(pos.filled_at)}</div>
            </div>
          </div>

          {/* Build fills (Ab-style) */}
          {pos.build_fills && pos.build_fills.length > 1 && (
            <div>
              <div className="text-text-muted mb-1">Build fills <span className="num">{pos.build_fills.length}</span></div>
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap num text-xs text-text-secondary">
                {pos.build_fills.map((f, i) => (
                  <span key={i}>
                    {fmtDate(f.at)} {f.contracts}× @ ${f.price?.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scoring breakdown */}
          <div>
            <div className="text-text-muted mb-1">Why entered (scoring rationale)</div>
            <ReasonChips reasons={pos.reasons} flags={pos.flags} />
            <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
              {pos.ml_label && <span>ML: <span className="text-text-secondary">{pos.ml_label}</span></span>}
              {pos.gex_regime && pos.gex_regime !== "unknown" && (
                <span>GEX: <span className="text-text-secondary">{pos.gex_regime}</span></span>
              )}
              {pos.accum_label && (
                <span>Accum: <span className="text-text-secondary">{pos.accum_label}</span></span>
              )}
            </div>
          </div>

          {/* Why exited */}
          <div>
            <div className="text-text-muted mb-1">Why exited</div>
            <span className="num text-sm text-text-primary">{pos.exit_reason}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TradeDecisionLog() {
  const [filter, setFilter] = useState<"all" | "wins" | "losses">("all");
  const { data, isLoading, isError, refetch } = useClosedTrades(50);

  if (isLoading) {
    return (
      <div className="text-xs text-text-muted py-8 text-center">
        <Activity size={14} className="inline animate-pulse mr-2" />
        Loading trade log...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-accent-red">
        <AlertOctagon size={14} />
        <span>Unable to load trade history.</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  const filtered = data.filter((p) => {
    if (filter === "wins") return p.pnl_pct > 0;
    if (filter === "losses") return p.pnl_pct <= 0;
    return true;
  });

  const wins = data.filter((p) => p.pnl_pct > 0).length;
  const losses = data.filter((p) => p.pnl_pct <= 0).length;
  const totalPnlPct = data.length > 0 ? data.reduce((s, p) => s + p.pnl_pct, 0) / data.length : 0;
  const winRate = data.length > 0 ? (wins / data.length) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Filter + stats (the parent disclosure already titles this section) */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-2 gap-8">
          <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} tone={winRate >= 50 ? "green" : "red"} />
          <Stat label="Avg P/L" value={`${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%`} tone={totalPnlPct >= 0 ? "green" : "red"} />
        </div>
        <Segmented
          ariaLabel="Filter trades"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: <>All <span className="num">{data.length}</span></> },
            { value: "wins", label: <>Wins <span className="num">{wins}</span></> },
            { value: "losses", label: <>Losses <span className="num">{losses}</span></> },
          ]}
        />
      </div>

      {/* Trade rows */}
      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-text-muted">
          No trades match the filter
        </div>
      ) : (
        <div className="divide-y divide-border">
          {filtered.map((pos, i) => (
            <TradeRow key={`${pos.ticker}_${pos.closed_at}_${i}`} pos={pos} />
          ))}
        </div>
      )}
    </div>
  );
}
