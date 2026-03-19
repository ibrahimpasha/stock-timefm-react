import type { FlowPick } from "../lib/types";
import { formatCurrency, formatPercentRaw, changeColor } from "../lib/utils";
import { CONVICTION_COLORS } from "../lib/constants";
import { TrendingUp, TrendingDown } from "lucide-react";

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
  const pnlColor = changeColor(pick.option_pnl_pct);

  return (
    <div className="card flex flex-col gap-3">
      {/* Header: ticker + direction + conviction */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-text-primary text-base">
            {pick.ticker}
          </span>
          <span
            className="flex items-center gap-1 text-xs font-semibold uppercase px-2 py-0.5 rounded-full"
            style={{ color: dirColor, background: `${dirColor}20` }}
          >
            {dirIcon}
            {pick.direction}
          </span>
          <span
            className="text-xs font-semibold uppercase px-2 py-0.5 rounded-full"
            style={{
              color: convictionColor,
              background: `${convictionColor}20`,
            }}
          >
            {pick.conviction}
          </span>
        </div>
        {pick.status === "open" && onClose && (
          <button
            onClick={() => onClose(pick.id)}
            className="text-xs text-text-muted hover:text-accent-red transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* Contract line */}
      <div className="font-mono text-sm text-text-secondary">
        {pick.ticker} ${pick.strike} {pick.option_type} {pick.expiry}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-text-muted">Entry</div>
          <div className="font-mono text-text-primary">
            {formatCurrency(pick.option_entry_premium)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Current</div>
          <div className="font-mono text-text-primary">
            {formatCurrency(pick.option_current_premium)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">P/L</div>
          <div className="font-mono font-semibold" style={{ color: pnlColor }}>
            {formatPercentRaw(pick.option_pnl_pct)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Flow Size</div>
          <div className="font-mono text-text-primary">{pick.flow_size}</div>
        </div>
        <div>
          <div className="text-text-muted">Vol/OI</div>
          <div className="font-mono text-text-primary">
            {pick.vol_oi_ratio.toFixed(1)}x
          </div>
        </div>
        <div>
          <div className="text-text-muted">Ask %</div>
          <div className="font-mono text-text-primary">
            {pick.ask_pct.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Rationale */}
      {pick.rationale && (
        <p className="text-xs text-text-secondary leading-relaxed border-t border-border pt-2">
          {pick.rationale}
        </p>
      )}
    </div>
  );
}
