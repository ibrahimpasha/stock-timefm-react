import { useAppStore } from "../store/useAppStore";
import { Command } from "lucide-react";

export function CommandCenterPage() {
  const ticker = useAppStore((s) => s.activeTicker);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Command size={24} className="text-accent-purple" />
        <h1 className="text-xl font-semibold text-text-primary">
          Command Center — {ticker}
        </h1>
      </div>

      {/* Placeholder layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Decision Hero */}
        <div className="col-span-4 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Decision Hero
          </h2>
          <p className="text-xs text-text-muted">
            Verdict badge, confidence gauge, and price display.
          </p>
        </div>

        {/* Action Panel */}
        <div className="col-span-4 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Action Panel
          </h2>
          <p className="text-xs text-text-muted">
            Entry zone, stop loss, targets, option picks.
          </p>
        </div>

        {/* Options Flow */}
        <div className="col-span-4 card min-h-[200px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Options Flow
          </h2>
          <p className="text-xs text-text-muted">
            P/C ratio, max pain, notable strikes.
          </p>
        </div>

        {/* Chart */}
        <div className="col-span-8 card min-h-[350px] flex items-center justify-center">
          <div className="text-center text-text-muted">
            <Command size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              Ensemble forecast chart for{" "}
              <span className="font-mono text-text-primary">{ticker}</span>
            </p>
          </div>
        </div>

        {/* Model Breakdown + Trust */}
        <div className="col-span-4 space-y-4">
          <div className="card min-h-[150px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Model Breakdown
            </h2>
            <p className="text-xs text-text-muted">
              Per-model end price bars.
            </p>
          </div>
          <div className="card min-h-[150px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Trust Scores
            </h2>
            <p className="text-xs text-text-muted">
              Trust score bars from eval DB.
            </p>
          </div>
        </div>

        {/* Flow Analyzer */}
        <div className="col-span-12 card min-h-[300px]">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">
            Options Flow Analyzer
          </h2>
          <p className="text-xs text-text-muted">
            Tabbed sub-app: Flow Alerts, Chat, Active Picks, History, OWLS
            Tracker, Paper Trading.
          </p>
        </div>
      </div>
    </div>
  );
}
