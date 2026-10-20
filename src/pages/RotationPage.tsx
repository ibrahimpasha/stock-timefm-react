/**
 * Sector rotation — RRG-style relative-strength map over the 11 SPDR sectors
 * (+ XRT) against SPY.
 *
 * Layout + data wiring only; the visuals live in features/rotation/RotationViz
 * because the Command Center's theme-rotation view renders the exact same
 * components against `/market/theme-rotation`.
 */
import { useState } from "react";
import { QueryNotice } from "../components/QueryNotice";
import { GlassPanel, Chip, Segmented } from "../components/Glass";
import { useSectorRotation, type RotationWindow } from "../api/rotation";
import {
  SectorStrip, RotationMap, RotationTimeline, MomentumRanking, InsightLine, AlertFeed,
  RotationScrubber,
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
  const rotationQuery = useSectorRotation(window);
  const { data, isLoading } = rotationQuery;

  const sectors = data?.sectors ?? [];
  const dates = sectors[0]?.history.map((p) => p.date) ?? [];
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedIndex = selectedDate ? dates.indexOf(selectedDate) : -1;
  const idx = selectedIndex >= 0 ? selectedIndex : Math.max(0, dates.length - 1);
  const picker = (
    <Segmented options={WINDOWS} value={window} onChange={setWindow} ariaLabel="Rotation window" />
  );

  const header = (
    <header className="desk-header">
      <div className="desk-header__title">
        <h1>Rotation</h1>
        <p>
          {data?.ok
            ? `Relative strength of the 11 SPDR sectors + XRT vs ${data.benchmark}, as of ${data.as_of}`
            : "Relative strength of the 11 SPDR sectors + XRT vs SPY"}
        </p>
      </div>
      <div className="desk-header__actions">{picker}</div>
    </header>
  );

  if (isLoading && !data) {
    return (
      <div className="desk-page">
        {header}
        <div className="p-8 text-sm text-text-muted animate-pulse">Loading rotation…</div>
      </div>
    );
  }
  if (!data?.ok) {
    return (
      <div className="desk-page">
        {header}
        <GlassPanel title="Sector rotation">
          <QueryNotice queries={[rotationQuery]} label="Sector rotation" />
          {data && <p className="text-sm text-text-muted">{data.reason ?? "Rotation data unavailable"}</p>}
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="desk-page">
      {header}
      <QueryNotice queries={[rotationQuery]} label="Sector rotation" />
      <GlassPanel
        title="Sector overview"
        actions={
          <span className="text-xs text-text-muted">
            Sorted by {window} momentum score
          </span>
        }
      >
        <SectorStrip sectors={sectors} />
      </GlassPanel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,520px)_minmax(0,1.15fr)_minmax(0,0.85fr)] gap-4">
        <GlassPanel title="Rotation map">
          <RotationMap sectors={sectors} atIndex={idx} />
          <RotationScrubber
            dates={dates}
            index={idx}
            onChange={(next) => {
              const nextIndex = typeof next === "function" ? next(idx) : next;
              setSelectedDate(dates[nextIndex] ?? null);
            }}
          />
        </GlassPanel>

        <div className="flex flex-col gap-4 min-w-0">
          <GlassPanel title="Rotation timeline">
            <RotationTimeline sectors={sectors} />
          </GlassPanel>
          <GlassPanel
            title="Momentum ranking"
            actions={<Chip>{window}</Chip>}
          >
            <MomentumRanking sectors={sectors} />
          </GlassPanel>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <GlassPanel title="Insights" actions={<Chip>{window}</Chip>}>
            <ul className="flex flex-col gap-3 text-sm text-text-secondary leading-relaxed max-w-[72ch]">
              {data.insights.map((ins, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 size-1.5 rounded-full shrink-0 bg-text-muted" />
                  <InsightLine ins={ins} />
                </li>
              ))}
            </ul>
          </GlassPanel>
          <GlassPanel
            title="Live rotation alerts"
            actions={<span className="text-xs text-text-muted num">{data.as_of}</span>}
          >
            <AlertFeed alerts={data.alerts} />
          </GlassPanel>
        </div>
      </div>

      <p className="text-xs text-text-muted leading-relaxed max-w-[72ch]">
        {data.sessions} sessions vs {data.benchmark}. RS-Ratio / RS-Momentum are the standard open
        approximation of a relative-rotation graph — quadrant semantics match, absolute values will
        not tie out against proprietary RRG implementations.
      </p>
    </div>
  );
}
