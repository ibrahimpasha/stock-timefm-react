/**
 * Sector rotation — RRG-style relative-strength map over the 11 SPDR sectors
 * (+ XRT) against SPY.
 *
 * Layout + data wiring only; the visuals live in features/rotation/RotationViz
 * because the Command Center's theme-rotation view renders the exact same
 * components against `/market/theme-rotation`.
 */
import { useState } from "react";
import { GlassPanel, Chip, Segmented } from "../components/Glass";
import { useSectorRotation, type RotationWindow } from "../api/rotation";
import {
  SectorStrip, RotationMap, RotationTimeline, MomentumRanking, InsightLine, AlertFeed,
} from "../features/rotation/RotationViz";

const WINDOWS: { value: RotationWindow; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
];

/* ── page ───────────────────────────────────────────────────────────────── */

export function RotationPage() {
  const [window, setWindow] = useState<RotationWindow>("1M");
  const { data, isLoading } = useSectorRotation(window);

  const sectors = data?.sectors ?? [];
  const picker = (
    <Segmented options={WINDOWS} value={window} onChange={setWindow} ariaLabel="Rotation window" />
  );

  if (isLoading && !data) {
    return <div className="p-8 text-sm text-text-muted animate-pulse">loading rotation…</div>;
  }
  if (!data?.ok) {
    return (
      <GlassPanel title="Sector Rotation">
        <p className="text-xs text-text-muted">
          {data?.reason ?? "unavailable"}. Run{" "}
          <code className="num">scripts/backfill_sector_prices.py</code> to populate history.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GlassPanel
        title="Sector Overview"
        actions={
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            sorted by {window} momentum score
          </span>
        }
      >
        <SectorStrip sectors={sectors} />
      </GlassPanel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)] gap-3">
        <GlassPanel title="Rotation Map">
          <RotationMap sectors={sectors} />
        </GlassPanel>

        <div className="flex flex-col gap-3 min-w-0">
          <GlassPanel title="Rotation Timeline" actions={picker}>
            <RotationTimeline sectors={sectors} />
          </GlassPanel>
          <GlassPanel
            title="Sector Momentum Ranking"
            actions={<Chip tone="blue">{window}</Chip>}
          >
            <MomentumRanking sectors={sectors} />
          </GlassPanel>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
          <GlassPanel title="Rotation Insights" actions={<Chip tone="blue">{window}</Chip>}>
            <div className="flex flex-col gap-3 text-xs text-text-secondary leading-relaxed">
              {data.insights.map((ins, i) => (
                <div key={i} className="flex gap-2">
                  <span className="mt-1 size-1.5 rounded-full shrink-0"
                        style={{ background: "var(--accent-green)" }} />
                  <InsightLine ins={ins} />
                </div>
              ))}
            </div>
          </GlassPanel>
          <GlassPanel
            title="Live Rotation Alerts"
            actions={<Chip tone="purple">{data.as_of}</Chip>}
          >
            <AlertFeed alerts={data.alerts} />
          </GlassPanel>
        </div>
      </div>

      <p className="text-[10px] text-text-muted px-1">
        {data.sessions} sessions vs {data.benchmark}. RS-Ratio / RS-Momentum are the standard open
        approximation of a relative-rotation graph — quadrant semantics match, absolute values will
        not tie out against proprietary RRG implementations.
      </p>
    </div>
  );
}
