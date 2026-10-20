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
import { Segmented } from "../components/Glass";
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
        <QueryNotice queries={[rotationQuery]} label="Sector rotation" />
        {data && <p className="callout max-w-[72ch]">{data.reason ?? "Rotation data unavailable"}</p>}
      </div>
    );
  }

  const [lead, ...rest] = data.insights;

  return (
    <div className="desk-page">
      {header}
      <QueryNotice queries={[rotationQuery]} label="Sector rotation" />

      {/* lead: the rotation story in one sentence */}
      {lead && (
        <section className="flex flex-col gap-4 max-w-[72ch]">
          <span className="text-sm text-text-muted">
            <span className="num">{window}</span> read · as of <span className="num">{data.as_of}</span>
          </span>
          <div className="headline">
            <InsightLine ins={lead} />
          </div>
          {rest.length > 0 && (
            <ul className="flex flex-col gap-2 text-base leading-relaxed text-text-secondary">
              {rest.map((ins, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-2.5 size-1.5 rounded-full shrink-0 bg-text-muted" />
                  <InsightLine ins={ins} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="section-title">Sectors</h2>
          <p className="section-sub">Sorted by {window} momentum score</p>
        </div>
        <div className="border-y border-border py-4">
          <SectorStrip sectors={sectors} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,560px)_minmax(0,1fr)] gap-8">
        <section className="flex flex-col gap-3 min-w-0">
          <div>
            <h2 className="section-title">Rotation map</h2>
            <p className="section-sub">Relative strength across, momentum up. Scrub or play to replay the window.</p>
          </div>
          <div className="card">
            <RotationMap sectors={sectors} atIndex={idx} />
            <RotationScrubber
              dates={dates}
              index={idx}
              onChange={(next) => {
                const nextIndex = typeof next === "function" ? next(idx) : next;
                setSelectedDate(dates[nextIndex] ?? null);
              }}
            />
          </div>
        </section>

        <div className="flex flex-col gap-8 min-w-0">
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="section-title">Momentum ranking</h2>
              <p className="section-sub">Score from −10 to +10 over <span className="num">{window}</span></p>
            </div>
            <div className="card">
              <MomentumRanking sectors={sectors} />
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="section-title">Rotation timeline</h2>
              <p className="section-sub">RS-Ratio per sector over the window</p>
            </div>
            <div className="card">
              <RotationTimeline sectors={sectors} />
            </div>
          </section>
        </div>
      </div>

      <section className="flex flex-col gap-3 max-w-4xl">
        <div>
          <h2 className="section-title">Quadrant changes</h2>
          <p className="section-sub">Live rotation alerts, as of <span className="num">{data.as_of}</span></p>
        </div>
        <AlertFeed alerts={data.alerts} />
      </section>

      <p className="text-xs text-text-muted leading-relaxed max-w-[72ch]">
        {data.sessions} sessions vs {data.benchmark}. RS-Ratio / RS-Momentum are the standard open
        approximation of a relative-rotation graph — quadrant semantics match, absolute values will
        not tie out against proprietary RRG implementations.
      </p>
    </div>
  );
}
