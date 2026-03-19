import { useState } from "react";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { MODEL_LABELS, MODEL_COLORS } from "../../lib/constants";
import { useModelHistory } from "../../api/eval";
import { formatCurrency, formatDate } from "../../lib/utils";

interface ModelDeepDiveProps {
  model: string | null;
  ticker?: string;
}

export function ModelDeepDive({ model, ticker }: ModelDeepDiveProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: history = [], isLoading } = useModelHistory(
    model ?? "",
    ticker
  );

  if (!model) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Model Deep Dive</h2>
        <p className="text-xs text-text-muted text-center py-4">
          Select a model from the leaderboard to see detailed metrics.
        </p>
      </div>
    );
  }

  const label = MODEL_LABELS[model] || model;
  const color = MODEL_COLORS[model] || "var(--text-secondary)";

  // Compute MAPE histogram buckets
  const errors = history.map((h) => Math.abs(h.pct_error));
  const buckets = [
    { label: "0-1%", min: 0, max: 1 },
    { label: "1-2%", min: 1, max: 2 },
    { label: "2-5%", min: 2, max: 5 },
    { label: "5-10%", min: 5, max: 10 },
    { label: "10%+", min: 10, max: Infinity },
  ];
  const bucketCounts = buckets.map(
    (b) => errors.filter((e) => e >= b.min && e < b.max).length
  );
  const maxCount = Math.max(...bucketCounts, 1);

  // Per-ticker performance
  const tickerMap = new Map<string, { correct: number; total: number; errors: number[] }>();
  for (const h of history) {
    if (!tickerMap.has(h.ticker)) {
      tickerMap.set(h.ticker, { correct: 0, total: 0, errors: [] });
    }
    const t = tickerMap.get(h.ticker)!;
    t.total++;
    if (h.direction_correct) t.correct++;
    t.errors.push(Math.abs(h.pct_error));
  }

  return (
    <div className="card">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <BarChart3 size={16} style={{ color }} />
          <h2 className="text-sm font-semibold text-text-secondary">
            Deep Dive: <span style={{ color }}>{label}</span>
          </h2>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-text-muted" />
        ) : (
          <ChevronDown size={16} className="text-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-6">
          {isLoading ? (
            <div className="h-32 bg-bg-card-hover rounded-lg animate-pulse" />
          ) : (
            <>
              {/* MAPE Histogram */}
              <div>
                <h3 className="text-xs font-semibold text-text-muted mb-3">
                  MAPE Distribution ({history.length} predictions)
                </h3>
                <div className="flex items-end gap-2 h-24">
                  {buckets.map((b, i) => (
                    <div key={b.label} className="flex-1 flex flex-col items-center">
                      <span className="text-xs font-mono text-text-muted mb-1">
                        {bucketCounts[i]}
                      </span>
                      <div
                        className="w-full rounded-t-sm transition-all duration-300"
                        style={{
                          height: `${(bucketCounts[i] / maxCount) * 80}px`,
                          background: color,
                          opacity: 0.6,
                          minHeight: bucketCounts[i] > 0 ? "4px" : "0px",
                        }}
                      />
                      <span className="text-xs text-text-muted mt-1">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-ticker performance */}
              <div>
                <h3 className="text-xs font-semibold text-text-muted mb-3">
                  Per-Ticker Performance
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from(tickerMap.entries()).map(([t, stats]) => {
                    const avgErr =
                      stats.errors.length > 0
                        ? stats.errors.reduce((a, b) => a + b, 0) / stats.errors.length
                        : 0;
                    const dirAcc = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
                    return (
                      <div
                        key={t}
                        className="flex items-center justify-between p-2 rounded-lg"
                        style={{ background: "rgba(13, 17, 23, 0.5)" }}
                      >
                        <span className="text-xs font-mono font-semibold text-text-primary">
                          {t}
                        </span>
                        <div className="flex gap-3 text-xs font-mono text-text-secondary">
                          <span>MAPE: {avgErr.toFixed(1)}%</span>
                          <span>Dir: {dirAcc.toFixed(0)}%</span>
                          <span className="text-text-muted">n={stats.total}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent predictions table */}
              <div>
                <h3 className="text-xs font-semibold text-text-muted mb-3">
                  Recent Predictions
                </h3>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-text-muted">
                        <th className="text-left py-1.5 px-2">Date</th>
                        <th className="text-left py-1.5 px-2">Ticker</th>
                        <th className="text-right py-1.5 px-2">Predicted</th>
                        <th className="text-right py-1.5 px-2">Actual</th>
                        <th className="text-right py-1.5 px-2">Error</th>
                        <th className="text-center py-1.5 px-2">Dir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 20).map((h) => (
                        <tr key={h.id} className="border-b border-border">
                          <td className="py-1.5 px-2 text-text-secondary font-mono">
                            {formatDate(h.date)}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-text-primary">
                            {h.ticker}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-text-primary">
                            {formatCurrency(h.predicted_price)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-text-primary">
                            {formatCurrency(h.actual_price)}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-text-secondary">
                            {h.pct_error.toFixed(2)}%
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span
                              className="text-xs"
                              style={{
                                color: h.direction_correct
                                  ? "var(--accent-green)"
                                  : "var(--accent-red)",
                              }}
                            >
                              {h.direction_correct ? "OK" : "X"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
