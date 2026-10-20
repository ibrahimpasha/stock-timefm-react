import { PickCard } from "../../components/PickCard";
import { useFlowPicks, useClosePick } from "../../api/flow";
import { formatPercentRaw } from "../../lib/utils";
import { Loader2 } from "lucide-react";
import { Stat } from "../../components/Glass";

/* ── Summary Metrics Row ─────────────────────────────────── */

function SummaryMetrics({
  openCount,
  closedCount,
  winRate,
  avgPnl,
}: {
  openCount: number;
  closedCount: number;
  winRate: number;
  avgPnl: number;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-x-10 gap-y-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-muted">Open picks</span>
        <span className="num text-3xl font-semibold tracking-tight text-text-primary">{openCount}</span>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Stat label="Closed" value={closedCount} />
        <Stat label="Win rate" value={`${winRate.toFixed(0)}%`} tone={winRate >= 50 ? "green" : "red"} />
        <Stat label="Avg P/L" value={formatPercentRaw(avgPnl)} tone={avgPnl >= 0 ? "green" : "red"} />
      </div>
    </div>
  );
}

/* ── Main ActivePicks ────────────────────────────────────── */

export function ActivePicks() {
  const { data: openPicks, isLoading: openLoading } = useFlowPicks("open");
  const { data: closedPicks, isLoading: closedLoading } = useFlowPicks("closed");
  const closeMutation = useClosePick();

  const isLoading = openLoading || closedLoading;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card h-16" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-36" />
        ))}
      </div>
    );
  }

  const open = openPicks ?? [];
  const closed = closedPicks ?? [];
  const wins = closed.filter((p) => p.option_pnl_pct > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
  const avgPnl =
    closed.length > 0
      ? closed.reduce((sum, p) => sum + p.option_pnl_pct, 0) / closed.length
      : 0;

  return (
    <div>
      <SummaryMetrics
        openCount={open.length}
        closedCount={closed.length}
        winRate={winRate}
        avgPnl={avgPnl}
      />

      {open.length === 0 ? (
        <div className="py-10 text-center">
          <p className="section-title">No active picks</p>
          <p className="mt-1 text-sm text-text-muted">
            Analyze flow data to generate picks
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {open.map((pick) => (
            <div key={pick.id} className="relative">
              <PickCard
                pick={pick}
                onClose={(id) => closeMutation.mutate(id)}
              />
              {closeMutation.isPending && (
                <div className="absolute inset-0 flex items-center justify-center bg-bg-card/60 rounded-xl">
                  <Loader2 size={20} className="animate-spin text-accent-blue" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
