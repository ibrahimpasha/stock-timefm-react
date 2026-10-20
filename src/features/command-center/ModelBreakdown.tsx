import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { forecastReturn } from "../../lib/forecastSeries";
import { formatCurrency } from "../../lib/utils";
import type { ModelForecast } from "../../lib/types";

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

interface ModelBreakdownProps {
  models: ModelForecast[];
  currentPrice?: number;
  isLoading?: boolean;
}

function SkeletonBreakdown() {
  return (
    <div className="animate-pulse pt-2">
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
      <div className="pt-2">
        <h4 className="text-base font-semibold text-text-primary mb-1">Model breakdown</h4>
        <p className="text-sm text-text-muted">No model data available.</p>
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
    <div className="pt-2">
      <h4 className="text-base font-semibold text-text-primary mb-1.5">Model breakdown</h4>

      {sorted.length > 1 && (
        <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary mb-4">
          Models routinely disagree on direction. In backtests none called up/down better
          than simply assuming &ldquo;up&rdquo;, so read the 80% range, not the sign.
        </p>
      )}
      <div className="divide-y divide-border">
        {sorted.map((model) => {
          const color = MODEL_COLORS[model.model] || "var(--text-secondary)";
          const label = MODEL_LABELS[model.model] || model.model;
          const pctChange = forecastReturn(model.end_price, model.current_price);
          const barWidth = Math.max(scalePrice(model.end_price), 4);
          const last = model.predictions?.[model.predictions.length - 1];
          const lo = last?.q10 ?? null;
          const hi = last?.q90 ?? null;
          const loPct = lo != null ? forecastReturn(lo, model.current_price) : null;
          const hiPct = hi != null ? forecastReturn(hi, model.current_price) : null;

          return (
            <div key={model.model} className="group py-2.5">
              <div className="flex items-center gap-2">
                {/* Model label */}
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-text-primary">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="truncate">{label}</span>
                </span>

                {/* Bar */}
                <div className="flex-1 relative">
                  <div
                    className="h-5 rounded-sm transition-all duration-500 flex items-center px-1.5"
                    style={{
                      width: `${barWidth}%`,
                      background: `color-mix(in srgb, ${color} 22%, transparent)`,
                      minWidth: "20px",
                    }}
                  >
                    <span className="num text-xs font-semibold whitespace-nowrap text-text-primary">
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

                {/* Median change — neutral ink: no model has a validated directional edge */}
                <span className="num text-sm font-semibold w-16 text-right shrink-0 text-text-primary">
                  {pctChange == null ? "Unknown" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}%`}
                </span>
              </div>
              {lo != null && hi != null && (
                <p className="text-xs text-text-muted mt-1 pl-[6.5rem]">
                  80% range <span className="num">{formatCurrency(lo)} &ndash; {formatCurrency(hi)}
                  {loPct != null && hiPct != null &&
                    ` (${signed(loPct)} / ${signed(hiPct)})`}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {currentPrice && (
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <div className="border-l border-dashed border-text-secondary h-3" />
          <span className="text-xs text-text-muted">
            Current <span className="num">{formatCurrency(currentPrice)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
