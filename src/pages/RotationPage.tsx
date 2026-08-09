/**
 * Sector rotation — RRG-style relative-strength map over the 11 SPDR sectors
 * (+ XRT) against SPY.
 *
 * Everything here reads one endpoint (`/market/sector-rotation`), which does
 * the RS math server-side off persisted daily closes. This page is pure
 * presentation: quadrant scatter, timeline, ranking, alerts, narrative.
 *
 * Quadrant semantics are the standard RRG ones — LEADING (strong + rising),
 * WEAKENING (strong + falling), LAGGING (weak + falling), IMPROVING (weak +
 * rising). Money rotates clockwise through them.
 */
import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { GlassPanel, Chip, Segmented } from "../components/Glass";
import { Sparkline } from "../components/CCPrimitives";
import {
  useSectorRotation,
  type RotationWindow,
  type SectorRow,
  type RotationInsight,
} from "../api/rotation";

const WINDOWS: { value: RotationWindow; label: string }[] = [
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
];

/* Per-sector line colors for the timeline + map labels. Chart palettes are the
 * documented exception to the CSS-var rule (SVG series need distinct hues). */
const SECTOR_COLORS: Record<string, string> = {
  XLY: "#f472b6",
  XLK: "#60a5fa",
  XLC: "#c084fc",
  XLB: "#fb923c",
  XRT: "#a78bfa",
  XLV: "#4ade80",
  XLP: "#facc15",
  XLI: "#22d3ee",
  XLE: "#f87171",
  XLF: "#fbbf24",
  XLRE: "#2dd4bf",
  XLU: "#a3e635",
};

/** -10..+10 momentum score → red/amber/green ramp. */
function scoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, (score + 10) / 20));
  if (t < 0.5) {
    const k = t / 0.5;
    return `color-mix(in srgb, var(--accent-orange) ${Math.round(k * 100)}%, var(--accent-red))`;
  }
  const k = (t - 0.5) / 0.5;
  return `color-mix(in srgb, var(--accent-green) ${Math.round(k * 100)}%, var(--accent-orange))`;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/* ── sector strip ───────────────────────────────────────────────────────── */

function SectorStrip({ sectors }: { sectors: SectorRow[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-max pb-1">
        {sectors.map((s) => {
          const up = s.change_pct >= 0;
          const tint = up ? "var(--accent-green)" : "var(--accent-red)";
          return (
            <div
              key={s.ticker}
              className="card px-3 py-2 min-w-[112px] flex-1"
              style={{
                background: `color-mix(in srgb, ${tint} 7%, var(--bg-card))`,
                borderColor: `color-mix(in srgb, ${tint} 25%, var(--border))`,
              }}
            >
              <div className="text-sm font-bold tracking-wide">{s.ticker}</div>
              <div className="text-xs text-text-muted mb-1">{s.short}</div>
              <div className="flex items-center justify-between gap-2">
                <span className="num text-sm font-semibold" style={{ color: tint }}>
                  {pct(s.change_pct)}
                </span>
                <Sparkline points={s.spark} width={44} height={18} color={SECTOR_COLORS[s.ticker]} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── rotation map (RRG scatter) ─────────────────────────────────────────── */

function RotationMap({ sectors }: { sectors: SectorRow[] }) {
  const SIZE = 460;
  const R = SIZE / 2 - 10;

  /* Two things matter for readability here:
   *  - Scale on CURRENT positions, not the whole trail. Trails wander far more
   *    than heads do, so scaling to them squashes every sector into a blob at
   *    the origin. Overshooting trails get clipped to the circle instead.
   *  - Scale each axis independently. RS-Ratio moves in a much tighter band
   *    than RS-Momentum, so a shared span flattens the map into a vertical
   *    line. Real RRGs normalize both axes too. */
  const [spanX, spanY] = useMemo(() => {
    const dx = sectors.map((s) => Math.abs(s.ratio - 100));
    const dy = sectors.map((s) => Math.abs(s.mom - 100));
    return [Math.max(0.4, ...dx) * 1.3, Math.max(0.4, ...dy) * 1.3];
  }, [sectors]);

  /* Sectors bunch tightly near the origin, so raw labels overlap into mush.
   * Greedy declutter: walk heads top-down and push each label below the last
   * one it would collide with, then draw a leader line back to the bubble. */
  const placed = useMemo(() => {
    const toXY = (ratio: number, mom: number) => ({
      x: SIZE / 2 + ((ratio - 100) / spanX) * R,
      y: SIZE / 2 - ((mom - 100) / spanY) * R,
    });
    const rows = sectors.map((s) => {
      const pts = s.tail.map((p) => toXY(p.ratio, p.mom));
      return { s, pts, head: pts[pts.length - 1] };
    });
    const byY = [...rows].sort((a, b) => a.head.y - b.head.y);
    const taken: { x: number; y: number }[] = [];
    const out = new Map<string, number>();
    for (const r of byY) {
      let y = r.head.y;
      while (taken.some((t) => Math.abs(t.y - y) < 20 && Math.abs(t.x - r.head.x) < 48)) {
        y += 20;
      }
      y = Math.max(18, Math.min(SIZE - 16, y));   // keep the label inside the frame
      taken.push({ x: r.head.x, y });
      out.set(r.s.ticker, y);
    }
    return rows.map((r) => ({ ...r, labelY: out.get(r.s.ticker) ?? r.head.y }));
  }, [sectors, spanX, spanY, R]);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[480px]" role="img"
           aria-label="Relative rotation graph: sector momentum versus relative strength">
        <defs>
          <radialGradient id="rrg-fade">
            <stop offset="55%" stopColor="var(--accent-blue)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
          </radialGradient>
          <clipPath id="rrg-clip">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} />
          </clipPath>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#rrg-fade)" stroke="var(--border)" />
        <line x1={SIZE / 2} y1="8" x2={SIZE / 2} y2={SIZE - 8} stroke="var(--border)" />
        <line x1="8" y1={SIZE / 2} x2={SIZE - 8} y2={SIZE / 2} stroke="var(--border)" />

        {/* quadrant captions */}
        <text x="26" y="34" className="text-[11px]" fill="var(--accent-cyan)" fontWeight="600">IMPROVING</text>
        <text x="26" y="48" className="text-[10px]" fill="var(--text-muted)">Momentum Accelerating</text>
        <text x={SIZE - 26} y="34" textAnchor="end" className="text-[11px]" fill="var(--accent-green)" fontWeight="600">LEADING</text>
        <text x={SIZE - 26} y="48" textAnchor="end" className="text-[10px]" fill="var(--text-muted)">Strong Momentum</text>
        <text x="26" y={SIZE - 32} className="text-[11px]" fill="var(--accent-red)" fontWeight="600">LAGGING</text>
        <text x="26" y={SIZE - 18} className="text-[10px]" fill="var(--text-muted)">Weak Momentum</text>
        <text x={SIZE - 26} y={SIZE - 32} textAnchor="end" className="text-[11px]" fill="var(--accent-orange)" fontWeight="600">WEAKENING</text>
        <text x={SIZE - 26} y={SIZE - 18} textAnchor="end" className="text-[10px]" fill="var(--text-muted)">Momentum Fading</text>

        {placed.map(({ s, head, pts, labelY }) => {
          const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
          return (
            <g key={s.ticker}>
              {/* rotation trail — where the sector came from */}
              <path d={path} fill="none" stroke={scoreColor(s.score)} strokeWidth="1.2"
                    opacity="0.3" clipPath="url(#rrg-clip)" />
              <circle cx={head.x} cy={head.y} r="9" fill={scoreColor(s.score)} opacity="0.85" />
              {/* leader line when the label had to be nudged off its bubble */}
              {Math.abs(labelY - head.y) > 4 && (
                <line x1={head.x + 8} y1={head.y} x2={head.x + 13} y2={labelY - 4}
                      stroke={SECTOR_COLORS[s.ticker]} strokeWidth="1" opacity="0.45" />
              )}
              <text x={head.x + 15} y={labelY} className="text-[11px]" fontWeight="700"
                    fill={SECTOR_COLORS[s.ticker]}>
                {s.ticker}
              </text>
              <text x={head.x + 15} y={labelY + 10} className="text-[10px]" fill="var(--text-muted)">
                {pct(s.change_pct)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Momentum score (color)</span>
        <div className="h-2 w-48 rounded-full"
             style={{ background: "linear-gradient(90deg, var(--accent-red), var(--accent-orange), var(--accent-green))" }} />
        <div className="flex justify-between w-48 text-[10px] text-text-muted num">
          <span>-10</span><span>0</span><span>+10</span>
        </div>
        <p className="text-[10px] text-text-muted italic mt-1 text-center">
          Position = relative strength × momentum. Color = momentum score.
        </p>
      </div>
    </div>
  );
}

/* ── timeline ───────────────────────────────────────────────────────────── */

function RotationTimeline({ sectors }: { sectors: SectorRow[] }) {
  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const s of sectors) {
      for (const p of s.history) {
        const row = byDate.get(p.date) ?? { date: p.date };
        row[s.ticker] = p.ratio;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [sectors]);

  if (!data.length) return <p className="text-xs text-text-muted">No history yet.</p>;

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 56, bottom: 4, left: 0 }}>
          {/* NB: do NOT pass `ticks` here — recharts narrows the category domain
              to just those entries and every line collapses to the left edge. */}
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                 tickLine={false} axisLine={{ stroke: "var(--border)" }}
                 interval="preserveStartEnd" minTickGap={80} />
          <YAxis hide domain={["dataMin - 0.3", "dataMax + 0.3"]} />
          <Tooltip
            contentStyle={{
              background: "var(--bg-card-hover)", border: "1px solid var(--border)",
              borderRadius: 8, fontSize: 11,
            }}
            labelStyle={{ color: "var(--text-secondary)" }}
            formatter={(v, name) => [Number(v).toFixed(2), String(name)]}
          />
          {sectors.map((s) => (
            <Line key={s.ticker} type="monotone" dataKey={s.ticker} dot={false}
                  stroke={SECTOR_COLORS[s.ticker]} strokeWidth={1.5}
                  opacity={s.rank <= 3 || s.rank > sectors.length - 3 ? 1 : 0.42} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-text-muted mt-1">
        Relative strength vs SPY (100 = in line with its own trend). Leaders and laggards highlighted.
      </p>
    </div>
  );
}

/* ── ranking ────────────────────────────────────────────────────────────── */

function MomentumRanking({ sectors }: { sectors: SectorRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted uppercase tracking-wider text-[10px]">
            <th className="text-left font-medium py-1.5 pr-2">#</th>
            <th className="text-left font-medium py-1.5">Sector</th>
            <th className="text-left font-medium py-1.5 px-2">Momentum</th>
            <th className="text-right font-medium py-1.5 px-2">Score</th>
            <th className="text-right font-medium py-1.5 pl-2">Chg</th>
          </tr>
        </thead>
        <tbody>
          {sectors.map((s) => {
            const width = ((s.score + 10) / 20) * 100;
            return (
              <tr key={s.ticker} className="border-t border-border">
                <td className="py-1.5 pr-2 num text-text-muted">{s.rank}</td>
                <td className="py-1.5 whitespace-nowrap">
                  <span className="font-bold" style={{ color: SECTOR_COLORS[s.ticker] }}>{s.ticker}</span>
                  <span className="text-text-muted ml-1.5">{s.label}</span>
                </td>
                <td className="py-1.5 px-2 w-[38%]">
                  <div className="h-1.5 rounded-full bg-bg-card-hover overflow-hidden">
                    <div className="h-full rounded-full"
                         style={{ width: `${width}%`, background: scoreColor(s.score) }} />
                  </div>
                </td>
                <td className="py-1.5 px-2 text-right num font-semibold"
                    style={{ color: scoreColor(s.score) }}>
                  {s.score.toFixed(1)}
                </td>
                <td className="py-1.5 pl-2 text-right num"
                    style={{ color: s.change_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {pct(s.change_pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── insights + alerts ──────────────────────────────────────────────────── */

function InsightLine({ ins }: { ins: RotationInsight }) {
  const name = (t: string, l: string) => (
    <span style={{ color: SECTOR_COLORS[t] }} className="font-medium">{l}</span>
  );
  if (ins.kind === "rotation") {
    return (
      <p>
        Money is rotating out of{" "}
        {ins.out.map((s, i) => (
          <span key={s.ticker}>{i > 0 && " and "}{name(s.ticker, s.label)}</span>
        ))}{" "}
        and into{" "}
        {ins.into.map((s, i) => (
          <span key={s.ticker}>{i > 0 && " and "}{name(s.ticker, s.label)}</span>
        ))}.
      </p>
    );
  }
  const strongest = ins.kind === "strongest";
  return (
    <p>
      {name(ins.ticker, ins.label)} ({ins.ticker}) has the{" "}
      {strongest ? "strongest" : "weakest"} momentum score ({ins.score.toFixed(1)}),{" "}
      {pct(ins.change_pct)} this window.
    </p>
  );
}

function AlertFeed({ alerts }: { alerts: { kind: string; ticker: string; label: string; date: string; text: string }[] }) {
  if (!alerts.length) return <p className="text-xs text-text-muted">No quadrant changes in the window.</p>;
  return (
    <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto">
      {alerts.map((a, i) => {
        const tone = a.kind === "NEW LEADER" ? "var(--accent-green)"
          : a.kind === "IMPROVING" ? "var(--accent-cyan)" : "var(--accent-orange)";
        return (
          <div key={`${a.ticker}-${a.date}-${i}`} className="pl-2.5 py-1"
               style={{ borderLeft: `2px solid ${tone}` }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: tone }}>
              {a.kind}
            </div>
            <div className="text-xs">
              <span className="font-bold" style={{ color: SECTOR_COLORS[a.ticker] }}>{a.ticker}</span>
              <span className="text-text-muted ml-1.5">{a.label}</span>
            </div>
            <div className="text-[11px] text-text-secondary">{a.text}</div>
            <div className="text-[10px] text-text-muted num">{a.date}</div>
          </div>
        );
      })}
    </div>
  );
}

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
