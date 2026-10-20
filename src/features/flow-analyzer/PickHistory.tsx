import { PickCard } from "../../components/PickCard";
import { useFlowPicks } from "../../api/flow";
import { Archive } from "lucide-react";
import { TileGrid, Tile, KpiTile, BarRow, toneOf } from "../../components/Cockpit";

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function PickHistory() {
  const { data: closedPicks, isLoading } = useFlowPicks("closed");

  if (isLoading) {
    return (
      <TileGrid className="animate-pulse">
        {[0, 1, 2].map((i) => (
          <Tile key={i} span={4}><div className="h-24" /></Tile>
        ))}
      </TileGrid>
    );
  }

  const picks = closedPicks ?? [];

  if (picks.length === 0) {
    return (
      <Tile>
        <div className="py-8 text-center">
          <Archive size={20} className="mx-auto mb-2 text-text-muted opacity-60" />
          <p className="text-sm text-text-muted">No closed picks yet</p>
        </div>
      </Tile>
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
  const ranked = [...sorted].sort((a, b) => b.option_pnl_pct - a.option_pnl_pct);
  const best = ranked[0];
  const max = Math.max(1, ...ranked.map((p) => Math.abs(p.option_pnl_pct)));

  return (
    <TileGrid>
      <KpiTile label="Closed picks" value={sorted.length} />
      <KpiTile label="Win rate" value={`${winRate.toFixed(0)}%`} delta={`${wins}/${sorted.length}`} tone={winRate >= 50 ? "up" : "down"} />
      <KpiTile label="Avg P/L" value={pct(avgPnl)} tone={toneOf(avgPnl)} />
      <KpiTile label="Best pick" value={best.ticker} delta={pct(best.option_pnl_pct)} tone={toneOf(best.option_pnl_pct)} />

      <Tile span={12} title="P/L by pick" meta="best to worst">
        <div className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
          {ranked.map((p) => (
            <BarRow
              key={p.id}
              label={p.ticker}
              value={p.option_pnl_pct}
              max={max}
              display={pct(p.option_pnl_pct)}
              diverging
              title={`$${p.strike} ${p.option_type} ${p.expiry} · entered ${p.entry_date}`}
            />
          ))}
        </div>
      </Tile>

      {/* Pick cards, most recent entry first */}
      {sorted.map((pick) => (
        <div key={pick.id} className="min-w-0 lg:col-span-6">
          <PickCard pick={pick} />
        </div>
      ))}
    </TileGrid>
  );
}
