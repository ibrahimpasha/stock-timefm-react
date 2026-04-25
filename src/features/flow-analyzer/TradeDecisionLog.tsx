import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronRight, Target,
  AlertOctagon, Activity, History,
} from "lucide-react";

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

function exitReasonLabel(reason: string): { label: string; color: string; bg: string; Icon: React.ElementType } {
  const r = (reason || "").toUpperCase();
  if (r.includes("TRIM1")) return { label: "TRIM 1 (+25%)", color: "var(--accent-cyan)", bg: "rgba(88,166,255,0.12)", Icon: Target };
  if (r.includes("TRIM2")) return { label: "TRIM 2 (RISK-FREE)", color: "var(--accent-green)", bg: "rgba(63,185,80,0.15)", Icon: Target };
  if (r.includes("TRIM3")) return { label: "TRIM 3 (+100%)", color: "var(--accent-green)", bg: "rgba(63,185,80,0.15)", Icon: Target };
  if (r.includes("RUNNER") || r.includes("TRAIL")) return { label: "RUNNER TRAIL", color: "var(--accent-green)", bg: "rgba(63,185,80,0.15)", Icon: TrendingUp };
  if (r.includes("STOP") && !r.includes("UNDERLYING")) return { label: "STOP LOSS", color: "var(--accent-red)", bg: "rgba(248,81,73,0.12)", Icon: AlertOctagon };
  if (r.includes("UNDERLYING")) return { label: "UNDERLYING STOP", color: "var(--accent-red)", bg: "rgba(248,81,73,0.12)", Icon: AlertOctagon };
  if (r.includes("CIRCUIT")) return { label: "CIRCUIT BREAKER", color: "var(--accent-orange)", bg: "rgba(227,127,46,0.15)", Icon: AlertOctagon };
  if (r.includes("EVICT")) return { label: "EVICTED", color: "var(--accent-orange)", bg: "rgba(227,127,46,0.15)", Icon: AlertOctagon };
  if (r.includes("LOTTO_TP")) return { label: r, color: "var(--accent-orange)", bg: "rgba(227,127,46,0.15)", Icon: Target };
  if (r.includes("TP")) return { label: r, color: "var(--accent-green)", bg: "rgba(63,185,80,0.15)", Icon: Target };
  return { label: reason || "CLOSED", color: "var(--text-muted)", bg: "rgba(48,54,61,0.15)", Icon: Activity };
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
  const items: { text: string; color: string }[] = [];
  for (const r of reasons || []) {
    let color = "var(--text-muted)";
    if (r.includes("STRONG") || r.includes("MEGA") || r.includes("ESCALATING")) color = "var(--accent-green)";
    else if (r.includes("EXTREME_VOI") || r.includes("CONCENTRATED")) color = "var(--accent-cyan)";
    else if (r.includes("conflict") || r.includes("BATTLE")) color = "var(--accent-orange)";
    items.push({ text: r, color });
  }
  for (const f of flags || []) {
    let color = "var(--accent-orange)";
    if (f.includes("BLOCK") || f.includes("REJECT")) color = "var(--accent-red)";
    if (f.includes("EXTREME_VOI")) color = "var(--accent-green)";
    items.push({ text: f, color });
  }
  if (items.length === 0) return <span className="text-xs text-text-muted italic">no rationale stored</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {items.map((it, i) => (
        <span key={i} className="text-xs px-1.5 py-0.5 rounded font-mono"
          style={{ color: it.color, background: `${it.color}12`, border: `1px solid ${it.color}30` }}>
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
    <div className="border border-border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-bg-card-hover"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={11} className="text-text-muted" /> : <ChevronRight size={11} className="text-text-muted" />}
        <SideIcon size={11} style={{ color: sideColor }} />
        <span className="font-mono font-bold text-text-primary w-12">{pos.ticker}</span>
        <span className="font-mono text-text-primary">${pos.strike} {pos.option_type}</span>
        {pos.is_lotto && <span className="text-[9px] font-mono text-accent-orange">LOTTO</span>}
        <span className="text-text-muted">×{pos.contracts}</span>
        <span className="text-text-muted">{pos.expiry}</span>
        <span
          className="ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
          style={{ color: exitInfo.color, background: exitInfo.bg, border: `1px solid ${exitInfo.color}40` }}
        >
          <ExitIcon size={10} />
          {exitInfo.label}
        </span>
        <span className="font-mono font-bold w-16 text-right" style={{ color: pnlColor }}>
          {pos.pnl_pct >= 0 ? "+" : ""}{pos.pnl_pct.toFixed(1)}%
        </span>
        <span className="text-text-muted font-mono text-[10px] w-20 text-right">
          {fmtDate(pos.closed_at)}
        </span>
      </div>
      {expanded && (
        <div className="px-4 py-3 border-t border-border bg-bg-primary/30 space-y-2 text-xs">
          {/* Trade lifecycle */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-text-muted">Entry</div>
              <div className="font-mono text-text-primary">${pos.entry_price?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">Exit</div>
              <div className="font-mono" style={{ color: pnlColor }}>${pos.exit_price?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">Hold</div>
              <div className="font-mono text-text-primary">{holdDuration(pos.filled_at, pos.closed_at)}</div>
            </div>
            <div>
              <div className="text-text-muted">Score</div>
              <div className="font-mono text-text-primary">{pos.score?.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-text-muted">DTE at fill</div>
              <div className="font-mono text-text-primary">{pos.dte}</div>
            </div>
            <div>
              <div className="text-text-muted">Cost basis</div>
              <div className="font-mono text-text-primary">${pos.cost?.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-text-muted">Trim level</div>
              <div className="font-mono text-text-primary">{pos.trim_level ?? 0}</div>
            </div>
            <div>
              <div className="text-text-muted">Filled at</div>
              <div className="font-mono text-text-primary text-[10px]">{fmtDate(pos.filled_at)}</div>
            </div>
          </div>

          {/* Build fills (Ab-style) */}
          {pos.build_fills && pos.build_fills.length > 1 && (
            <div>
              <div className="text-text-muted mb-1">Build Fills ({pos.build_fills.length})</div>
              <div className="flex items-center gap-2 flex-wrap font-mono text-[10px] text-text-secondary">
                {pos.build_fills.map((f, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded" style={{ background: "rgba(48,54,61,0.3)" }}>
                    {fmtDate(f.at)} {f.contracts}× @ ${f.price?.toFixed(2)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scoring breakdown */}
          <div>
            <div className="text-text-muted mb-1">Why entered (scoring rationale):</div>
            <ReasonChips reasons={pos.reasons} flags={pos.flags} />
            <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted font-mono">
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
            <div className="text-text-muted mb-1">Why exited:</div>
            <span className="text-text-primary font-mono">{pos.exit_reason}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TradeDecisionLog() {
  const [filter, setFilter] = useState<"all" | "wins" | "losses">("all");
  const { data, isLoading } = useClosedTrades(50);

  if (isLoading || !data) {
    return (
      <div className="text-xs text-text-muted py-8 text-center">
        <Activity size={14} className="inline animate-pulse mr-2" />
        Loading trade log...
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
    <div className="space-y-3">
      {/* Header stats */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider flex items-center gap-1.5">
          <History size={12} /> Trade Decision Log ({data.length})
        </h4>
        <div className="flex items-center gap-3 text-xs">
          <span>
            <span className="text-text-muted">Win rate:</span>{" "}
            <span className="font-mono font-bold" style={{ color: winRate >= 50 ? "var(--accent-green)" : "var(--accent-red)" }}>
              {winRate.toFixed(0)}%
            </span>
          </span>
          <span>
            <span className="text-text-muted">Avg P/L:</span>{" "}
            <span className="font-mono font-bold" style={{ color: totalPnlPct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%
            </span>
          </span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-1.5">
        {([
          ["all", `All (${data.length})`, "var(--text-secondary)"],
          ["wins", `Wins (${wins})`, "var(--accent-green)"],
          ["losses", `Losses (${losses})`, "var(--accent-red)"],
        ] as const).map(([id, label, color]) => (
          <button
            key={id}
            onClick={() => setFilter(id as typeof filter)}
            className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
            style={{
              background: filter === id ? `${color}15` : "transparent",
              color: filter === id ? color : "var(--text-muted)",
              border: `1px solid ${filter === id ? `${color}40` : "var(--border)"}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Trade rows */}
      {filtered.length === 0 ? (
        <div className="text-xs text-text-muted py-8 text-center">
          No trades match the filter
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((pos, i) => (
            <TradeRow key={`${pos.ticker}_${pos.closed_at}_${i}`} pos={pos} />
          ))}
        </div>
      )}
    </div>
  );
}
