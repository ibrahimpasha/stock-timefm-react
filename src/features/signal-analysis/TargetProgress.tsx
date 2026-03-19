import { Target } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import type { Signal } from "../../lib/types";

interface TargetProgressProps {
  signal: Signal | undefined;
  currentPrice: number;
  isLoading: boolean;
}

type TargetStatus = "HIT" | "NEXT" | "PENDING";

function getTargetStatus(
  currentPrice: number,
  entryPrice: number,
  targetPrice: number,
  isBull: boolean
): TargetStatus {
  if (isBull) {
    if (currentPrice >= targetPrice) return "HIT";
    if (currentPrice >= entryPrice) return "NEXT";
    return "PENDING";
  } else {
    if (currentPrice <= targetPrice) return "HIT";
    if (currentPrice <= entryPrice) return "NEXT";
    return "PENDING";
  }
}

function getProgressPct(
  currentPrice: number,
  entryPrice: number,
  targetPrice: number
): number {
  const range = targetPrice - entryPrice;
  if (Math.abs(range) < 0.001) return 0;
  const progress = ((currentPrice - entryPrice) / range) * 100;
  return Math.max(0, Math.min(100, progress));
}

const STATUS_COLORS: Record<TargetStatus, string> = {
  HIT: "var(--accent-green)",
  NEXT: "var(--accent-blue)",
  PENDING: "var(--text-muted)",
};

export function TargetProgress({ signal, currentPrice, isLoading }: TargetProgressProps) {
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
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Target Progress</h2>
        <p className="text-xs text-text-muted text-center py-4">No signal loaded.</p>
      </div>
    );
  }

  const entryPrice = (signal.entry_low + signal.entry_high) / 2;
  const isBull = signal.direction === "BULL";

  const t1Status = getTargetStatus(currentPrice, entryPrice, signal.t1, isBull);
  const t2Status = getTargetStatus(currentPrice, entryPrice, signal.t2, isBull);
  const t1Progress = getProgressPct(currentPrice, entryPrice, signal.t1);
  const t2Progress = getProgressPct(currentPrice, entryPrice, signal.t2);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Target size={16} className="text-accent-green" />
        <h2 className="text-sm font-semibold text-text-secondary">Target Progress</h2>
      </div>

      <div className="space-y-4">
        {/* T1 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary font-mono">
              T1: {formatCurrency(signal.t1)}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                color: STATUS_COLORS[t1Status],
                background: `${STATUS_COLORS[t1Status]}20`,
              }}
            >
              {t1Status}
            </span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "rgba(48, 54, 61, 0.45)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${t1Progress}%`,
                background: STATUS_COLORS[t1Status],
              }}
            />
          </div>
        </div>

        {/* T2 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary font-mono">
              T2: {formatCurrency(signal.t2)}
            </span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                color: STATUS_COLORS[t2Status],
                background: `${STATUS_COLORS[t2Status]}20`,
              }}
            >
              {t2Status}
            </span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "rgba(48, 54, 61, 0.45)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${t2Progress}%`,
                background: STATUS_COLORS[t2Status],
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
