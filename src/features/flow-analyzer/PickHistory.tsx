import { PickCard } from "../../components/PickCard";
import { useFlowPicks } from "../../api/flow";
import { Archive } from "lucide-react";
import { Stat } from "../../components/Glass";

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
      <div className="text-center py-8">
        <Archive size={20} className="mx-auto mb-2 text-text-muted opacity-60" />
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
      <div className="mb-4">
        <h3 className="section-title">Closed picks</h3>
        <p className="section-sub">Most recent entry first.</p>
      </div>
      <div className="mb-6 grid grid-cols-3 gap-6 sm:max-w-md">
        <Stat label="Closed" value={sorted.length} />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} tone={winRate >= 50 ? "green" : "red"} />
        <Stat label="Avg P/L" value={`${avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(1)}%`} tone={avgPnl >= 0 ? "green" : "red"} />
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
