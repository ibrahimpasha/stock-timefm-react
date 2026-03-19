import { Activity, CheckCircle, Clock } from "lucide-react";
import { formatCurrency, formatPercentRaw, changeColor } from "../../lib/utils";
import type { Signal } from "../../lib/types";

interface LiveExecutionProps {
  signal: Signal | undefined;
  currentPrice: number;
  isLoading: boolean;
}

export function LiveExecution({ signal, currentPrice, isLoading }: LiveExecutionProps) {
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
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Live Execution</h2>
        <p className="text-xs text-text-muted text-center py-4">No signal loaded.</p>
      </div>
    );
  }

  const entryPrice = (signal.entry_low + signal.entry_high) / 2;
  const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;
  const pnlColor = changeColor(pnlPct);

  // Trigger status: confirmed if current price is within entry zone
  const inZone = currentPrice >= signal.entry_low && currentPrice <= signal.entry_high;
  const triggerStatus = inZone ? "CONFIRMED" : "AWAITING";

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} className="text-accent-blue" />
        <h2 className="text-sm font-semibold text-text-secondary">Live Execution</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-text-muted mb-1">Entry Price</div>
          <div className="text-lg font-mono font-bold text-text-primary">
            {formatCurrency(entryPrice)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Current Price</div>
          <div className="text-lg font-mono font-bold text-text-primary">
            {formatCurrency(currentPrice)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">P/L from Entry</div>
          <div className="text-lg font-mono font-bold" style={{ color: pnlColor }}>
            {formatPercentRaw(pnlPct)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted mb-1">Trigger Status</div>
          <div className="flex items-center gap-1.5">
            {triggerStatus === "CONFIRMED" ? (
              <CheckCircle size={14} className="text-accent-green" />
            ) : (
              <Clock size={14} className="text-accent-orange" />
            )}
            <span
              className="text-sm font-mono font-semibold"
              style={{
                color:
                  triggerStatus === "CONFIRMED"
                    ? "var(--accent-green)"
                    : "var(--accent-orange)",
              }}
            >
              {triggerStatus}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
