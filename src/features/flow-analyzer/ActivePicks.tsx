import { PickCard } from "../../components/PickCard";
import { useFlowPicks, useClosePick } from "../../api/flow";
import { formatCurrency, formatPercentRaw, changeColor } from "../../lib/utils";
import {
  Target,
  TrendingUp,
  Trophy,
  BarChart3,
  Loader2,
} from "lucide-react";

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
  const metrics = [
    {
      label: "Open Picks",
      value: openCount.toString(),
      icon: Target,
      color: "var(--accent-blue)",
    },
    {
      label: "Closed",
      value: closedCount.toString(),
      icon: BarChart3,
      color: "var(--text-secondary)",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(0)}%`,
      icon: Trophy,
      color: winRate >= 50 ? "var(--accent-green)" : "var(--accent-red)",
    },
    {
      label: "Avg P/L",
      value: formatPercentRaw(avgPnl),
      icon: TrendingUp,
      color: changeColor(avgPnl),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="card flex items-center gap-3 py-2 px-3"
        >
          <m.icon size={16} style={{ color: m.color }} className="shrink-0" />
          <div>
            <div
              className="font-mono font-bold text-sm"
              style={{ color: m.color }}
            >
              {m.value}
            </div>
            <div className="text-xs text-text-muted">{m.label}</div>
          </div>
        </div>
      ))}
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
  const total = open.length + closed.length;
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
        <div className="card text-center py-8">
          <Target size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
          <p className="text-sm text-text-muted">No active picks</p>
          <p className="text-xs text-text-muted mt-1">
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
