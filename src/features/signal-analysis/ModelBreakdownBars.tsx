import { BarChart3 } from "lucide-react";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import type { ModelForecast } from "../../lib/types";

interface ModelBreakdownBarsProps {
  models: ModelForecast[];
  isLoading: boolean;
}

export function ModelBreakdownBars({ models, isLoading }: ModelBreakdownBarsProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Model Breakdown</h2>
        <p className="text-xs text-text-muted text-center py-4">No model data available.</p>
      </div>
    );
  }

  // Sort by end price descending
  const sorted = [...models].sort((a, b) => b.end_price - a.end_price);
  const currentPrice = sorted[0].current_price;

  // Compute % change for each model
  const items = sorted.map((m) => ({
    model: m.model,
    endPrice: m.end_price,
    pctChange: currentPrice > 0 ? ((m.end_price - currentPrice) / currentPrice) * 100 : 0,
  }));

  // Find max absolute pct for scaling
  const maxAbs = Math.max(...items.map((it) => Math.abs(it.pctChange)), 1);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={16} className="text-accent-purple" />
        <h2 className="text-sm font-semibold text-text-secondary">Model Breakdown</h2>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const color = MODEL_COLORS[item.model] || "var(--text-secondary)";
          const label = MODEL_LABELS[item.model] || item.model;
          const barWidth = (Math.abs(item.pctChange) / maxAbs) * 100;
          const isPositive = item.pctChange >= 0;

          return (
            <div key={item.model} className="flex items-center gap-3">
              <div className="w-24 text-xs font-mono text-text-secondary truncate text-right">
                {label}
              </div>
              <div className="flex-1 flex items-center">
                <div className="w-full h-5 relative" style={{ background: "rgba(48, 54, 61, 0.2)" }}>
                  <div
                    className="absolute top-0 h-full rounded-sm transition-all duration-300"
                    style={{
                      width: `${barWidth}%`,
                      background: color,
                      opacity: 0.7,
                      left: isPositive ? "0%" : undefined,
                      right: isPositive ? undefined : "0%",
                    }}
                  />
                </div>
              </div>
              <div className="w-16 text-right">
                <span
                  className="text-xs font-mono"
                  style={{ color: isPositive ? "var(--accent-green)" : "var(--accent-red)" }}
                >
                  {formatPercentRaw(item.pctChange, 1)}
                </span>
              </div>
              <div className="w-20 text-right text-xs font-mono text-text-secondary">
                {formatCurrency(item.endPrice)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
