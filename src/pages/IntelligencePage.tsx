import { useAppStore } from "../store/useAppStore";
import { Brain } from "lucide-react";

export function IntelligencePage() {
  const ticker = useAppStore((s) => s.activeTicker);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Brain size={24} className="text-accent-cyan" />
        <h1 className="text-xl font-semibold text-text-primary">
          Intelligence — {ticker}
        </h1>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Latest intelligence sections */}
        <div className="col-span-8 space-y-4">
          <div className="card min-h-[300px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Latest Intelligence
            </h2>
            <p className="text-xs text-text-muted">
              8 intelligence sections: catalysts, sentiment, competitive
              landscape, technicals, fundamentals, risks, opportunities, and
              macro context.
            </p>
          </div>
          <div className="card min-h-[200px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Event Graph
            </h2>
            <p className="text-xs text-text-muted">
              Scatter timeline of events by severity and trend.
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="col-span-4 space-y-4">
          <div className="card min-h-[200px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Trading Signals
            </h2>
            <p className="text-xs text-text-muted">
              Bullish, bearish, and caution signal cards extracted by Claude.
            </p>
          </div>
          <div className="card min-h-[150px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              History
            </h2>
            <p className="text-xs text-text-muted">
              Timeline of past intelligence queries.
            </p>
          </div>
          <div className="card min-h-[150px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Intelligence Map
            </h2>
            <p className="text-xs text-text-muted">
              Network graph of ticker relationships.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
