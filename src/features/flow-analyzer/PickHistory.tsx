import { PickCard } from "../../components/PickCard";
import { useFlowPicks } from "../../api/flow";
import { History, Archive } from "lucide-react";

export function PickHistory() {
  const { data: closedPicks, isLoading } = useFlowPicks("closed");

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-36" />
        ))}
      </div>
    );
  }

  const picks = closedPicks ?? [];

  if (picks.length === 0) {
    return (
      <div className="card text-center py-8">
        <Archive size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
        <p className="text-sm text-text-muted">No closed picks yet</p>
      </div>
    );
  }

  // Sort by entry_date descending (most recent first)
  const sorted = [...picks].sort(
    (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
  );

  // Compute summary stats
  const wins = sorted.filter((p) => p.option_pnl_pct > 0).length;
  const winRate = (wins / sorted.length) * 100;
  const totalPnl = sorted.reduce((s, p) => s + p.option_pnl_pct, 0);
  const avgPnl = totalPnl / sorted.length;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <History size={13} className="text-text-secondary" />
          <span className="text-text-secondary">
            {sorted.length} closed picks
          </span>
        </div>
        <div>
          <span className="text-text-muted">Win Rate: </span>
          <span
            className="font-mono font-semibold"
            style={{ color: winRate >= 50 ? "var(--accent-green)" : "var(--accent-red)" }}
          >
            {winRate.toFixed(0)}%
          </span>
        </div>
        <div>
          <span className="text-text-muted">Avg P/L: </span>
          <span
            className="font-mono font-semibold"
            style={{ color: avgPnl >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}
          >
            {avgPnl >= 0 ? "+" : ""}
            {avgPnl.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Pick cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((pick) => (
          <PickCard key={pick.id} pick={pick} />
        ))}
      </div>
    </div>
  );
}
