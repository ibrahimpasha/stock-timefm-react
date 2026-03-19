import { useAppStore } from "../store/useAppStore";
import { Target } from "lucide-react";

export function SignalAnalysisPage() {
  const ticker = useAppStore((s) => s.activeTicker);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Target size={24} className="text-accent-green" />
        <h1 className="text-xl font-semibold text-text-primary">
          Signal Analysis — {ticker}
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Signal Hero */}
        <div className="col-span-4 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Signal Hero
          </h2>
          <p className="text-xs text-text-muted">
            Direction badge (BULL/BEAR/NEUTRAL), confidence gauge, and current
            price.
          </p>
        </div>

        {/* Option Picks */}
        <div className="col-span-8 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Option Picks
          </h2>
          <p className="text-xs text-text-muted">
            Lotto (3-18 DTE), Swing (21-75 DTE), and LEAP (90-545 DTE) picks
            with live chain data.
          </p>
        </div>

        {/* Live Execution + Targets */}
        <div className="col-span-6 card min-h-[180px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Live Execution
          </h2>
          <p className="text-xs text-text-muted">
            Entry price, current price, P/L from entry, trigger status.
          </p>
        </div>
        <div className="col-span-6 card min-h-[180px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Action Plan
          </h2>
          <p className="text-xs text-text-muted">
            Entry zone, stop loss, T1/T2 progress bars, profit-taking plan.
          </p>
        </div>

        {/* Thesis + Model Breakdown */}
        <div className="col-span-8 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Signal Thesis
          </h2>
          <p className="text-xs text-text-muted">
            Claude-reasoned thesis from Perplexity intelligence and model
            consensus.
          </p>
        </div>
        <div className="col-span-4 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Model Breakdown
          </h2>
          <p className="text-xs text-text-muted">
            Horizontal bars showing each model's end price forecast.
          </p>
        </div>
      </div>
    </div>
  );
}
