/**
 * BounceBoard — crash-bounce resilience view.
 *
 * 2026 keeps producing market-wide stress days (Jan 20, the March -9%
 * cluster, Jun 5/10, mid-July). Every one is a natural experiment: which
 * names get bought back hardest? Backed by GET /api/market/resilience
 * (src/resilience.py in the backend) — SPY stress events, per-ticker
 * drawdown/bounce/recovery, 0-100 composite, intel-taxonomy theme rollup.
 * Tables rebuilt daily on the technicals timer.
 */
import { useMemo, useRef, useState } from "react";
import { QueryNotice } from "../../components/QueryNotice";
import { RefreshCw } from "lucide-react";
import { TileGrid, Tile, KpiTile, BarRow, HeatTile, CockpitButton } from "../../components/Cockpit";
import { Segmented } from "../../components/Glass";
import { useAppStore } from "../../store/useAppStore";
import {
  useResilience,
  useResilienceRefresh,
  useIntradayResilience,
  useIntradayBars,
  useResilienceInsights,
  type ResilienceTicker,
  type IntradayTicker,
  type InsightChip,
} from "../../api/resilience";

function fmtPct(v: number | null | undefined, dp = 0): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(dp)}%`;
}

/** Score band as a cockpit tone: green above 60, red below 25, blue between. */
const scoreBand = (score: number) => (score >= 60 ? "up" : score < 25 ? "down" : "info");

function TickerRow({ r, rank }: { r: ResilienceTicker; rank: number }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <BarRow
      label={r.ticker}
      value={r.score}
      max={100}
      tone={scoreBand(r.score)}
      display={r.score.toFixed(0)}
      trailing={fmtPct(r.avg_bounce_5d)}
      onClick={() => setActiveTicker(r.ticker)}
      title={
        `#${rank} ${r.ticker} · ${r.theme || r.category || "—"}\n` +
        `bounce 5d ${fmtPct(r.avg_bounce_5d)} (share of own drawdown recovered 5 sessions after its trough)\n` +
        `recovered ${fmtPct(r.recovery_rate)} of events within 20 sessions\n` +
        `drawdown vs SPY ${r.avg_rel_dd != null ? `${r.avg_rel_dd.toFixed(1)}x` : "—"} (under 1x fell less than the market)\n` +
        `${r.n_events} events · avg own drawdown ${r.avg_own_dd_pct}%`
      }
    />
  );
}

/* ── Intraday overlay ─────────────────────────────────────── */

// Fixed slot hues for user-selected tickers (identity follows the entity —
// a ticker keeps its hue while selected). References stay in muted ink.
const SLOT_VARS = [
  "var(--accent-blue)",
  "var(--accent-orange)",
  "var(--accent-fuchsia)",
  "var(--accent-cyan)",
];
const MAX_OVERLAY = 4;

function etTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso.slice(11, 16);
  }
}

interface OverlaySeriesMeta {
  key: string;
  label: string;
  color: string;
  dashed: boolean;
}

interface Segment {
  date: string;
  times: string[];
  series: Record<string, (number | null)[]>;
}

const SEG_GAP = 2; // virtual bar slots between concatenated sessions

function OverlayChart({
  segments,
  meta,
  faded,
}: {
  segments: Segment[];
  meta: OverlaySeriesMeta[];
  faded: boolean;
}) {
  const [hoverI, setHoverI] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 720;
  const H = 240;
  const PAD = { l: 44, r: 76, t: 10, b: 22 };

  // Flatten sessions along x with a small gap slot between them. Each
  // session is already % vs ITS OWN prev close, so segments are comparable.
  const slots: ({ date: string; ts: string } | null)[] = [];
  const segBounds: { date: string; start: number; end: number }[] = [];
  segments.forEach((g, si) => {
    if (si > 0) for (let k = 0; k < SEG_GAP; k++) slots.push(null);
    const start = slots.length;
    g.times.forEach((ts) => slots.push({ date: g.date, ts }));
    segBounds.push({ date: g.date, start, end: slots.length - 1 });
  });
  const flat = (key: string): (number | null)[] => {
    const out: (number | null)[] = [];
    segments.forEach((g, si) => {
      if (si > 0) for (let k = 0; k < SEG_GAP; k++) out.push(null);
      const vals = g.series[key];
      g.times.forEach((_, i) => out.push(vals ? vals[i] : null));
    });
    return out;
  };
  const series = meta
    .map((m) => ({ ...m, values: flat(m.key) }))
    .filter((s) => s.values.some((v) => v != null));

  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  if (!slots.length || !all.length) {
    return (
      <div className="h-[240px] flex items-center justify-center text-xs text-text-muted">
        no bars stored for this selection
      </div>
    );
  }
  const yMin = Math.min(...all, 0);
  const yMax = Math.max(...all, 0);
  const yPadFrac = (yMax - yMin) * 0.08 || 0.001;
  const lo = yMin - yPadFrac;
  const hi = yMax + yPadFrac;
  const x = (i: number) => PAD.l + (i / Math.max(1, slots.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  // Path BREAKS at nulls (the segment gaps) — restart with M, never bridge.
  const path = (vals: (number | null)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += (pen ? " L " : " M ") + `${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d.trim();
  };

  const step = Math.max(0.005, Math.round(((hi - lo) / 4) * 200) / 200);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v);

  const single = segments.length === 1;
  const timeTickIdx = single
    ? slots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => {
          if (!s) return false;
          const m = etTime(s.ts);
          return m.endsWith(":30") && parseInt(m) % 2 === 1;
        })
        .map(({ i }) => i)
    : [];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (px - PAD.l) / (W - PAD.l - PAD.r);
    let i = Math.round(frac * (slots.length - 1));
    i = Math.max(0, Math.min(slots.length - 1, i));
    // Snap off gap slots to the nearest real bar.
    if (slots[i] == null) {
      let lo_i = i, hi_i = i;
      while (lo_i > 0 && slots[lo_i] == null) lo_i--;
      while (hi_i < slots.length - 1 && slots[hi_i] == null) hi_i++;
      i = slots[lo_i] != null && i - lo_i <= hi_i - i ? lo_i : hi_i;
    }
    setHoverI(slots[i] != null ? i : null);
  };

  const hover = hoverI != null && slots[hoverI] != null ? hoverI : null;
  const tipRows =
    hover != null
      ? series
          .map((s) => ({ ...s, v: s.values[hover] }))
          .filter((s) => s.v != null)
          .sort((a, b) => (b.v as number) - (a.v as number))
      : [];

  return (
    <div className="relative" style={{ opacity: faded ? 0.5 : 1, transition: "opacity 150ms" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverI(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)}
              stroke="var(--border)" strokeWidth={v === 0 ? 1.5 : 1}
              opacity={v === 0 ? 0.9 : 0.45}
            />
            <text
              x={PAD.l - 6} y={y(v) + 3} textAnchor="end"
              fontSize="9" fill="var(--text-muted)" className="num"
            >
              {(v * 100).toFixed(1)}%
            </text>
          </g>
        ))}
        {/* session separators + per-day labels (multi) or ET times (single) */}
        {!single &&
          segBounds.map((b, bi) => (
            <g key={b.date}>
              {bi > 0 && (
                <line
                  x1={x(b.start) - (x(1) - x(0))} x2={x(b.start) - (x(1) - x(0))}
                  y1={PAD.t} y2={H - PAD.b}
                  stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3"
                />
              )}
              <text
                x={x(Math.floor((b.start + b.end) / 2))} y={H - 6}
                textAnchor="middle" fontSize="9" fill="var(--text-muted)" className="num"
              >
                {b.date.slice(5)}
              </text>
            </g>
          ))}
        {single &&
          timeTickIdx.map((i) => (
            <text
              key={i} x={x(i)} y={H - 6} textAnchor="middle"
              fontSize="9" fill="var(--text-muted)" className="num"
            >
              {etTime((slots[i] as { ts: string }).ts)}
            </text>
          ))}
        {series.map((s) => (
          <path
            key={s.key}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={s.dashed ? "5 4" : undefined}
          />
        ))}
        {series.map((s) => {
          let lastI = -1;
          s.values.forEach((v, i) => {
            if (v != null) lastI = i;
          });
          const v = lastI >= 0 ? s.values[lastI] : null;
          if (v == null) return null;
          return (
            <g key={`e-${s.key}`}>
              <circle cx={x(lastI)} cy={y(v)} r={4} fill={s.color}
                      stroke="var(--bg-card)" strokeWidth={2} />
              <text x={x(lastI) + 7} y={y(v) + 3} fontSize="9"
                    fill="var(--text-secondary)">
                {s.label} <tspan className="num">{(v * 100).toFixed(1)}%</tspan>
              </text>
            </g>
          );
        })}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b}
                stroke="var(--text-muted)" strokeWidth={1} opacity={0.6} />
        )}
      </svg>
      {hover != null && tipRows.length > 0 && (
        <div
          className="absolute top-2 rounded-md border border-border px-2.5 py-1.5 text-xs pointer-events-none"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: x(hover) > W * 0.6 ? "translateX(-105%)" : "translateX(8px)",
            background: "var(--bg-card-hover)",
            backdropFilter: "none",
          }}
        >
          <div className="num text-text-muted mb-0.5">
            {(slots[hover] as { date: string }).date.slice(5)}{" "}
            {etTime((slots[hover] as { ts: string }).ts)} ET
          </div>
          {tipRows.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                style={{
                  width: 10, height: 0,
                  borderTop: `2px ${s.dashed ? "dashed" : "solid"} ${s.color}`,
                }}
              />
              <span className="num font-semibold text-text-primary">
                {((s.v as number) * 100).toFixed(2)}%
              </span>
              <span className="text-text-muted">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightChips({
  chips,
  onPick,
  showBounce,
}: {
  chips: InsightChip[];
  onPick: (t: string) => void;
  showBounce?: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <button
          key={c.ticker}
          type="button"
          onClick={() => onPick(c.ticker)}
          className="num rounded-full border border-border px-2 py-0.5 text-xs hover:bg-bg-card-hover"
          title={`${c.theme || ""} · dip ${c.trough_pct}% · ${
            c.bounce_close != null ? Math.round(Math.min(c.bounce_close, 1.5) * 100) : "—"
          }% recovered by close · click to overlay`}
        >
          <span className="font-semibold text-text-primary">{c.ticker}</span>{" "}
          <span className="text-accent-red">{c.trough_pct}%</span>
          {showBounce && c.bounce_close != null && (
            <span className="text-accent-green">
              {" "}↩{Math.round(Math.min(c.bounce_close, 1.5) * 100)}%
            </span>
          )}
        </button>
      ))}
    </span>
  );
}

function DayRead({ days, onPick }: { days: string; onPick: (t: string) => void }) {
  const { data } = useResilienceInsights(days);
  if (!data || data.error || !data.spy) return null;
  const c = data.counts;
  const multi = (data.dates?.length ?? 1) > 1;
  const tracked = Math.max(1, data.n_tracked ?? 0);
  const buckets: { label: string; n: number; tone: "up" | "down"; sub: string }[] = [
    { label: "Fell with it", n: c?.dropped ?? 0, tone: "down", sub: "dropped with the market" },
    { label: "Barely reacted", n: c?.held_up ?? 0, tone: "up", sub: "held up" },
    { label: "Already V-shaped", n: c?.recovered ?? 0, tone: "up", sub: "recovered the dip" },
    { label: "Still down", n: c?.still_down ?? 0, tone: "down", sub: multi ? `as of ${data.latest}` : "at the close" },
  ];
  return (
    <>
      <Tile
        span={data.watch?.length ? 7 : 12}
        title={multi ? `Across ${data.dates.length} stress days` : `${data.dates[0]} read`}
        meta={multi ? data.dates.map((d) => d.slice(5)).join(", ") : undefined}
      >
        <p className="m-0 max-w-[70ch] text-sm leading-relaxed text-text-secondary">
          SPY {multi ? "averaged a dip of" : "dipped"}{" "}
          <span className="num delta-down">{data.spy.spy_trough_pct}%</span> vs the prior close and recovered{" "}
          <span className="num text-text-primary">
            {data.spy.spy_bounce_close != null ? `${Math.round(data.spy.spy_bounce_close * 100)}%` : "—"}
          </span>{" "}
          of it by the bell, across <span className="num">{data.n_tracked}</span> tracked names.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {buckets.map((bk) => (
            <HeatTile
              key={bk.label}
              label={bk.label}
              value={bk.n}
              intensity={bk.n / tracked}
              tone={bk.tone}
              sub={`${Math.round((bk.n / tracked) * 100)}% · ${bk.sub}`}
            />
          ))}
        </div>
        <div className="grid gap-3 pt-1 text-sm sm:grid-cols-[10rem_1fr]">
          {!!data.dropped?.length && (
            <>
              <span className="pt-0.5 text-text-secondary">Dropped with the market</span>
              <InsightChips chips={data.dropped.slice(0, 10)} onPick={onPick} />
            </>
          )}
          {!!data.held_up?.length && (
            <>
              <span className="pt-0.5 text-text-secondary">Barely reacted</span>
              <InsightChips chips={data.held_up.slice(0, 8)} onPick={onPick} />
            </>
          )}
          {!!data.recovered?.length && (
            <>
              <span className="pt-0.5 text-text-secondary">Already recovered</span>
              <InsightChips chips={data.recovered.slice(0, 8)} onPick={onPick} showBounce />
            </>
          )}
        </div>
      </Tile>
      {!!data.watch?.length && (
        <Tile span={5} title="Watch" meta="still down, but history says they snap back">
          <div className="divide-y divide-border">
            {data.watch.map((w) => (
              <div key={w.ticker} className="flex items-baseline gap-3 py-2">
                <button
                  type="button"
                  onClick={() => onPick(w.ticker)}
                  className="ticker w-16 shrink-0 rounded px-1 text-left text-sm hover:bg-bg-card-hover"
                  title="click to overlay"
                >
                  {w.ticker}
                </button>
                <span className="text-sm text-text-secondary">{w.reason}</span>
              </div>
            ))}
          </div>
        </Tile>
      )}
    </>
  );
}

const pillCls = "num min-h-8 rounded-full border px-3 py-1 text-xs transition-colors";
const pillStyle = (on: boolean): React.CSSProperties =>
  on
    ? { borderColor: "var(--accent)", background: "var(--accent)", color: "var(--accent-ink)" }
    : { borderColor: "var(--border)", background: "transparent" };

function IntradayView() {
  const [selDays, setSelDays] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>(["NVDA"]);
  const [theme, setTheme] = useState<string>("");
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);

  // Multi-select day chips; empty selection = latest stress day.
  const meta0 = useIntradayResilience(2, "");
  const days = meta0.data?.days ?? [];
  const activeDays = selDays.length
    ? selDays
    : days.length
      ? [days[days.length - 1].date]
      : [];
  const datesKey = [...activeDays].sort().join(",");

  const intradayQuery = useIntradayResilience(2, datesKey);
  const { data, isFetching } = intradayQuery;
  const bars = useIntradayBars(datesKey, picked, theme);

  const themes = useMemo(() => {
    const set = new Set<string>();
    for (const t of data?.tickers ?? []) if (t.theme) set.add(t.theme);
    return [...set].sort();
  }, [data?.tickers]);

  const toggle = (t: string) =>
    setPicked((p) =>
      p.includes(t) ? p.filter((x) => x !== t) : [...p, t].slice(-MAX_OVERLAY),
    );
  const toggleDay = (d: string) =>
    setSelDays((p) =>
      p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort(),
    );

  const chartMeta: OverlaySeriesMeta[] = useMemo(() => {
    const out: OverlaySeriesMeta[] = [
      { key: "SPY", label: "SPY", color: "var(--text-muted)", dashed: false },
      { key: "QQQ", label: "QQQ", color: "var(--text-muted)", dashed: true },
    ];
    if (theme)
      out.push({ key: `theme:${theme}`, label: theme, color: "var(--accent-purple)", dashed: true });
    picked.forEach((t, i) => {
      out.push({ key: t, label: t, color: SLOT_VARS[i % SLOT_VARS.length], dashed: false });
    });
    return out;
  }, [picked, theme]);

  // KPI strip: SPY on the selected session(s) + the fastest name.
  const sel = days.filter((d) => activeDays.includes(d.date));
  const spyDip = sel.length ? sel.reduce((t, d) => t + d.spy_trough_pct, 0) / sel.length : null;
  const spyB = sel.filter((d) => d.spy_bounce_close != null);
  const spyBounce = spyB.length ? spyB.reduce((t, d) => t + (d.spy_bounce_close as number), 0) / spyB.length : null;
  const ranked = (data?.tickers ?? []).slice(0, 60);
  const top = ranked[0];

  return (
    <>
      <KpiTile
        label={activeDays.length > 1 ? `SPY avg dip · ${activeDays.length} sessions` : `SPY dip · ${activeDays[0] ?? "—"}`}
        value={spyDip != null ? `${spyDip.toFixed(2)}%` : "—"}
        tone="down"
        sub="intraday trough vs prior close"
      />
      <KpiTile label="SPY recovered by close" value={fmtPct(spyBounce)} sub="share of the dip bought back" />
      <KpiTile label="Fastest V-shape" value={top?.ticker ?? "—"} delta={top ? top.score.toFixed(0) : undefined} tone="up" sub={top ? `recovered ${fmtPct(top.avg_bounce_close)} of a ${top.avg_trough_pct}% dip` : undefined} />
      <KpiTile label="Names ranked" value={data?.n_tickers ?? "—"} sub={`${days.length} stress days stored`} />

      {/* Toolbar — multi-select day chips, quick actions, theme line */}
      <Tile span={12} bodyClassName="flex-row! flex-wrap items-center">
        {days.map((d) => {
          const on = activeDays.includes(d.date);
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => toggleDay(d.date)}
              aria-pressed={on}
              className={pillCls}
              style={pillStyle(on)}
              title={`SPY trough ${d.spy_trough_pct}% · bounce by close ${d.spy_bounce_close ?? "—"} · click to toggle`}
            >
              {d.date.slice(5)} <span className={on ? undefined : "text-accent-red"}>{d.spy_trough_pct}%</span>
            </button>
          );
        })}
        <span className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setSelDays(days.map((d) => d.date))}
            className="min-h-8 rounded px-2 text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setSelDays([])}
            className="min-h-8 rounded px-2 text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
            title="back to latest day only"
          >
            Latest
          </button>
        </span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="Theme line"
          className="control-surface ml-auto min-h-8 rounded-full border px-3 py-1 text-xs text-text-secondary"
        >
          <option value="">No theme line</option>
          {themes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Tile>

      <Tile
        span={8}
        className="self-start"
        title="Intraday path"
        meta={`${activeDays.length > 1 ? `${activeDays.length} sessions` : activeDays[0] ?? ""} · % vs previous close, 15m bars`}
        actions={
          <span className="flex items-center gap-4 text-xs text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span style={{ width: 14, borderTop: "2px solid var(--text-muted)" }} /> SPY
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 14, borderTop: "2px dashed var(--text-muted)" }} /> QQQ
            </span>
            {theme && (
              <span className="flex items-center gap-1.5">
                <span style={{ width: 14, borderTop: "2px dashed var(--accent-purple)" }} /> theme
              </span>
            )}
          </span>
        }
      >
        <OverlayChart
          segments={bars.data?.segments ?? []}
          meta={chartMeta}
          faded={bars.isFetching && !!bars.data}
        />
      </Tile>

      {/* Ranked intraday list */}
      <Tile span={4} title="Fastest V-shapes" meta={`V-score · avg dip · overlay max ${MAX_OVERLAY}`}>
        <span className="text-xs text-text-muted">Click to overlay, double-click to open the ticker.</span>
        <div className="flex max-h-[18rem] flex-col gap-0.5 overflow-y-auto">
          {ranked.map((r: IntradayTicker, idx: number) => {
            const on = picked.includes(r.ticker);
            const slot = SLOT_VARS[picked.indexOf(r.ticker) % SLOT_VARS.length];
            return (
              <div
                key={r.ticker}
                className="rounded-md"
                style={{ background: on ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined }}
                onDoubleClick={() => setActiveTicker(r.ticker)}
              >
                <BarRow
                  label={<span style={{ color: on ? slot : undefined }}>{r.ticker}</span>}
                  value={r.score}
                  max={100}
                  tone={scoreBand(r.score)}
                  display={r.score.toFixed(0)}
                  trailing={`${r.avg_trough_pct}%`}
                  onClick={() => toggle(r.ticker)}
                  title={
                    `#${idx + 1} ${r.ticker} · ${r.theme || r.category || "—"}\n` +
                    `avg dip ${r.avg_trough_pct}% vs prev close · recovered ${fmtPct(r.avg_bounce_close)} by the close\n` +
                    `bounce vs SPY ${r.avg_rel_bounce >= 0 ? "+" : ""}${(r.avg_rel_bounce * 100).toFixed(0)}% · ${r.n_days} stress days\n` +
                    `${on ? "click to remove from" : "click to add to"} overlay · double-click to open ticker`
                  }
                />
              </div>
            );
          })}
          <QueryNotice queries={[meta0, intradayQuery, bars]} label="Intraday resilience" />
          {!data?.tickers.length && !isFetching && !intradayQuery.isPending && !intradayQuery.isError && intradayQuery.fetchStatus !== "paused" && (
            <div className="p-3 text-sm text-text-muted">No intraday data — refresh from the Daily view.</div>
          )}
        </div>
      </Tile>

      <DayRead days={datesKey} onPick={toggle} />
    </>
  );
}

export function BounceBoard() {
  const [mode, setMode] = useState<"intraday" | "daily">("intraday");
  const [view, setView] = useState<"resilient" | "laggards">("resilient");
  const dailyQuery = useResilience(3);
  const { data, isFetching } = dailyQuery;
  const refresh = useResilienceRefresh();

  const tickers = data?.tickers ?? [];
  const shown =
    view === "resilient" ? tickers.slice(0, 40) : [...tickers].slice(-40).reverse();

  return (
    <TileGrid>
      {(mode === "daily" || refresh.isError) && (
        <div className="min-w-0 lg:col-span-12">
          {mode === "daily" && <QueryNotice queries={[dailyQuery]} label="Daily resilience" />}
          {refresh.isError && <p role="alert" className="text-xs text-accent-red">Resilience refresh failed.</p>}
        </div>
      )}
      {/* Mode toggle (page header already names the view) */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 lg:col-span-12">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "intraday" as const, label: "Intraday V-shapes" },
              { value: "daily" as const, label: "Multi-day events" },
            ]}
          />
          <span className="text-sm text-text-muted">
            {mode === "intraday"
              ? "15m bars — who recovers the day's dip fastest"
              : `${data?.events.length ?? 0} events, ${data?.n_tickers ?? 0} tickers ranked`}
          </span>
        </div>
        <CockpitButton
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          title="Re-scan prices and rebuild both layers (~80s in the background)"
        >
          <RefreshCw size={14} className={refresh.isPending ? "animate-spin" : ""} />
          {refresh.isPending ? "Rebuilding…" : "Refresh"}
        </CockpitButton>
      </div>

      {mode === "intraday" ? (
        <IntradayView />
      ) : (dailyQuery.isError || dailyQuery.fetchStatus === "paused") && !data ? null : (
        <DailyView
          view={view}
          setView={setView}
          shown={shown}
          tickers={tickers}
          events={data?.events ?? []}
          themes={data?.themes ?? []}
          isFetching={isFetching}
          hasData={!!data}
        />
      )}
    </TileGrid>
  );
}

type EventRow = { id: number; peak_date: string; trough_date: string; spy_dd_pct: number; spy_bounce_5d: number | null };

function DailyView({
  view,
  setView,
  shown,
  tickers,
  events,
  themes,
  isFetching,
  hasData,
}: {
  view: "resilient" | "laggards";
  setView: (v: "resilient" | "laggards") => void;
  shown: ResilienceTicker[];
  tickers: ResilienceTicker[];
  events: EventRow[];
  themes: { theme: string; category: string | null; n_tickers: number; score: number; avg_bounce_5d: number; top: string[] }[];
  isFetching: boolean;
  hasData: boolean;
}) {
  const worst = events.reduce<EventRow | null>((w, e) => (!w || e.spy_dd_pct < w.spy_dd_pct ? e : w), null);
  const maxDd = Math.max(0.01, ...events.map((e) => Math.abs(e.spy_dd_pct)));
  const top = tickers[0];
  const strong = tickers.filter((t) => t.score >= 60).length;
  return (
    <>
      <KpiTile label="SPY stress events" value={events.length} sub={`${tickers.length} tickers with 3+ events`} />
      <KpiTile
        label="Deepest SPY drawdown"
        value={worst ? `${worst.spy_dd_pct}%` : "—"}
        tone="down"
        sub={worst ? `trough ${worst.trough_date} · bounced ${fmtPct(worst.spy_bounce_5d)} in 5d` : undefined}
      />
      <KpiTile label="Most resilient" value={top?.ticker ?? "—"} delta={top ? top.score.toFixed(0) : undefined} tone="up" sub={top?.theme || top?.category || undefined} />
      <KpiTile label="Score 60+" value={strong} sub={`of ${tickers.length} ranked names`} />

      {/* Ranked tickers */}
      <Tile
        span={7}
        title={view === "resilient" ? "Most resilient" : "Laggards"}
        meta="0-100 composite of bounce, recovery and drawdown vs SPY · bounce 5d"
        actions={
          <>
            {isFetching && !hasData && <span className="animate-pulse text-xs text-text-muted">loading…</span>}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "resilient" as const, label: "Resilient" },
                { value: "laggards" as const, label: "Laggards" },
              ]}
            />
          </>
        }
      >
        <div className="flex max-h-[64vh] flex-col gap-0.5 overflow-y-auto">
          {shown.map((r, i) => (
            <TickerRow key={r.ticker} r={r} rank={i + 1} />
          ))}
          {!shown.length && !isFetching && (
            <div className="p-3 text-sm text-text-muted">
              No resilience data yet — hit refresh to build the tables.
            </div>
          )}
        </div>
      </Tile>

      {/* Right column: SPY stress events over the theme rollup */}
      <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-5">
      <Tile title="SPY stress events" meta="drawdown · 5d bounce">
        <div className="flex max-h-[24vh] flex-col gap-0.5 overflow-y-auto">
          {events.map((e) => (
            <BarRow
              key={e.id}
              label={e.trough_date.slice(2)}
              value={e.spy_dd_pct}
              max={maxDd}
              tone="down"
              display={`${e.spy_dd_pct}%`}
              trailing={fmtPct(e.spy_bounce_5d)}
              title={`peak ${e.peak_date} → trough ${e.trough_date} · SPY's own 5-session bounce off the trough ${fmtPct(e.spy_bounce_5d)}`}
            />
          ))}
        </div>
      </Tile>

      {/* Theme rollup */}
      <Tile title="Themes" meta="by average member resilience · top 24">
        <div className="grid max-h-[48vh] grid-cols-2 gap-2 overflow-y-auto">
          {themes.slice(0, 24).map((t) => (
            <HeatTile
              key={t.theme}
              label={<span title={t.theme}>{t.theme}</span>}
              value={t.score.toFixed(0)}
              intensity={Math.abs(t.score - 45) / 45}
              tone={t.score >= 45 ? "up" : "down"}
              sub={<span title={`${t.n_tickers} member tickers`}>{t.top.slice(0, 3).join(" ")} · {t.n_tickers} names</span>}
            />
          ))}
        </div>
      </Tile>
      </div>
    </>
  );
}
