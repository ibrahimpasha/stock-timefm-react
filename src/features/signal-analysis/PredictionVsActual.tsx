import { ArrowUpRight, ArrowDownRight, CheckCircle, XCircle } from "lucide-react";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";
import type { Signal } from "../../lib/types";

interface PredictionVsActualProps {
  signal: Signal | undefined;
  currentPrice: number;
  forecastTimestamp: string | undefined;
  isLoading: boolean;
}

export function PredictionVsActual({
  signal,
  currentPrice,
  forecastTimestamp,
  isLoading,
}: PredictionVsActualProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-32 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Prediction vs Actual</h2>
        <p className="text-xs text-text-muted text-center py-4">No signal loaded.</p>
      </div>
    );
  }

  const entryMid = (signal.entry_low + signal.entry_high) / 2;
  const forecastMove = signal.pct_move;
  const actualMove = entryMid > 0 ? ((currentPrice - entryMid) / entryMid) * 100 : 0;

  // Direction correctness
  const forecastDir = forecastMove >= 0 ? "UP" : "DOWN";
  const actualDir = actualMove >= 0 ? "UP" : "DOWN";
  const directionCorrect = forecastDir === actualDir;

  // Days since forecast
  let daysSince = 0;
  if (forecastTimestamp) {
    const diff = Date.now() - new Date(forecastTimestamp).getTime();
    daysSince = Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text-secondary mb-4">Prediction vs Actual</h2>

      <div className="grid grid-cols-3 gap-4">
        {/* Forecast */}
        <div className="text-center">
          <div className="text-xs text-text-muted mb-1">Forecast Move</div>
          <div className="flex items-center justify-center gap-1">
            {forecastMove >= 0 ? (
              <ArrowUpRight size={16} className="text-accent-green" />
            ) : (
              <ArrowDownRight size={16} className="text-accent-red" />
            )}
            <span
              className="text-lg font-mono font-bold"
              style={{
                color: forecastMove >= 0 ? "var(--accent-green)" : "var(--accent-red)",
              }}
            >
              {formatPercentRaw(forecastMove)}
            </span>
          </div>
        </div>

        {/* Actual */}
        <div className="text-center">
          <div className="text-xs text-text-muted mb-1">Actual Move</div>
          <div className="flex items-center justify-center gap-1">
            {actualMove >= 0 ? (
              <ArrowUpRight size={16} className="text-accent-green" />
            ) : (
              <ArrowDownRight size={16} className="text-accent-red" />
            )}
            <span
              className="text-lg font-mono font-bold"
              style={{
                color: actualMove >= 0 ? "var(--accent-green)" : "var(--accent-red)",
              }}
            >
              {formatPercentRaw(actualMove)}
            </span>
          </div>
        </div>

        {/* Direction badge */}
        <div className="text-center">
          <div className="text-xs text-text-muted mb-1">Direction</div>
          <div className="flex items-center justify-center gap-1">
            {directionCorrect ? (
              <>
                <CheckCircle size={16} className="text-accent-green" />
                <span className="text-sm font-semibold text-accent-green">CORRECT</span>
              </>
            ) : (
              <>
                <XCircle size={16} className="text-accent-red" />
                <span className="text-sm font-semibold text-accent-red">WRONG</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border text-xs text-text-muted">
        <span>{daysSince} day{daysSince !== 1 ? "s" : ""} since forecast</span>
        <span className="font-mono">
          Entry: {formatCurrency(entryMid)} | Now: {formatCurrency(currentPrice)}
        </span>
      </div>
    </div>
  );
}
