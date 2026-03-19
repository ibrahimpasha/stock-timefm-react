import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ConfidenceGauge } from "../../components/ConfidenceGauge";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";
import { DIRECTION_COLORS } from "../../lib/constants";
import type { Signal } from "../../lib/types";

interface SignalHeroProps {
  signal: Signal | undefined;
  currentPrice: number;
  isLoading: boolean;
}

export function SignalHero({ signal, currentPrice, isLoading }: SignalHeroProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="card flex items-center justify-center min-h-[200px]">
        <p className="text-text-muted text-sm">No signal data. Generate or load a signal.</p>
      </div>
    );
  }

  const dirColor = DIRECTION_COLORS[signal.direction];
  const DirIcon =
    signal.direction === "BULL"
      ? TrendingUp
      : signal.direction === "BEAR"
        ? TrendingDown
        : Minus;

  return (
    <div className="card flex flex-col gap-4">
      {/* Direction badge */}
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-2 text-lg font-bold font-mono px-4 py-1.5 rounded-full"
          style={{ color: dirColor, background: `${dirColor}20` }}
        >
          <DirIcon size={20} />
          {signal.direction}
        </span>
        <span className="text-xs text-text-muted">
          {signal.agreeing}/{signal.total_models} models agree
        </span>
      </div>

      {/* Gauge + price */}
      <div className="flex items-center justify-between">
        <ConfidenceGauge value={signal.confidence} size={110} />
        <div className="text-right">
          <div className="text-xs text-text-muted mb-1">Current Price</div>
          <div className="text-2xl font-mono font-bold text-text-primary">
            {formatCurrency(currentPrice)}
          </div>
          <div
            className="text-sm font-mono mt-1"
            style={{ color: dirColor }}
          >
            {formatPercentRaw(signal.pct_move)} forecast move
          </div>
        </div>
      </div>
    </div>
  );
}
