import { PickCard } from "../../components/PickCard";
import { useFlowPicks, useClosePick } from "../../api/flow";
import { formatPercentRaw } from "../../lib/utils";
import { Loader2 } from "lucide-react";
import { TileGrid, Tile, KpiTile, BarRow, toneOf } from "../../components/Cockpit";

/* ── Main ActivePicks ────────────────────────────────────── */

export function ActivePicks() {
  const { data: openPicks, isLoading: openLoading } = useFlowPicks("open");
  const { data: closedPicks, isLoading: closedLoading } = useFlowPicks("closed");
  const closeMutation = useClosePick();

  const isLoading = openLoading || closedLoading;

  if (isLoading) {
    return (
      <TileGrid className="animate-pulse">
        {[0, 1, 2, 3].map((i) => (
          <Tile key={i} span={3}><div className="h-12" /></Tile>
        ))}
        <Tile span={12}><div className="h-36" /></Tile>
      </TileGrid>
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
  const openMax = Math.max(1, ...open.map((p) => Math.abs(p.option_pnl_pct ?? 0)));

  return (
    <TileGrid>
      <KpiTile label="Open picks" value={open.length} />
      <KpiTile label="Closed" value={closed.length} />
      <KpiTile label="Win rate" value={`${winRate.toFixed(0)}%`} delta={`${wins}/${closed.length}`} tone={winRate >= 50 ? "up" : "down"} />
      <KpiTile label="Avg P/L (closed)" value={formatPercentRaw(avgPnl)} tone={toneOf(avgPnl)} />

      {open.length === 0 ? (
        <Tile span={12}>
          <p className="py-8 text-center text-sm text-text-muted">No active picks. Analyze flow data to generate picks.</p>
        </Tile>
      ) : (
        <>
          {open.length >= 4 && (
            <Tile span={12} title="Open P/L" meta="option premium change">
              {[...open]
                .sort((a, b) => (b.option_pnl_pct ?? 0) - (a.option_pnl_pct ?? 0))
                .map((p) => (
                  <BarRow
                    key={p.id}
                    label={p.ticker}
                    value={p.option_pnl_pct ?? 0}
                    max={openMax}
                    display={formatPercentRaw(p.option_pnl_pct ?? 0, 1)}
                    diverging
                    title={`$${p.strike} ${p.option_type} ${p.expiry}`}
                  />
                ))}
            </Tile>
          )}
          {open.map((pick) => (
            <div key={pick.id} className="relative min-w-0 lg:col-span-6">
              <PickCard pick={pick} onClose={(id) => closeMutation.mutate(id)} />
              {closeMutation.isPending && (
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-bg-card/60">
                  <Loader2 size={20} className="animate-spin text-accent" />
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </TileGrid>
  );
}
