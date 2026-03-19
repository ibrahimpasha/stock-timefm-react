import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { formatCurrency } from "../../lib/utils";
import { BarChart3 } from "lucide-react";
import type { ModelForecast } from "../../lib/types";

interface ModelBreakdownProps {
  models: ModelForecast[];
  currentPrice?: number;
  isLoading?: boolean;
}

function SkeletonBreakdown() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 w-32 rounded bg-text-muted/20 mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-2 mb-3">
          <div className="h-3 w-16 rounded bg-text-muted/20" />
          <div className="h-5 rounded bg-text-muted/20 flex-1" />
          <div className="h-3 w-14 rounded bg-text-muted/20" />
        </div>
      ))}
    </div>
  );
}

export function ModelBreakdown({ models, currentPrice, isLoading }: ModelBreakdownProps) {
  if (isLoading) return <SkeletonBreakdown />;

  if (!models || models.length === 0) {
    return (
      <div className="card">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <BarChart3 size={13} />
          Model Breakdown
        </h3>
        <p className="text-xs text-text-muted text-center py-4">
          No model data available
        </p>
      </div>
    );
  }

  // Sort models by end price descending
  const sorted = [...models].sort((a, b) => b.end_price - a.end_price);

  // Determine price range for bar scaling
  const prices = sorted.map((m) => m.end_price);
  const allPrices = currentPrice ? [...prices, currentPrice] : prices;
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const range = maxPrice - minPrice || 1;

  // Scale a price into a 0-100% bar width
  const scalePrice = (price: number) => {
    return ((price - minPrice) / range) * 100;
  };

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-4">
        <BarChart3 size={13} />
        Model Breakdown
      </h3>

      <div className="space-y-2.5">
        {sorted.map((model) => {
          const color = MODEL_COLORS[model.model] || "#8b949e";
          const label = MODEL_LABELS[model.model] || model.model;
          const pctChange = currentPrice
            ? ((model.end_price - currentPrice) / currentPrice) * 100
            : 0;
          const barWidth = Math.max(scalePrice(model.end_price), 4);

          return (
            <div key={model.model} className="group">
              <div className="flex items-center gap-2">
                {/* Model label */}
                <span
                  className="text-xs font-mono w-20 shrink-0 truncate"
                  style={{ color }}
                >
                  {label}
                </span>

                {/* Bar */}
                <div className="flex-1 relative">
                  <div
                    className="h-5 rounded-sm transition-all duration-500 flex items-center px-1.5"
                    style={{
                      width: `${barWidth}%`,
                      background: `${color}30`,
                      borderLeft: `2px solid ${color}`,
                      minWidth: "20px",
                    }}
                  >
                    <span
                      className="text-xs font-mono font-semibold whitespace-nowrap"
                      style={{ color }}
                    >
                      {formatCurrency(model.end_price)}
                    </span>
                  </div>

                  {/* Current price marker */}
                  {currentPrice && (
                    <div
                      className="absolute top-0 h-full border-l border-dashed border-text-secondary"
                      style={{ left: `${scalePrice(currentPrice)}%` }}
                      title={`Current: ${formatCurrency(currentPrice)}`}
                    />
                  )}
                </div>

                {/* Pct change */}
                <span
                  className="text-xs font-mono w-14 text-right shrink-0"
                  style={{
                    color: pctChange >= 0 ? "var(--accent-green)" : "var(--accent-red)",
                  }}
                >
                  {pctChange >= 0 ? "+" : ""}
                  {pctChange.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {currentPrice && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border">
          <div className="border-l border-dashed border-text-secondary h-3" />
          <span className="text-xs text-text-muted">
            Current: {formatCurrency(currentPrice)}
          </span>
        </div>
      )}
    </div>
  );
}
