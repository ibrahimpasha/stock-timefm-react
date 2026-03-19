import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { MODEL_LABELS, MODEL_COLORS } from "../../lib/constants";
import type { LeaderboardEntry } from "../../lib/types";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
  onSelectModel?: (model: string) => void;
}

type SortKey = "model" | "mape" | "rmse" | "dir_acc" | "trust_score" | "samples";
type SortDir = "asc" | "desc";

export function LeaderboardTable({
  entries,
  isLoading,
  onSelectModel,
}: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("trust_score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...entries];
    copy.sort((a, b) => {
      let av: number | string;
      let bv: number | string;

      if (sortKey === "model") {
        av = a.model;
        bv = b.model;
        return sortDir === "asc"
          ? (av as string).localeCompare(bv as string)
          : (bv as string).localeCompare(av as string);
      }

      av = a[sortKey];
      bv = b[sortKey];
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [entries, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Default sort direction: ascending for mape/rmse (lower is better), desc for others
      setSortDir(key === "mape" || key === "rmse" ? "asc" : "desc");
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="h-64 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  const columns: { key: SortKey; label: string; format: (v: LeaderboardEntry) => string }[] = [
    { key: "model", label: "Model", format: (v) => MODEL_LABELS[v.model] || v.model },
    { key: "mape", label: "MAPE %", format: (v) => v.mape.toFixed(2) + "%" },
    { key: "rmse", label: "RMSE $", format: (v) => "$" + v.rmse.toFixed(2) },
    { key: "dir_acc", label: "Dir Acc %", format: (v) => v.dir_acc.toFixed(1) + "%" },
    { key: "trust_score", label: "Trust Score", format: (v) => v.trust_score.toFixed(1) },
    { key: "samples", label: "# Evals", format: (v) => v.samples.toString() },
  ];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="w-3" />;
    return sortDir === "asc" ? (
      <ChevronUp size={12} />
    ) : (
      <ChevronDown size={12} />
    );
  };

  return (
    <div className="card overflow-x-auto">
      <h2 className="text-sm font-semibold text-text-secondary mb-4">Leaderboard</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left py-2 px-3 text-text-muted font-semibold cursor-pointer select-none hover:text-text-primary transition-colors"
                onClick={() => handleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  <SortIcon col={col.key} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-text-muted">
                No evaluation data available.
              </td>
            </tr>
          ) : (
            sorted.map((entry) => {
              const color = MODEL_COLORS[entry.model] || "var(--text-secondary)";
              return (
                <tr
                  key={entry.model}
                  className="border-b border-border hover:bg-bg-card-hover transition-colors cursor-pointer"
                  onClick={() => onSelectModel?.(entry.model)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="py-2.5 px-3 font-mono"
                      style={{
                        color: col.key === "model" ? color : "var(--text-primary)",
                      }}
                    >
                      {col.format(entry)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
