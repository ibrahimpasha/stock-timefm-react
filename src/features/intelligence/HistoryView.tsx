import { Clock } from "lucide-react";
import { formatDate } from "../../lib/utils";
import type { IntelSection } from "../../lib/types";

interface HistoryViewProps {
  entries: IntelSection[];
  isLoading: boolean;
  filterType: string;
  onFilterChange: (type: string) => void;
}

const QUERY_TYPES = [
  { value: "", label: "All Types" },
  { value: "catalysts", label: "Catalysts" },
  { value: "sentiment", label: "Sentiment" },
  { value: "competitive", label: "Competitive" },
  { value: "sector", label: "Sector Flows" },
  { value: "macro", label: "Macro" },
  { value: "rates", label: "Rates" },
  { value: "geopolitical", label: "Geopolitical" },
  { value: "regime", label: "Regime" },
];

export function HistoryView({
  entries,
  isLoading,
  filterType,
  onFilterChange,
}: HistoryViewProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-64 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-accent-blue" />
          <h2 className="text-sm font-semibold text-text-secondary">Intelligence History</h2>
        </div>
        <select
          value={filterType}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg font-mono"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {QUERY_TYPES.map((qt) => (
            <option key={qt.value} value={qt.value}>
              {qt.label}
            </option>
          ))}
        </select>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-text-muted text-center py-8">No history entries found.</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {entries.map((entry, i) => (
            <div
              key={i}
              className="flex gap-3 pb-3 border-b border-border last:border-0"
            >
              <div className="flex flex-col items-center">
                <div
                  className="w-2 h-2 rounded-full mt-1.5"
                  style={{ background: "var(--accent-blue)" }}
                />
                {i < entries.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-text-primary">{entry.title}</span>
                  <span className="text-xs text-text-muted">{formatDate(entry.timestamp)}</span>
                </div>
                <span
                  className="text-xs font-mono px-1.5 py-0.5 rounded mb-1 inline-block"
                  style={{ background: "rgba(88, 166, 255, 0.1)", color: "var(--accent-blue)" }}
                >
                  {entry.type}
                </span>
                <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                  {entry.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
