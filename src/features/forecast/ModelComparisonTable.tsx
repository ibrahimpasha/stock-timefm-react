import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";
import type { ModelForecast } from "../../lib/types";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";

type SortKey = "model" | "end_price" | "pct_change" | "direction";
type SortDir = "asc" | "desc";

interface ModelComparisonTableProps {
  forecasts: ModelForecast[];
  isLoading: boolean;
  className?: string;
}

export function ModelComparisonTable({
  forecasts,
  isLoading,
  className = "",
}: ModelComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("pct_change");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rows = useMemo(() => {
    const mapped = forecasts.map((f) => {
      const pctChange =
        f.current_price > 0
          ? ((f.end_price - f.current_price) / f.current_price) * 100
          : 0;
      return {
        model: f.model,
        endPrice: f.end_price,
        currentPrice: f.current_price,
        pctChange,
        direction: pctChange >= 0 ? ("up" as const) : ("down" as const),
        latencyMs: f.latency_ms,
      };
    });

    mapped.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "model":
          cmp = a.model.localeCompare(b.model);
          break;
        case "end_price":
          cmp = a.endPrice - b.endPrice;
          break;
        case "pct_change":
          cmp = a.pctChange - b.pctChange;
          break;
        case "direction":
          cmp = a.pctChange - b.pctChange;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return mapped;
  }, [forecasts, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={`card ${className}`}>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">
          Model Comparison
        </h2>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 bg-bg-card-hover rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (forecasts.length === 0) {
    return (
      <div className={`card ${className}`}>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">
          Model Comparison
        </h2>
        <p className="text-xs text-text-muted text-center py-6">
          Run a forecast to see model predictions.
        </p>
      </div>
    );
  }

  const SortHeader = ({
    label,
    colKey,
    align = "left",
  }: {
    label: string;
    colKey: SortKey;
    align?: "left" | "right" | "center";
  }) => (
    <th
      className={`px-3 py-2 text-xs font-semibold text-text-muted cursor-pointer hover:text-text-secondary select-none transition-colors text-${align}`}
      onClick={() => handleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown
          size={10}
          className={sortKey === colKey ? "text-accent-blue" : "opacity-30"}
        />
      </span>
    </th>
  );

  return (
    <div className={`card ${className}`}>
      <h2 className="text-sm font-semibold text-text-secondary mb-3">
        Model Comparison
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <SortHeader label="Model" colKey="model" />
              <SortHeader label="Target Price" colKey="end_price" align="right" />
              <SortHeader label="% Change" colKey="pct_change" align="right" />
              <SortHeader label="Direction" colKey="direction" align="center" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const color = MODEL_COLORS[row.model] || "#8b949e";
              const isUp = row.direction === "up";

              return (
                <tr
                  key={row.model}
                  className="border-b border-border/50 hover:bg-bg-card-hover transition-colors"
                >
                  {/* Model name with color dot */}
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-mono text-text-primary text-xs">
                        {MODEL_LABELS[row.model] || row.model}
                      </span>
                    </span>
                  </td>

                  {/* Target price */}
                  <td className="px-3 py-2.5 text-right font-mono text-text-primary text-xs">
                    {formatCurrency(row.endPrice)}
                  </td>

                  {/* % change */}
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <span
                      style={{
                        color: isUp
                          ? "var(--accent-green)"
                          : "var(--accent-red)",
                      }}
                    >
                      {formatPercentRaw(row.pctChange)}
                    </span>
                  </td>

                  {/* Direction arrow */}
                  <td className="px-3 py-2.5 text-center">
                    {isUp ? (
                      <TrendingUp
                        size={16}
                        className="inline"
                        style={{ color: "var(--accent-green)" }}
                      />
                    ) : (
                      <TrendingDown
                        size={16}
                        className="inline"
                        style={{ color: "var(--accent-red)" }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
