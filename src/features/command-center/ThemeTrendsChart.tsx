import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, Minus, ChevronRight, ChevronDown } from "lucide-react";
import { useThemeHeatHistory, useThemePnlHistory, useThemePnlBreakdown } from "../../api/themeHeat";
import { useThemeRotation, type RotationWindow } from "../../api/rotation";
import { useDashboardFilters } from "../../store/useDashboardFilters";
import { RotationMap, MomentumRanking, AlertFeed, RotationScrubber } from "../rotation/RotationViz";
import { Sparkline } from "../../components/CCPrimitives";
import { Segmented } from "../../components/Glass";

/* Theme Trends — per-category options-flow "heat" (premium vs a 7-day baseline)
 * over time. Rather than plot raw noisy daily ratios on a zero-based line chart,
 * we EMA-WEIGHT each series (recent days count more) so the actual trend shows,
 * and render a HEAT MATRIX (themes × time, colour = heat) sorted hottest-first
 * with a per-theme trend arrow + sparkline. 1.0× = baseline; >1 hot, <1 cooling. */

const WINDOWS = [7, 30, 60, 90] as const;

/** EMA — recent-weighted so a real trend shows through daily noise. Nulls hold
 * the prior value so a quiet day doesn't punch a hole in the trend. */
function ema(vals: (number | null)[], span: number): (number | null)[] {
  const k = 2 / (span + 1);
  let prev: number | null = null;
  return vals.map((v) => {
    if (v == null) return prev;
    prev = prev == null ? v : v * k + prev * (1 - k);
    return prev;
  });
}

/** Heat → colour, diverging around the 1.0× baseline: cool blue below, warm red
 * above. Hardcoded data-viz palette (chart colours are exempt from the CSS-var
 * rule). */
const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, var(--bg-card-hover))`;
function heatColor(r: number | null): string {
  if (r == null) return "transparent";
  if (r >= 3) return mix("#dc2626", 90);
  if (r >= 2) return mix("#ef4444", 72);
  if (r >= 1.5) return mix("#f97316", 62);
  if (r >= 1.15) return mix("#f59e0b", 50);
  if (r >= 0.85) return mix("var(--text-muted)", 14); // ~baseline neutral
  if (r >= 0.5) return mix("#3b82f6", 40);
  if (r >= 0.25) return mix("#3b82f6", 62);
  return mix("#2563eb", 85);
}

/** Solid ink for text/sparkline next to the matrix (fills are too soft to read). */
function heatInk(r: number): string {
  if (r >= 1.5) return "var(--accent-red)";
  if (r >= 1.15) return "var(--accent-orange)";
  if (r >= 0.85) return "var(--text-secondary)";
  return "var(--accent-blue)";
}

const label = (cat: string) => cat.replace(/_/g, " ");

function TrendArrow({ delta }: { delta: number }) {
  if (delta > 0.15)
    return <ArrowUp size={12} style={{ color: "var(--accent-green)" }} />;
  if (delta < -0.15)
    return <ArrowDown size={12} style={{ color: "var(--accent-red)" }} />;
  return <Minus size={12} style={{ color: "var(--text-muted)" }} />;
}

/* Days-window -> the rotation endpoint's smoothing window. Rotation needs more
 * history than the matrix does (it smooths twice), so 7d maps to the shortest
 * available rather than 1:1. */
const ROT_WINDOW: Record<number, RotationWindow> = {
  7: "1W", 30: "1M", 60: "3M", 90: "3M",
};

/* Rotation view — same RRG components the /rotation page uses, fed by
 * `/market/theme-rotation`. Relative strength is a theme's SHARE of the day's
 * total option premium, so a theme rises here only when money moves INTO it
 * relative to everything else, not merely because the whole tape was loud. */
function ThemeRotationView({
  data,
  isFetching,
  onSelectTheme,
  categoryFilter,
}: {
  onSelectTheme: (cat: string) => void;
  categoryFilter: string;
  data: import("../../api/rotation").RotationResponse | undefined;
  isFetching: boolean;
}) {
  /* Hooks BEFORE any early return — bailing out first would change the hook
   * count between the loading and loaded renders, which React rejects. */
  const dates = data?.ok ? data.sectors[0]?.history.map((p) => p.date) ?? [] : [];
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedIndex = selectedDate ? dates.indexOf(selectedDate) : -1;
  const idx = selectedIndex >= 0 ? selectedIndex : Math.max(0, dates.length - 1);

  if (isFetching && !data) {
    return (
      <div className="h-[200px] flex items-center justify-center text-xs text-text-muted animate-pulse">
        loading rotation…
      </div>
    );
  }
  if (!data?.ok) {
    return (
      <div className="py-4 text-xs text-text-muted">
        {data?.reason ?? "rotation unavailable"} — needs more flow-days of theme history.
      </div>
    );
  }

  const scrubbed = idx < dates.length - 1;
  const selectTheme = onSelectTheme;
  return (
    /* Size the map COLUMN to the map. A plain 2-col split leaves the capped
       square stranded in the middle of a very wide column on large screens,
       which is what made this look unbalanced. */
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,520px)_minmax(0,1fr)] gap-6 items-start">
      <div className="w-full">
        <RotationMap sectors={data.sectors} atIndex={idx}
                     onSelect={selectTheme} selected={categoryFilter} />
        <RotationScrubber
          dates={dates}
          index={idx}
          onChange={(next) => {
            const nextIndex = typeof next === "function" ? next(idx) : next;
            setSelectedDate(dates[nextIndex] ?? null);
          }}
        />
      </div>

      <div className="flex flex-col gap-4 min-w-0">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <h3 className="font-display text-base font-medium text-text-primary">
              Theme momentum
            </h3>
            {scrubbed && (
              <span className="text-xs num" style={{ color: "var(--accent-cyan)" }}>
                map showing {dates[idx]} · ranking is current
              </span>
            )}
          </div>
          <MomentumRanking sectors={data.sectors}
                           onSelect={selectTheme} selected={categoryFilter} />
        </div>
        <div>
          <h3 className="font-display text-base font-medium text-text-primary mb-1.5">
            Rotation alerts
          </h3>
          <AlertFeed alerts={data.alerts} />
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          {data.sessions} flow-days · strength = share of total option premium vs {data.benchmark}.
          LEADING = growing share and still accelerating; IMPROVING = small share but gaining;
          WEAKENING = still large but losing ground; LAGGING = small and shrinking.
        </p>
      </div>
    </div>
  );
}

/* P/L view — the same grid as Heat, coloured by what each theme's flow actually
 * DID instead of how loud it was.
 *
 * Deliberately BACKWARD-LOOKING and labelled as such: theme P/L persistence was
 * measured at +1.3pp top-vs-bottom quartile over 5 independent periods, p=0.67
 * — directionally positive but unproven. This is a scoreboard, not a forecast.
 *
 * Colour is centred on the corpus base rate, not on zero: P(2x) is bounded and
 * its no-information point is ~31%, so green/red means "beat / missed the
 * average theme", which is the only comparison that means anything here. */
function ThemePnlView({
  data,
  isFetching,
  sub,
  onSelectTheme,
  categoryFilter,
}: {
  data: import("../../api/themeHeat").ThemePnlHistory | undefined;
  isFetching: boolean;
  sub: import("../../api/themeHeat").ThemePnlBreakdown | undefined;
  onSelectTheme: (cat: string) => void;
  categoryFilter: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byCat = useMemo(() => {
    const m = new Map<string, import("../../api/themeHeat").SubthemePnl[]>();
    for (const t of sub?.themes ?? []) {
      if (t.p2x == null) continue;
      const arr = m.get(t.category) ?? [];
      arr.push(t);
      m.set(t.category, arr);
    }
    return m;
  }, [sub]);
  const rows = useMemo(() => {
    if (!data) return [];
    const prior = data.prior_weight || 10;
    const base = data.base_rate || 0.31;
    return data.categories
      .map((cat) => {
        const vals = data.series[cat] ?? [];
        const counts = data.counts?.[cat] ?? [];
        const raw = data.raw?.[cat] ?? [];
        const nn = vals.filter((v): v is number => v != null);
        /* Row headline = WINDOW aggregate, not the latest daily cell. The
         * latest cell holds 1-2 graded entries and shrinks to ~base rate, so
         * ranking rows by it reads recency noise as theme quality — an
         * external review did exactly that and ranked a below-average theme
         * as the strongest confirmed one. */
        let hits = 0;
        let n = 0;
        raw.forEach((v, i) => {
          if (v != null && counts[i]) {
            hits += v * counts[i];
            n += counts[i];
          }
        });
        const agg = n ? (hits + base * prior) / (n + prior) : null;
        return { cat, vals, counts, raw, current: agg, n, spark: nn };
      })
      .sort((a, b) => (b.current ?? -1) - (a.current ?? -1));
  }, [data]);

  if (isFetching && !data) {
    return <div className="h-[120px] flex items-center justify-center text-xs text-text-muted animate-pulse">loading P/L…</div>;
  }
  if (!data || !data.dates.length) {
    return (
      <div className="py-4 text-xs text-text-muted">
        No graded theme P/L yet — run <code className="num">scripts/backfill_theme_pnl.py</code>.
      </div>
    );
  }

  const base = data.base_rate || 0.31;
  /** Diverging around the base rate; null = 10d window still open. */
  const color = (v: number | null): string => {
    if (v == null) return "transparent";
    const d = (v - base) / (base * 0.6);          // ±60% of base saturates
    const t = Math.max(-1, Math.min(1, d));
    return t >= 0
      ? `color-mix(in srgb, var(--accent-green) ${Math.round(18 + t * 82)}%, var(--bg-card-hover))`
      : `color-mix(in srgb, var(--accent-red) ${Math.round(18 + -t * 82)}%, var(--bg-card-hover))`;
  };

  return (
    <>
      <div className="flex items-center flex-wrap gap-1 text-xs text-text-muted mb-2">
        <span>worse</span>
        {[-1, -0.5, 0, 0.5, 1].map((k) => (
          <span key={k} className="inline-block w-3 h-3 rounded-sm"
                style={{ background: color(base + k * base * 0.6) }} />
        ))}
        <span>better · neutral = {(base * 100).toFixed(0)}% (corpus average)</span>
        <span className="ml-1">· cell = P(a print that day doubled within 10 trading days)</span>
      </div>

      <div className="space-y-0.5">
        {rows.map((r) => {
          const active = categoryFilter === r.cat;
          return (
            <div key={r.cat}>
            <div
              onClick={() => onSelectTheme(r.cat)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectTheme(r.cat); }
              }}
              aria-label={`Filter flow to ${r.cat.replace(/_/g, " ")}`}
              className="data-row grid items-center gap-3 cursor-pointer px-1.5 -mx-1.5 py-0.5"
              style={{
                gridTemplateColumns: "minmax(8rem,14rem) minmax(0,1fr) 96px",
                background: active ? "color-mix(in srgb, var(--accent-cyan) 12%, transparent)" : undefined,
                opacity: categoryFilter && !active ? 0.55 : 1,
              }}
            >
              <span className="text-sm truncate flex items-center gap-1"
                    style={{ color: active ? "var(--accent-cyan)" : "var(--text-secondary)" }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(open === r.cat ? null : r.cat); }}
                  aria-label={`${open === r.cat ? "Hide" : "Show"} sub-themes of ${r.cat}`}
                  aria-expanded={open === r.cat}
                  className="shrink-0 text-text-muted hover:text-text-primary"
                >
                  {open === r.cat ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
                <span className="truncate" title={label(r.cat)}>{label(r.cat)}</span>
              </span>

              <div className="flex gap-px h-5">
                {r.vals.map((v, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      background: color(v),
                      minWidth: 2,
                      // pending cells read as a gap, never as a bad outcome
                      border: v == null ? "1px dashed var(--border)" : undefined,
                      opacity: v == null ? 0.35 : 1,
                    }}
                    title={
                      v == null
                        ? `${r.cat} ${data.dates[i]}: 10-day window still open`
                        : `${r.cat} ${data.dates[i]}: ${((r.raw[i] ?? 0) * 100).toFixed(0)}% doubled ` +
                          `(${r.counts[i] ?? 0} graded ${r.counts[i] === 1 ? "entry" : "entries"}` +
                          `, shown ${(v * 100).toFixed(0)}% after shrinkage)`
                    }
                  />
                ))}
              </div>

              <div className="flex items-center justify-end gap-1">
                <Sparkline points={r.spark} width={36} height={14}
                           color={color(r.current)} />
                <span className="num text-sm font-medium text-right whitespace-nowrap"
                      title={`window aggregate over ${r.n} graded entries (shrunk)`}
                      style={{ color: r.current != null && r.current >= base
                        ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {r.current != null ? `${(r.current * 100).toFixed(0)}%` : "—"}
                  <span className="text-xs font-normal text-text-muted ml-1">n={r.n}</span>
                </span>
              </div>
            </div>

            {open === r.cat && (
              /* Sub-themes are aggregated over the WHOLE window, not per day —
                 a (day, sub-theme) cell averages ~2 graded entries. */
              <div className="ml-5 mb-2 mt-1 pt-1 border-t border-border flex flex-col gap-1">
                <span className="text-xs text-text-muted pb-0.5">
                  sub-themes are read over the FULL corpus, not the window above —
                  over a short window each holds 1-2 graded entries
                </span>
                {(byCat.get(r.cat) ?? []).length === 0 && (
                  <span className="text-xs text-text-muted py-1">
                    no graded sub-theme entries yet
                  </span>
                )}
                {(byCat.get(r.cat) ?? []).map((t) => (
                  <div key={t.theme} className="grid items-center gap-2 text-xs"
                       style={{ gridTemplateColumns: "150px 1fr 74px" }}
                       title={`${t.theme}: ${((t.p2x_raw ?? 0) * 100).toFixed(0)}% raw over `
                         + `${t.n_complete} graded ${t.n_complete === 1 ? "entry" : "entries"}`
                         + ` -> ${((t.p2x ?? 0) * 100).toFixed(0)}% after shrinkage`}>
                    <span className="text-text-muted truncate" title={label(t.theme)}>
                      {t.theme.replace(/_/g, " ").toLowerCase()}
                    </span>
                    <div className="h-2 rounded-full bg-bg-card-hover overflow-hidden">
                      <div className="h-full rounded-full"
                           style={{ width: `${Math.min(100, ((t.p2x ?? 0) / (base * 2)) * 100)}%`,
                                    background: color(t.p2x) }} />
                    </div>
                    <span className="num text-right"
                          style={{ color: (t.p2x ?? 0) >= base
                            ? "var(--accent-green)" : "var(--accent-red)" }}>
                      {((t.p2x ?? 0) * 100).toFixed(0)}% <span className="text-text-muted">n={t.n_complete}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>

      <div className="num text-xs text-text-muted mt-2">
        {data.dates[0]} → {data.dates[data.dates.length - 1]} · {data.dates.length} flow-days
        {data.pending ? ` · ${data.pending} cells pending (10d window open)` : ""}
        {" · "}backward-looking scoreboard — persistence measured at +1.3pp, p=0.67, so
        {" "}this is what DID pay, not what will
      </div>
    </>
  );
}

export function ThemeTrendsChart({ embedded = false }: { embedded?: boolean }) {
  const [days, setDays] = useState<number>(7);
  const [view, setView] = useState<"matrix" | "pnl" | "rotation">("matrix");
  const { data, isFetching } = useThemeHeatHistory(days);
  const rot = useThemeRotation(ROT_WINDOW[days] ?? "1M", view === "rotation");
  const pnl = useThemePnlHistory(days, view === "pnl");
  /* Sub-themes are ALWAYS read over the full corpus, never the matrix's window:
   * at 7d a sub-theme has 1-2 graded entries and the ranking is meaningless.
   * Over the whole corpus the median is ~48, which is enough to rank. */
  const sub = useThemePnlBreakdown(365, view === "pnl");
  const patchIFlow = useDashboardFilters((st) => st.patchIFlow);
  const categoryFilter = useDashboardFilters((st) => st.iflow.categoryFilter);

  /* Clicking a theme — in EITHER view — filters the iFlow Tracker (Grid and
   * Tape) to that taxonomy category. Deciding where to look next is the point
   * of both views, so both should hand you the flow rather than make you
   * re-find it. Clicking the active theme again clears the filter. */
  const selectTheme = (cat: string) => {
    patchIFlow({ categoryFilter: categoryFilter === cat ? "" : cat });
    document
      .querySelector("[data-iflow-anchor]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Smooth harder over longer windows (more points to lean on).
  const span = days <= 7 ? 3 : days <= 30 ? 4 : 6;

  const rows = useMemo(() => {
    if (!data) return [];
    return data.categories
      .map((cat) => {
        const raw = data.series[cat] || [];
        const smooth = ema(raw, span);
        const nn = smooth.filter((v): v is number => v != null);
        const current = nn.length ? nn[nn.length - 1] : 0;
        const first = nn.length ? nn[0] : 0;
        return { cat, smooth, spark: nn, current, delta: current - first };
      })
      .sort((a, b) => b.current - a.current);
  }, [data, span]);

  const hasData = data && data.dates.length > 0;

  const windowToggle = (
    <Segmented
      options={WINDOWS.map((w) => ({ value: String(w), label: <span className="num">{w}d</span> }))}
      value={String(days)}
      onChange={(v) => setDays(Number(v))}
    />
  );

  const legend = (
    <div className="flex flex-wrap items-center gap-1 text-xs text-text-muted">
      <span>cooling</span>
      {[0.3, 0.6, 1, 1.5, 2.5, 3.5].map((v) => (
        <span
          key={v}
          className="inline-block w-3 h-3 rounded-sm"
          style={{ background: heatColor(v) }}
        />
      ))}
      <span>hot · 1.0× = baseline · EMA-weighted · click a theme to filter the flow tracker</span>
    </div>
  );

  return (
    <div className={embedded ? "" : "card"}>
      <div
        className="flex items-end justify-between flex-wrap gap-3 mb-4"
      >
        <div className="min-w-0">
          <h2 className="section-title">Theme trends</h2>
          <p className="section-sub">
            {view === "pnl" ? "What each theme's flow actually did"
              : view === "rotation" ? "Where money is rotating"
              : "Flow heat over time"}
          </p>
        </div>
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap">
          <Segmented
            options={[
              { value: "matrix", label: "Heat" },
              { value: "pnl", label: "P/L" },
              { value: "rotation", label: "Rotation" },
            ]}
            value={view}
            onChange={(v) => setView(v as "matrix" | "pnl" | "rotation")}
            ariaLabel="Theme view"
          />
          {windowToggle}
        </div>
      </div>

      {view === "pnl" && (
        <ThemePnlView data={pnl.data} isFetching={pnl.isFetching} sub={sub.data}
                      onSelectTheme={selectTheme} categoryFilter={categoryFilter} />
      )}

      {view === "rotation" && (
        <ThemeRotationView data={rot.data} isFetching={rot.isFetching}
                           onSelectTheme={selectTheme} categoryFilter={categoryFilter} />
      )}

      {view === "matrix" && (!hasData ? (
        <div className="h-[120px] flex items-center justify-center text-xs text-text-muted">
          {isFetching ? "loading…" : "No theme-heat history yet."}
        </div>
      ) : (
        <>
          <div className="mb-2">{legend}</div>

          {/* Heat matrix — one row per theme (hottest first), one cell per
              flow-day coloured by EMA-smoothed heat, then current × + trend. */}
          <div className="space-y-0.5">
            {rows.map((r) => {
              const active = categoryFilter === r.cat;
              return (
              <div
                key={r.cat}
                onClick={() => selectTheme(r.cat)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectTheme(r.cat); }
                }}
                aria-label={`Filter flow to ${label(r.cat)}`}
                title={`${label(r.cat)} — click to filter the flow tracker`}
                className="data-row grid items-center gap-3 cursor-pointer px-1.5 -mx-1.5 py-0.5"
                style={{
                  gridTemplateColumns: "minmax(8rem,14rem) minmax(0,1fr) 124px",
                  background: active
                    ? "color-mix(in srgb, var(--accent-cyan) 12%, transparent)"
                    : undefined,
                  opacity: categoryFilter && !active ? 0.55 : 1,
                }}
              >
                <span
                  className="text-sm truncate"
                  style={{ color: active ? "var(--accent-cyan)" : "var(--text-secondary)" }}
                >
                  {label(r.cat)}
                </span>

                <div className="flex gap-px h-5">
                  {r.smooth.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{ background: heatColor(v), minWidth: 2 }}
                      title={`${r.cat} ${data!.dates[i]}: ${v == null ? "—" : v.toFixed(2) + "×"}`}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-end gap-1">
                  <Sparkline points={r.spark} width={36} height={14} color={heatInk(r.current)} />
                  <span
                    className="num text-sm font-medium w-10 text-right"
                    style={{ color: heatInk(r.current) }}
                  >
                    {r.current.toFixed(1)}×
                  </span>
                  <TrendArrow delta={r.delta} />
                </div>
              </div>
              );
            })}
          </div>

          <div className="num text-xs text-text-muted mt-2">
            {data!.dates[0]} → {data!.dates[data!.dates.length - 1]} · {data!.dates.length} flow-days
            {data!.updated_at ? ` · updated ${data!.updated_at.slice(0, 10)}` : ""}
          </div>
        </>
      ))}
    </div>
  );
}
