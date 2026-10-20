import type { FlowPick } from "../lib/types";
import { formatCurrency, formatPercentRaw, changeColor } from "../lib/utils";
import { CONVICTION_COLORS } from "../lib/constants";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Stat } from "./Glass";

interface PickCardProps {
  pick: FlowPick;
  onClose?: (id: number) => void;
}

export function PickCard({ pick, onClose }: PickCardProps) {
  const dirIcon =
    pick.direction === "bullish" ? (
      <TrendingUp size={14} />
    ) : (
      <TrendingDown size={14} />
    );
  const dirColor =
    pick.direction === "bullish"
      ? "var(--accent-green)"
      : "var(--accent-red)";
  const convictionColor =
    CONVICTION_COLORS[pick.conviction] || "var(--text-secondary)";
  const pnlColor = changeColor(pick.option_pnl_pct ?? 0);
  const strike = pick.strike ?? 0;
  const volOi = pick.vol_oi_ratio ?? 0;
  const askPct = pick.ask_pct ?? 0;
  const optEntry = pick.option_entry_premium ?? 0;
  const optCurrent = pick.option_current_premium ?? 0;
  const optPnl = pick.option_pnl_pct ?? 0;

  return (
    <div className="card flex flex-col gap-4">
      {/* Header: ticker + direction + conviction */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="ticker text-xl leading-none">{pick.ticker}</span>
            <span
              className="flex items-center gap-1 text-sm font-medium capitalize"
              style={{ color: dirColor }}
            >
              {dirIcon}
              {pick.direction}
            </span>
          </div>
          <div className="num mt-1.5 truncate text-sm text-text-secondary">
            ${strike} {pick.option_type} {pick.expiry}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: convictionColor }} />
            {String(pick.conviction).toLowerCase()} conviction
          </span>
          {pick.status === "open" && onClose && (
            <button
              onClick={() => onClose(pick.id)}
              className="rounded-md px-1.5 py-0.5 text-xs text-text-muted transition-colors hover:bg-bg-card-hover hover:text-accent-red"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Option P/L — the number the card is about */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Entry" value={formatCurrency(optEntry)} />
        <Stat label="Current" value={formatCurrency(optCurrent)} />
        <Stat
          label="P/L"
          value={<span style={{ color: pnlColor }}>{formatPercentRaw(optPnl)}</span>}
        />
      </div>

      {/* Flow quality */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>Flow size <span className="num text-text-primary">{pick.flow_size || "—"}</span></span>
        <span>Vol/OI <span className="num text-text-primary">{volOi > 0 ? `${volOi.toFixed(1)}x` : "—"}</span></span>
        <span>Ask <span className="num text-text-primary">{askPct > 0 ? `${askPct.toFixed(0)}%` : "—"}</span></span>
      </div>

      {/* Rationale */}
      {pick.rationale && (
        <p className="text-sm text-text-secondary leading-relaxed border-t border-border pt-3">
          {pick.rationale}
        </p>
      )}
    </div>
  );
}
