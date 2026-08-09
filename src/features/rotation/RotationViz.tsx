/**
 * Shared RRG rotation visuals.
 *
 * Sectors (ETF price vs SPY) and intel themes (share of daily option premium)
 * are the same shape of question — what is money rotating into — and the
 * backend returns an identical payload for both, so they render through one
 * set of components rather than two that drift apart.
 */
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Play, Pause } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Sparkline } from "../../components/CCPrimitives";
import type { SectorRow, RotationInsight } from "../../api/rotation";

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

/* Themes aren't tickers, so anything not in the sector map gets a stable color
 * picked from the same palette by name hash — same key always same hue. */
const PALETTE = Object.values(SECTOR_COLORS);
export function seriesColor(key: string): string {
  if (SECTOR_COLORS[key]) return SECTOR_COLORS[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** -10..+10 momentum score → red/amber/green ramp. */
export function scoreColor(score: number): string {
  const t = Math.max(0, Math.min(1, (score + 10) / 20));
  if (t < 0.5) {
    const k = t / 0.5;
    return `color-mix(in srgb, var(--accent-orange) ${Math.round(k * 100)}%, var(--accent-red))`;
  }
  const k = (t - 0.5) / 0.5;
  return `color-mix(in srgb, var(--accent-green) ${Math.round(k * 100)}%, var(--accent-orange))`;
}

export const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/* ── sector strip ───────────────────────────────────────────────────────── */

export function SectorStrip({ sectors }: { sectors: SectorRow[] }) {
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
                <Sparkline points={s.spark} width={44} height={18} color={seriesColor(s.ticker)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── rotation map (RRG scatter) ─────────────────────────────────────────── */

/** Catmull-Rom through the points, emitted as cubic beziers.
 *  A raw polyline of daily readings reads as jagged noise; the spline shows
 *  the arc of rotation, which is the thing the chart is actually about. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

const TRAIL = 6;   // how many prior readings the comet tail shows

/**
 * RRG scatter. `atIndex` scrubs the whole board back through history — every
 * theme jumps to where it stood that day and the trail follows it, which is
 * how you watch a rotation actually happen rather than inferring it from a
 * static snapshot.
 *
 * Scaling is fixed across the WHOLE window (not per frame) so positions are
 * comparable as you scrub — a per-frame rescale would make everything appear
 * to jitter in place while the axes silently moved underneath.
 */
export function RotationMap({
  sectors,
  atIndex,
  animate = true,
}: {
  sectors: SectorRow[];
  atIndex?: number;
  animate?: boolean;
}) {
  const SIZE = 460;
  const R = SIZE / 2 - 14;

  /* Scale each axis independently and over the full window: RS-Ratio moves in
   * a much tighter band than RS-Momentum, so a shared span flattens the map
   * into a vertical line, and a per-frame span would break scrub comparability. */
  const [spanX, spanY] = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const s of sectors) {
      for (const p of s.history.length ? s.history : s.tail) {
        xs.push(Math.abs(p.ratio - 100));
        ys.push(Math.abs(p.mom - 100));
      }
    }
    // p92, not max: one wild historical day would otherwise set the scale and
    // squash every current position into a blob at the origin. Anything beyond
    // is clipped to the circle, which is the honest way to show an outlier.
    const p92 = (v: number[]) => {
      if (!v.length) return 1;
      const sorted = [...v].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.92))];
    };
    return [Math.max(0.4, p92(xs)) * 1.1, Math.max(0.4, p92(ys)) * 1.1];
  }, [sectors]);

  const placed = useMemo(() => {
    const toXY = (ratio: number, mom: number) => ({
      x: SIZE / 2 + ((ratio - 100) / spanX) * R,
      y: SIZE / 2 - ((mom - 100) / spanY) * R,
    });
    const rows = sectors.map((s) => {
      const series = s.history.length ? s.history : s.tail;
      const i = atIndex == null ? series.length - 1
        : Math.max(0, Math.min(series.length - 1, atIndex));
      const trail = series.slice(Math.max(0, i - TRAIL + 1), i + 1).map((p) => toXY(p.ratio, p.mom));
      const cur = series[i];
      return {
        s,
        pts: trail,
        head: trail[trail.length - 1] ?? toXY(s.ratio, s.mom),
        quadrant: cur ? quadrantOf(cur.ratio, cur.mom) : s.quadrant,
        date: cur?.date ?? "",
      };
    });
    /* Labels bunch near the origin, so greedily push each below the last one it
     * collides with and draw a leader line back to its bubble. */
    const byY = [...rows].sort((a, b) => a.head.y - b.head.y);
    const taken: { x: number; y: number }[] = [];
    const out = new Map<string, number>();
    for (const r of byY) {
      let y = r.head.y;
      while (taken.some((t) => Math.abs(t.y - y) < 20 && Math.abs(t.x - r.head.x) < 52)) {
        y += 20;
      }
      y = Math.max(20, Math.min(SIZE - 16, y));
      taken.push({ x: r.head.x, y });
      out.set(r.s.ticker, y);
    }
    return rows.map((r) => ({ ...r, labelY: out.get(r.s.ticker) ?? r.head.y }));
  }, [sectors, spanX, spanY, R, atIndex]);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full block" role="img"
           aria-label="Relative rotation graph: momentum versus relative strength">
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
        <line x1={SIZE / 2} y1={SIZE / 2 - R} x2={SIZE / 2} y2={SIZE / 2 + R} stroke="var(--border)" />
        <line x1={SIZE / 2 - R} y1={SIZE / 2} x2={SIZE / 2 + R} y2={SIZE / 2} stroke="var(--border)" />

        {/* quadrant captions */}
        <text x="22" y="30" className="text-[11px]" fill="var(--accent-cyan)" fontWeight="600">IMPROVING</text>
        <text x="22" y="43" className="text-[9px]" fill="var(--text-muted)">momentum accelerating</text>
        <text x={SIZE - 22} y="30" textAnchor="end" className="text-[11px]" fill="var(--accent-green)" fontWeight="600">LEADING</text>
        <text x={SIZE - 22} y="43" textAnchor="end" className="text-[9px]" fill="var(--text-muted)">strong momentum</text>
        <text x="22" y={SIZE - 26} className="text-[11px]" fill="var(--accent-red)" fontWeight="600">LAGGING</text>
        <text x="22" y={SIZE - 13} className="text-[9px]" fill="var(--text-muted)">weak momentum</text>
        <text x={SIZE - 22} y={SIZE - 26} textAnchor="end" className="text-[11px]" fill="var(--accent-orange)" fontWeight="600">WEAKENING</text>
        <text x={SIZE - 22} y={SIZE - 13} textAnchor="end" className="text-[9px]" fill="var(--text-muted)">momentum fading</text>

        {/* trails first, so bubbles always sit on top of every line */}
        <g clipPath="url(#rrg-clip)">
          {placed.map(({ s, pts }) => (
            <path key={s.ticker} d={smoothPath(pts)} fill="none"
                  stroke={seriesColor(s.ticker)} strokeWidth="1.4" strokeLinecap="round"
                  opacity="0.28" />
          ))}
        </g>

        {placed.map(({ s, head, labelY }) => (
          <g key={s.ticker}>
            {Math.abs(labelY - head.y) > 4 && (
              <line x1={head.x + 8} y1={head.y} x2={head.x + 13} y2={labelY - 4}
                    stroke={seriesColor(s.ticker)} strokeWidth="1" opacity="0.4"
                    style={animate ? { transition: "all 260ms ease-out" } : undefined} />
            )}
            {/* CSS transform on the group is what makes scrubbing animate —
                transitioning cx/cy directly is not reliable across browsers. */}
            <g style={{
                 transform: `translate(${head.x}px, ${head.y}px)`,
                 transition: animate ? "transform 260ms ease-out" : "none",
               }}>
              <circle r="9" fill={scoreColor(s.score)} opacity="0.9" />
              <circle r="9" fill="none" stroke={seriesColor(s.ticker)} strokeWidth="1.5" opacity="0.7" />
            </g>
            <g style={{
                 transform: `translate(${head.x}px, ${labelY}px)`,
                 transition: animate ? "transform 260ms ease-out" : "none",
               }}>
              <text x="15" y="0" className="text-[11px]" fontWeight="700" fill={seriesColor(s.ticker)}>
                {s.ticker.length > 12 ? s.ticker.slice(0, 12) : s.ticker}
              </text>
              <text x="15" y="10" className="text-[9px]" fill="var(--text-muted)">
                {pct(s.change_pct)}
              </text>
            </g>
          </g>
        ))}
      </svg>

      <div className="mt-2 flex items-center justify-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">weak</span>
        <div className="h-1.5 w-32 rounded-full"
             style={{ background: "linear-gradient(90deg, var(--accent-red), var(--accent-orange), var(--accent-green))" }} />
        <span className="text-[10px] uppercase tracking-wider text-text-muted">strong</span>
        <span className="text-[10px] text-text-muted">· fill = momentum score, ring = identity</span>
      </div>
    </div>
  );
}

/** Local copy of the server's quadrant rule, for scrubbed frames. */
function quadrantOf(ratio: number, mom: number): SectorRow["quadrant"] {
  if (ratio >= 100) return mom >= 100 ? "LEADING" : "WEAKENING";
  return mom >= 100 ? "IMPROVING" : "LAGGING";
}

/**
 * Time slider under the map. Scrubbing replays the rotation; play walks it
 * forward and stops at the end rather than looping, so the board is left
 * showing today.
 */
export function RotationScrubber({
  dates,
  index,
  onChange,
}: {
  dates: string[];
  index: number;
  /** setState-style so play can advance from the latest value, not a stale one. */
  onChange: Dispatch<SetStateAction<number>>;
}) {
  const [playing, setPlaying] = useState(false);
  const last = dates.length - 1;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      onChange((prev: number) => {
        // guard lives here so play always halts on the final frame
        if (prev >= last) {
          setPlaying(false);
          return last;
        }
        return prev + 1;
      });
    }, 320);
    return () => clearInterval(id);
  }, [playing, last, onChange]);

  if (dates.length < 2) return null;
  return (
    <div className="flex items-center gap-2 mt-1">
      <button
        type="button"
        onClick={() => setPlaying((p) => (index >= last ? (onChange(0), true) : !p))}
        aria-label={playing ? "Pause rotation replay" : "Play rotation replay"}
        className="shrink-0 size-6 rounded-full flex items-center justify-center transition-colors
                   bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25"
      >
        {playing ? <Pause size={11} /> : <Play size={11} />}
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(e) => { setPlaying(false); onChange(Number(e.target.value)); }}
        aria-label="Scrub rotation history"
        className="flex-1 accent-accent-cyan h-1 cursor-pointer"
      />
      <span className="num text-[10px] text-text-muted w-[74px] text-right">
        {dates[index] ?? ""}
      </span>
    </div>
  );
}

/* ── timeline ───────────────────────────────────────────────────────────── */

export function RotationTimeline({ sectors }: { sectors: SectorRow[] }) {
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
                  stroke={seriesColor(s.ticker)} strokeWidth={1.5}
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

export function MomentumRanking({ sectors }: { sectors: SectorRow[] }) {
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
                  <span className="font-bold" style={{ color: seriesColor(s.ticker) }}>{s.ticker}</span>
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

export function InsightLine({ ins }: { ins: RotationInsight }) {
  const name = (t: string, l: string) => (
    <span style={{ color: seriesColor(t) }} className="font-medium">{l}</span>
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

export function AlertFeed({ alerts }: { alerts: { kind: string; ticker: string; label: string; date: string; text: string }[] }) {
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
              <span className="font-bold" style={{ color: seriesColor(a.ticker) }}>{a.ticker}</span>
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

