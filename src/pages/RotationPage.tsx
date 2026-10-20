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
import { TileGrid, Tile, KpiTile, toneOf } from "../components/Cockpit";
import { useSectorRotation, type RotationWindow } from "../api/rotation";
import {
  SectorStrip, RotationMap, RotationTimeline, MomentumRanking, InsightLine, AlertFeed,
  RotationScrubber, pct,
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
  const best = sectors.reduce<(typeof sectors)[number] | null>((b, s) => (!b || s.score > b.score ? s : b), null);
  const worst = sectors.reduce<(typeof sectors)[number] | null>((b, s) => (!b || s.score < b.score ? s : b), null);
  const upCount = sectors.filter((s) => s.change_pct > 0).length;
  const leading = sectors.filter((s) => s.quadrant === "LEADING").length;
  const improving = sectors.filter((s) => s.quadrant === "IMPROVING").length;

  return (
    <div className="desk-page">
      {header}
      <QueryNotice queries={[rotationQuery]} label="Sector rotation" />

      <TileGrid>
        <KpiTile
          label="Strongest momentum"
          value={best?.ticker ?? "—"}
          delta={best ? best.score.toFixed(1) : undefined}
          tone={toneOf(best?.score)}
          sub={best ? `${best.label} · ${pct(best.change_pct)}` : undefined}
        />
        <KpiTile
          label="Weakest momentum"
          value={worst?.ticker ?? "—"}
          delta={worst ? worst.score.toFixed(1) : undefined}
          tone={toneOf(worst?.score)}
          sub={worst ? `${worst.label} · ${pct(worst.change_pct)}` : undefined}
        />
        <KpiTile
          label={`Sectors up over ${window}`}
          value={<>{upCount}<span className="text-base text-text-muted">/{sectors.length}</span></>}
          sub={`${leading} leading · ${improving} improving`}
        />
        <KpiTile
          label="Quadrant changes"
          value={data.alerts.length}
          sub={`${data.sessions} sessions vs ${data.benchmark}`}
        />

        <Tile span={8} title="Sectors" meta={`${window} change · fill = size of move · sorted by momentum`}>
          <SectorStrip sectors={sectors} />
        </Tile>

        <Tile span={4} title="The read" meta={<><span className="num">{window}</span> · as of <span className="num">{data.as_of}</span></>}>
          {lead ? (
            <>
              <div className="text-base font-semibold leading-snug text-text-primary">
                <InsightLine ins={lead} />
              </div>
              {rest.length > 0 && (
                <ul className="flex flex-col gap-2 text-sm leading-relaxed text-text-secondary">
                  {rest.map((ins, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-text-muted" />
                      <InsightLine ins={ins} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-text-muted">No rotation read for this window.</p>
          )}
        </Tile>

        <Tile span={7} title="Rotation map" meta="RS-Ratio across, RS-Momentum up · scrub or play to replay">
          <RotationMap sectors={sectors} atIndex={idx} />
          <RotationScrubber
            dates={dates}
            index={idx}
            onChange={(next) => {
              const nextIndex = typeof next === "function" ? next(idx) : next;
              setSelectedDate(dates[nextIndex] ?? null);
            }}
          />
        </Tile>

        <Tile span={5} title="Momentum ranking" meta={<>score −10 to +10 over <span className="num">{window}</span></>}>
          <MomentumRanking sectors={sectors} />
        </Tile>

        <Tile span={7} title="Rotation timeline" meta="RS-Ratio per sector over the window">
          <RotationTimeline sectors={sectors} />
        </Tile>

        <Tile span={5} title="Quadrant changes" meta={<>as of <span className="num">{data.as_of}</span></>}>
          <AlertFeed alerts={data.alerts} />
        </Tile>
      </TileGrid>

      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary">Method</summary>
        <p className="mt-2 max-w-[72ch] leading-relaxed">
          {data.sessions} sessions vs {data.benchmark}. RS-Ratio / RS-Momentum are the standard open
          approximation of a relative-rotation graph — quadrant semantics match, absolute values will
          not tie out against proprietary RRG implementations.
        </p>
      </details>
    </div>
  );
}
