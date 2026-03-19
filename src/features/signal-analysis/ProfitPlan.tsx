import { DollarSign } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import type { Signal } from "../../lib/types";

interface ProfitPlanProps {
  signal: Signal | undefined;
  isLoading: boolean;
}

export function ProfitPlan({ signal, isLoading }: ProfitPlanProps) {
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
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Profit Plan</h2>
        <p className="text-xs text-text-muted text-center py-4">No signal loaded.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={16} className="text-accent-green" />
        <h2 className="text-sm font-semibold text-text-secondary">Profit-Taking Plan</h2>
      </div>

      <div className="space-y-4">
        {/* T1 plan */}
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(63, 185, 80, 0.08)", border: "1px solid rgba(63, 185, 80, 0.2)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-accent-green">T1: {formatCurrency(signal.t1)}</span>
            <span className="text-xs font-mono text-text-muted">Scale 40%</span>
          </div>
          <p className="text-xs text-text-secondary">
            Scale out 40% of position at T1. Move stop loss to entry price (breakeven).
          </p>
        </div>

        {/* T2 plan */}
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(88, 166, 255, 0.08)", border: "1px solid rgba(88, 166, 255, 0.2)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-accent-blue">T2: {formatCurrency(signal.t2)}</span>
            <span className="text-xs font-mono text-text-muted">Close 60%</span>
          </div>
          <p className="text-xs text-text-secondary">
            Close remaining 60% of position at T2. Full exit completes the trade.
          </p>
        </div>
      </div>
    </div>
  );
}
