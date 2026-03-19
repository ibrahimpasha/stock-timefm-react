import { useAppStore } from "../store/useAppStore";
import { BarChart3 } from "lucide-react";

export function ForecastPage() {
  const ticker = useAppStore((s) => s.activeTicker);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <BarChart3 size={24} className="text-accent-blue" />
        <h1 className="text-xl font-semibold text-text-primary">
          Forecast — {ticker}
        </h1>
      </div>

      {/* Placeholder layout grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Left sidebar — watchlist + model selector */}
        <div className="col-span-3 space-y-4">
          <div className="card min-h-[200px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Watchlist
            </h2>
            <p className="text-xs text-text-muted">
              Multi-ticker watchlist will be built here.
            </p>
          </div>
          <div className="card min-h-[150px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Model Selector
            </h2>
            <p className="text-xs text-text-muted">
              Model checkboxes will be built here.
            </p>
          </div>
        </div>

        {/* Main content — chart + table */}
        <div className="col-span-9 space-y-4">
          <div className="card min-h-[400px] flex items-center justify-center">
            <div className="text-center text-text-muted">
              <BarChart3 size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                Forecast chart for <span className="font-mono text-text-primary">{ticker}</span>
              </p>
              <p className="text-xs mt-1">
                Candlestick + forecast overlays will render here.
              </p>
            </div>
          </div>
          <div className="card min-h-[200px]">
            <h2 className="text-sm font-semibold text-text-secondary mb-3">
              Model Comparison
            </h2>
            <p className="text-xs text-text-muted">
              Sortable model comparison table will be built here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
