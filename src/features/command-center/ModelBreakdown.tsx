import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { forecastReturn } from "../../lib/forecastSeries";
import { formatCurrency } from "../../lib/utils";
import type { ModelForecast } from "../../lib/types";
import { BarRow } from "../../components/Cockpit";

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

interface ModelBreakdownProps {
  models: ModelForecast[];
  currentPrice?: number;
  isLoading?: boolean;
}

function SkeletonBreakdown() {
  return (
    <div className="animate-pulse">
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
    return <p className="text-sm text-text-muted">No model data available.</p>;
  }

  // Sort models by end price descending
  const sorted = [...models].sort((a, b) => b.end_price - a.end_price);
  const rows = sorted.map((model) => {
    const pct = forecastReturn(model.end_price, model.current_price);
    const last = model.predictions?.[model.predictions.length - 1];
    const lo = last?.q10 ?? null;
    const hi = last?.q90 ?? null;
    return {
      model,
      pct,
      lo,
      hi,
      loPct: lo != null ? forecastReturn(lo, model.current_price) : null,
      hiPct: hi != null ? forecastReturn(hi, model.current_price) : null,
    };
  });
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pct ?? 0)));

  return (
    <div className="flex flex-col gap-2">
      {sorted.length > 1 && (
        <p className="max-w-[72ch] text-xs leading-relaxed text-text-muted">
          Models routinely disagree on direction. In backtests none called up/down better
          than simply assuming &ldquo;up&rdquo;, so read the 80% range, not the sign.
        </p>
      )}
      {rows.map(({ model, pct, lo, hi, loPct, hiPct }) => {
        const color = MODEL_COLORS[model.model] || "var(--text-secondary)";
        const label = MODEL_LABELS[model.model] || model.model;
        return (
          <div key={model.model} className="flex flex-col gap-0.5">
            {/* Neutral ink: no model has a validated directional edge */}
            <BarRow
              label={
                <span className="inline-flex min-w-0 items-center gap-1.5 font-sans font-medium">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                  <span className="truncate">{label}</span>
                </span>
              }
              value={pct ?? 0}
              max={maxAbs}
              diverging
              tone="info"
              display={pct == null ? "Unknown" : signed(pct)}
              title={`${label}: ${formatCurrency(model.end_price)}`}
            />
            <p className="num pl-[4.875rem] text-xs text-text-muted">
              {formatCurrency(model.end_price)}
              {lo != null && hi != null && (
                <>
                  {" "}· 80% {formatCurrency(lo)} &ndash; {formatCurrency(hi)}
                  {loPct != null && hiPct != null && ` (${signed(loPct)} / ${signed(hiPct)})`}
                </>
              )}
            </p>
          </div>
        );
      })}

      {currentPrice && (
        <div className="border-t border-border pt-2 text-xs text-text-muted">
          Current <span className="num">{formatCurrency(currentPrice)}</span>
        </div>
      )}
    </div>
  );
}
