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
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { GlassPanel, Chip, Segmented } from "../../components/Glass";
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

/** Inline 0-100 meter — green above 60, red below 25, blue between. */
function ScoreMeter({ score }: { score: number }) {
  const tone =
    score >= 60
      ? "var(--accent-green)"
      : score < 25
        ? "var(--accent-red)"
        : "var(--accent-blue)";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: "color-mix(in srgb, var(--border) 60%, transparent)" }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, score)}%`, background: tone }}
        />
      </div>
      <span className="num text-xs w-8 text-right" style={{ color: tone }}>
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function TickerRow({ r }: { r: ResilienceTicker }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <div
      className="grid items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-bg-card text-xs"
      style={{ gridTemplateColumns: "64px 110px 1fr 64px 64px 56px" }}
      onClick={() => setActiveTicker(r.ticker)}
      title={`${r.n_events} events · avg own drawdown ${r.avg_own_dd_pct}%`}
    >
      <span className="font-mono font-bold text-text-primary">{r.ticker}</span>
      <ScoreMeter score={r.score} />
      <span className="text-text-muted truncate">{r.theme || r.category || "—"}</span>
      <span className="num text-right">{fmtPct(r.avg_bounce_5d)}</span>
      <span className="num text-right">{fmtPct(r.recovery_rate)}</span>
      <span className="num text-right text-text-muted">
        {r.avg_rel_dd != null ? `${r.avg_rel_dd.toFixed(1)}x` : "—"}
      </span>
    </div>
  );
}

const COLS = (
  <div
    className="grid gap-2 px-2 pb-1 text-[10px] uppercase tracking-wide text-text-muted"
    style={{ gridTemplateColumns: "64px 110px 1fr 64px 64px 56px" }}
  >
    <span>Ticker</span>
    <span>Resilience</span>
    <span>Theme</span>
    <span className="text-right" title="Share of its own drawdown recovered 5 sessions after its trough">
      Bounce 5d
    </span>
    <span className="text-right" title="Share of events where it fully recovered its pre-crash price within 20 sessions">
      Recovered
    </span>
    <span className="text-right" title="Its drawdown vs SPY's — under 1x fell less than the market">
      vs SPY
    </span>
  </div>
);

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
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {chips.map((c) => (
        <button
          key={c.ticker}
          type="button"
          onClick={() => onPick(c.ticker)}
          className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-bg-card num"
          title={`${c.theme || ""} · dip ${c.trough_pct}% · ${
            c.bounce_close != null ? Math.round(Math.min(c.bounce_close, 1.5) * 100) : "—"
          }% recovered by close · click to overlay`}
        >
          <span className="font-bold text-text-primary">{c.ticker}</span>{" "}
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
  return (
    <GlassPanel className="p-3 space-y-2 text-xs leading-relaxed">
      <div className="text-text-secondary">
        <span className="font-semibold text-text-primary">
          {multi
            ? `Across ${data.dates.length} stress days (${data.dates
                .map((d) => d.slice(5))
                .join(", ")}).`
            : `${data.dates[0]} read.`}
        </span>{" "}
        SPY {multi ? "averaged a dip of" : "dipped"}{" "}
        <span className="num text-accent-red">{data.spy.spy_trough_pct}%</span> vs the
        prior close and recovered{" "}
        <span className="num">
          {data.spy.spy_bounce_close != null
            ? `${Math.round(data.spy.spy_bounce_close * 100)}%`
            : "—"}
        </span>{" "}
        of it by the bell. Of {data.n_tracked} tracked names: {c?.dropped} fell with
        it, {c?.held_up} barely reacted, {c?.recovered} already V-shaped,{" "}
        {c?.still_down} still down{multi ? ` as of ${data.latest}` : " at the close"}.
      </div>
      {!!data.dropped?.length && (
        <div className="text-text-muted">
          <span className="text-text-secondary">Dropped with the market:</span>{" "}
          <InsightChips chips={data.dropped.slice(0, 10)} onPick={onPick} />
        </div>
      )}
      {!!data.held_up?.length && (
        <div className="text-text-muted">
          <span className="text-text-secondary">Barely reacted:</span>{" "}
          <InsightChips chips={data.held_up.slice(0, 8)} onPick={onPick} />
        </div>
      )}
      {!!data.recovered?.length && (
        <div className="text-text-muted">
          <span className="text-text-secondary">Already recovered:</span>{" "}
          <InsightChips chips={data.recovered.slice(0, 8)} onPick={onPick} showBounce />
        </div>
      )}
      {!!data.watch?.length && (
        <div
          className="rounded-md px-2.5 py-2 space-y-1"
          style={{ background: "color-mix(in srgb, var(--accent-blue) 7%, transparent)" }}
        >
          <div className="font-semibold text-text-primary">
            Watch — still down, but history says they snap back:
          </div>
          {data.watch.map((w) => (
            <div key={w.ticker} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onPick(w.ticker)}
                className="rounded border border-border px-1.5 py-0.5 num font-bold text-text-primary hover:bg-bg-card shrink-0"
                title="click to overlay"
              >
                {w.ticker}
              </button>
              <span className="text-text-muted">{w.reason}</span>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

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

  const { data, isFetching } = useIntradayResilience(2, datesKey);
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

  return (
    <div className="space-y-3">
      {/* Filter row — multi-select day chips, quick actions, theme line */}
      <div className="flex items-center gap-2 flex-wrap">
        {days.map((d) => {
          const on = activeDays.includes(d.date);
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => toggleDay(d.date)}
              className="rounded-md px-2 py-1 text-xs border num"
              style={{
                borderColor: on ? "var(--accent-blue)" : "var(--border)",
                background: on
                  ? "color-mix(in srgb, var(--accent-blue) 12%, transparent)"
                  : "color-mix(in srgb, var(--accent-red) 5%, transparent)",
              }}
              title={`SPY trough ${d.spy_trough_pct}% · bounce by close ${d.spy_bounce_close ?? "—"} · click to toggle`}
            >
              {d.date.slice(5)} <span className="text-accent-red">{d.spy_trough_pct}%</span>
            </button>
          );
        })}
        <span className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setSelDays(days.map((d) => d.date))}
            className="rounded border border-border px-1.5 py-0.5 text-text-secondary hover:text-text-primary"
          >
            all
          </button>
          <button
            type="button"
            onClick={() => setSelDays([])}
            className="rounded border border-border px-1.5 py-0.5 text-text-secondary hover:text-text-primary"
            title="back to latest day only"
          >
            latest
          </button>
        </span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="ml-auto rounded border border-border bg-transparent px-2 py-1 text-xs text-text-secondary"
        >
          <option value="">no theme line</option>
          {themes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <DayRead days={datesKey} onPick={toggle} />

      <GlassPanel className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted">
            {activeDays.length > 1
              ? `${activeDays.length} sessions`
              : activeDays[0] ?? ""}{" "}
            — % vs previous close, 15m bars · click table rows to overlay (max {MAX_OVERLAY})
          </span>
          {/* legend — always present */}
          <span className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <span style={{ width: 12, borderTop: "2px solid var(--text-muted)" }} /> SPY
            </span>
            <span className="flex items-center gap-1">
              <span style={{ width: 12, borderTop: "2px dashed var(--text-muted)" }} /> QQQ
            </span>
            {theme && (
              <span className="flex items-center gap-1">
                <span style={{ width: 12, borderTop: "2px dashed var(--accent-purple)" }} /> theme
              </span>
            )}
          </span>
        </div>
        <OverlayChart
          segments={bars.data?.segments ?? []}
          meta={chartMeta}
          faded={bars.isFetching && !!bars.data}
        />
      </GlassPanel>

      {/* Ranked intraday table */}
      <GlassPanel className="p-3">
        <div
          className="grid gap-2 px-2 pb-1 text-[10px] uppercase tracking-wide text-text-muted"
          style={{ gridTemplateColumns: "20px 64px 110px 1fr 70px 64px 60px" }}
        >
          <span />
          <span>Ticker</span>
          <span>V-score</span>
          <span>Theme</span>
          <span className="text-right" title="Average intraday dip vs prev close on stress days">Avg dip</span>
          <span className="text-right" title="Fraction of the dip recovered by the close">Recovered</span>
          <span className="text-right" title="Bounce vs SPY's bounce the same day">vs SPY</span>
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {(data?.tickers ?? []).slice(0, 60).map((r: IntradayTicker) => {
            const sel = picked.includes(r.ticker);
            return (
              <div
                key={r.ticker}
                className="grid items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-bg-card text-xs"
                style={{
                  gridTemplateColumns: "20px 64px 110px 1fr 70px 64px 60px",
                  background: sel
                    ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)"
                    : undefined,
                }}
                onClick={() => toggle(r.ticker)}
                onDoubleClick={() => setActiveTicker(r.ticker)}
                title={`${r.n_days} stress days · double-click to open ticker`}
              >
                <span
                  style={{
                    width: 12, height: 0,
                    borderTop: sel
                      ? `2px solid ${SLOT_VARS[picked.indexOf(r.ticker) % SLOT_VARS.length]}`
                      : "2px solid transparent",
                  }}
                />
                <span className="font-mono font-bold text-text-primary">{r.ticker}</span>
                <ScoreMeter score={r.score} />
                <span className="text-text-muted truncate">{r.theme || r.category || "—"}</span>
                <span className="num text-right text-accent-red">{r.avg_trough_pct}%</span>
                <span className="num text-right">{fmtPct(r.avg_bounce_close)}</span>
                <span className="num text-right text-text-muted">
                  {r.avg_rel_bounce >= 0 ? "+" : ""}{(r.avg_rel_bounce * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
          {!data?.tickers.length && !isFetching && (
            <div className="text-xs text-text-muted p-3">No intraday data — refresh from the Daily view.</div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}

export function BounceBoard() {
  const [mode, setMode] = useState<"intraday" | "daily">("intraday");
  const [view, setView] = useState<"resilient" | "laggards">("resilient");
  const { data, isFetching } = useResilience(3);
  const refresh = useResilienceRefresh();

  const tickers = data?.tickers ?? [];
  const shown =
    view === "resilient" ? tickers.slice(0, 40) : [...tickers].slice(-40).reverse();

  return (
    <div className="space-y-3 p-1">
      {/* Header + mode toggle */}
      <GlassPanel className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-text-primary">
              Crash Bounce
            </span>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "intraday" as const, label: "Intraday V-shapes" },
                { value: "daily" as const, label: "Multi-day events" },
              ]}
            />
            <span className="text-xs text-text-muted">
              {mode === "intraday"
                ? "15m bars — who recovers the day's dip fastest"
                : `${data?.events.length ?? 0} events, ${data?.n_tickers ?? 0} tickers ranked`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary"
            title="Re-scan prices and rebuild both layers (~80s in the background)"
          >
            <RefreshCw size={11} className={refresh.isPending ? "animate-spin" : ""} />
            {refresh.isPending ? "rebuilding…" : "refresh"}
          </button>
        </div>
        {mode === "intraday" ? null : (
          <EventStrip events={data?.events ?? []} />
        )}
      </GlassPanel>

      {mode === "intraday" ? (
        <IntradayView />
      ) : (
        <DailyView
          view={view}
          setView={setView}
          shown={shown}
          themes={data?.themes ?? []}
          isFetching={isFetching}
          hasData={!!data}
        />
      )}
    </div>
  );
}

function EventStrip({
  events,
}: {
  events: { id: number; peak_date: string; trough_date: string; spy_dd_pct: number; spy_bounce_5d: number | null }[];
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {events.map((e) => (
        <div
          key={e.id}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs border border-border"
          style={{ background: "color-mix(in srgb, var(--accent-red) 5%, transparent)" }}
          title={`peak ${e.peak_date} → trough ${e.trough_date}`}
        >
          <div className="num text-text-primary">{e.trough_date}</div>
          <div className="flex items-center gap-2">
            <span className="num text-accent-red">SPY {e.spy_dd_pct}%</span>
            <span className="num text-text-muted" title="SPY's own 5-session bounce off the trough">
              ↩ {fmtPct(e.spy_bounce_5d)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyView({
  view,
  setView,
  shown,
  themes,
  isFetching,
  hasData,
}: {
  view: "resilient" | "laggards";
  setView: (v: "resilient" | "laggards") => void;
  shown: ResilienceTicker[];
  themes: { theme: string; category: string | null; n_tickers: number; score: number; avg_bounce_5d: number; top: string[] }[];
  isFetching: boolean;
  hasData: boolean;
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "3fr 2fr" }}>
      {/* Ranked tickers */}
      <GlassPanel className="p-3">
        <div className="flex items-center justify-between mb-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "resilient" as const, label: "Resilient" },
              { value: "laggards" as const, label: "Laggards" },
            ]}
          />
          {isFetching && !hasData && (
            <span className="text-xs text-text-muted animate-pulse">loading…</span>
          )}
        </div>
        {COLS}
        <div className="max-h-[60vh] overflow-y-auto">
          {shown.map((r) => (
            <TickerRow key={r.ticker} r={r} />
          ))}
          {!shown.length && !isFetching && (
            <div className="text-xs text-text-muted p-3">
              No resilience data yet — hit refresh to build the tables.
            </div>
          )}
        </div>
      </GlassPanel>

      {/* Theme rollup */}
      <GlassPanel className="p-3">
        <div className="text-xs font-semibold text-text-primary mb-2">
          Themes — avg member resilience
        </div>
        <div className="max-h-[64vh] overflow-y-auto space-y-1.5">
          {themes.slice(0, 24).map((t) => (
            <div key={t.theme} className="px-2 py-1.5 rounded hover:bg-bg-card">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-primary truncate flex items-center gap-1">
                  {t.score >= 55 ? (
                    <TrendingUp size={11} className="text-accent-green" />
                  ) : t.score < 35 ? (
                    <TrendingDown size={11} className="text-accent-red" />
                  ) : null}
                  {t.theme}
                </span>
                <span className="num text-text-muted">
                  {t.n_tickers} · {t.score.toFixed(0)}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <div
                  className="h-1 flex-1 rounded-full overflow-hidden"
                  style={{ background: "color-mix(in srgb, var(--border) 60%, transparent)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, t.score)}%`,
                      background:
                        t.score >= 55 ? "var(--accent-green)" : "var(--accent-blue)",
                    }}
                  />
                </div>
                <span className="flex gap-1">
                  {t.top.slice(0, 3).map((tk) => (
                    <Chip key={tk} tone="neutral" className="num">
                      {tk}
                    </Chip>
                  ))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
