import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ModelForecast } from "../../lib/types";
import { BullBearBar } from "../../components/BullBearBar";

interface ConsensusBarProps {
  forecasts: ModelForecast[];
  isLoading: boolean;
  className?: string;
}

export function ConsensusBar({
  forecasts,
  isLoading,
  className = "",
}: ConsensusBarProps) {
  if (isLoading) {
    return (
      <div className={`card ${className}`}>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">
          Consensus
        </h2>
        <div className="h-12 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className={`card ${className}`}>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">
          Consensus
        </h2>
        <p className="text-xs text-text-muted text-center py-4">
          No forecast data yet.
        </p>
      </div>
    );
  }

  const bullCount = forecasts.filter(
    (f) => f.end_price > f.current_price
  ).length;
  const bearCount = forecasts.length - bullCount;
  const total = forecasts.length;
  const bullPct = total > 0 ? (bullCount / total) * 100 : 50;

  // Determine overall signal
  let signal: "BULL" | "BEAR" | "NEUTRAL";
  let signalColor: string;
  let SignalIcon: typeof TrendingUp;

  if (bullPct >= 65) {
    signal = "BULL";
    signalColor = "var(--accent-green)";
    SignalIcon = TrendingUp;
  } else if (bullPct <= 35) {
    signal = "BEAR";
    signalColor = "var(--accent-red)";
    SignalIcon = TrendingDown;
  } else {
    signal = "NEUTRAL";
    signalColor = "var(--text-secondary)";
    SignalIcon = Minus;
  }

  // Average predicted change
  const avgPctChange =
    forecasts.reduce((sum, f) => {
      const pct =
        f.current_price > 0
          ? ((f.end_price - f.current_price) / f.current_price) * 100
          : 0;
      return sum + pct;
    }, 0) / total;

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-text-secondary">Consensus</h2>
        <div className="flex items-center gap-2">
          <SignalIcon size={16} style={{ color: signalColor }} />
          <span
            className="text-sm font-bold font-mono"
            style={{ color: signalColor }}
          >
            {signal}
          </span>
        </div>
      </div>

      <BullBearBar bull={bullCount} total={total} height={20} />

      <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
        <span>
          Agreement: {Math.max(bullPct, 100 - bullPct).toFixed(0)}%
        </span>
        <span className="font-mono">
          Avg move:{" "}
          <span
            style={{
              color: avgPctChange >= 0 ? "var(--accent-green)" : "var(--accent-red)",
            }}
          >
            {avgPctChange >= 0 ? "+" : ""}
            {avgPctChange.toFixed(2)}%
          </span>
        </span>
      </div>
    </div>
  );
}
