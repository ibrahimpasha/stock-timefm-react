import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Grid3x3,
  Download,
  ChevronDown,
  Maximize2,
  Palette,
  Layers,
  Radio,
  LayoutGrid,
  Map as MapIcon,
  Sigma,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { useDashboardFilters } from "../../store/useDashboardFilters";
import { useTickerNames } from "../../api/tickerNames";
import { useTickerMeta, type TickerMeta } from "../../api/tickerMeta";
import { useTickerTaxonomy } from "../../api/tickerTaxonomy";
import { useTickerTechnicals, type TickerTechnical } from "../../api/tickerTechnicals";
import { useThemePulseScores } from "../../api/intelGraph";
import { formatPremium } from "../../lib/utils";
import { CompanyMapView } from "../../pages/BayAreaMapPage";
import {
  useIFlowDates,
  useMultiDateSummaries,
  useMultiDateEntries,
  useFlowReturns,
  useTickerEarningsBatch,
} from "./iflow/hooks";
import { squarify } from "./heatmap/squarify";

/* ── Encodings ───────────────────────────────────────────────
 * The whole point of this view is that the encoding is yours to pick. SIZE
 * drives tile area, COLOR drives the green↔red wash, GROUP clusters tiles.
 */

type SizeMetric = "premium" | "entries" | "conviction" | "market_cap";
type ColorMetric = "bias" | "pl" | "target" | "technical" | "pattern";
type GroupBy = "none" | "sector" | "theme" | "subcategory";
type Pulse = "off" | "earnings" | "ml" | "play" | "technical" | "pattern";

const SIZE_OPTIONS: { id: SizeMetric; label: string; hint: string }[] = [
  { id: "premium", label: "Premium $", hint: "total option $ institutions put on the name today" },
  { id: "entries", label: "Entries #", hint: "number of distinct flow prints (attention)" },
  { id: "conviction", label: "Net-directional $", hint: "premium × |bull−bear| share (one-sided conviction)" },
  { id: "market_cap", label: "Market Cap", hint: "company market capitalization (classic finviz sizing)" },
];

const COLOR_OPTIONS: { id: ColorMetric; label: string; hint: string }[] = [
  { id: "bias", label: "Bull / Bear", hint: "green = net buying, red = net selling (this date range)" },
  { id: "pl", label: "Flow P/L %", hint: "est. premium-weighted flow P/L (all-time returns walk)" },
  { id: "target", label: "Target vs Price", hint: "analyst mean target % above (green) / below (red) current price" },
  { id: "technical", label: "Technical", hint: "composite TA score: trend (MA) + momentum (RSI/MACD) + bands + fib retracement" },
  { id: "pattern", label: "Chart pattern", hint: "color by detected pattern direction × strength (double bottom, bull flag, H&S, wedge, …)" },
];

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: "none", label: "None" },
  { id: "sector", label: "Sector" },
  { id: "theme", label: "Theme" },
  { id: "subcategory", label: "Sub-category" },
];

const PULSE_OPTIONS: { id: Pulse; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "no animation" },
  { id: "earnings", label: "Earnings", hint: "tiles breathe as an earnings date approaches within the window set by the Earnings filter slider (faster = sooner)" },
  { id: "ml", label: "ML score", hint: "tiles breathe when the day's best ML score (P[option doubles]) is high" },
  { id: "play", label: "Play score", hint: "tiles breathe when the Theme-Pulse play score is high" },
  { id: "technical", label: "TA setup", hint: "tiles breathe on a technical inflection (fib level / band edge / RSI extreme); ▲▼ = direction" },
  { id: "pattern", label: "Chart pattern", hint: "tiles breathe when a candlestick/chart pattern is detected; ▲▼ = pattern direction" },
];

/** Breathing/beaming animation for active tiles. `--hm-glow` is set per-tile. */
const HEATMAP_KEYFRAMES = `
@keyframes hm-pulse {
  0%, 100% { box-shadow: inset 0 0 0 0 transparent; filter: brightness(1); }
  50% { box-shadow: inset 0 0 0 3px var(--hm-glow); filter: brightness(1.28); }
}`;

interface Cell {
  ticker: string;
  count: number;
  bull: number;
  bear: number;
  premium: number;
}

interface PlacedTile {
  cell: Cell;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GroupRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  headerH: number;
  n: number;
}

/* Hook: track a container's pixel box so the treemap can fill it. */
function useElementSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.floor(r.width);
      const h = Math.floor(r.height);
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    measure(); // synchronous on mount — don't wait for RO's first async tick
    const raf = requestAnimationFrame(measure); // catch post-layout size after a tab switch
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return [ref, size] as const;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const biasOf = (c: Cell) => (c.count ? (c.bull - c.bear) / c.count : 0);

/** Signed pattern strength: + for bull, − for bear, 0 for neutral/none. */
function signedPattern(t?: TickerTechnical): number | null {
  if (!t || !t.pattern || !t.pattern_strength) return null;
  if (t.pattern_dir === "bull") return t.pattern_strength;
  if (t.pattern_dir === "bear") return -t.pattern_strength;
  return 0;
}

function formatCap(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

export function FlowHeatmap() {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const activeTicker = useAppStore((s) => s.activeTicker);
  const { data: names } = useTickerNames();
  const { data: meta } = useTickerMeta();
  const { data: taxonomy } = useTickerTaxonomy();

  const { data: datesData } = useIFlowDates();
  const dates = useMemo(() => datesData?.dates ?? [], [datesData]);
  const latestDate = dates[0]?.date ?? "";

  // Filters live in the shared Zustand store so they survive tab switches
  // (this tab is unmounted on switch, which would otherwise reset local state).
  // pulseThreshold = minimum 0-100 strength a ticker needs to pulse (ML / TA
  // setup / pattern). pulseGroup = when on (and grouping is active), pulse the
  // whole sector/theme frame instead of individual tiles.
  const {
    selectedDates, sizeMetric, colorMetric, groupBy, pulse, pulseThreshold, pulseGroup,
    mlOn, mlMin, playOn, playMin, earnOn, earnDays,
  } = useDashboardFilters((s) => s.heatmap);
  const patchHeatmap = useDashboardFilters((s) => s.patchHeatmap);
  // Treemap (default) vs geographic Map view of the same companies.
  const [view, setView] = useState<"treemap" | "map">("treemap");

  // Empty selection = "today" (latest available date). Multi-date is opt-in,
  // just like the iFlow tracker; the "All" chip selects every loaded date.
  const activeDates = useMemo(() => {
    if (selectedDates.size > 0) return [...selectedDates].sort().reverse();
    return latestDate ? [latestDate] : [];
  }, [selectedDates, latestDate]);

  // Single-click selects ONLY that date (exclusive switch — matches the
  // "click a day to view it" mental model). Shift/⌘/Ctrl-click toggles the date
  // into a multi-date union for comparison. Clicking the sole-selected date
  // clears back to Today (empty set). Without the exclusive default, clicking
  // through dates silently UNIONED them, so the map looked like it showed every
  // ticker regardless of the date picked.
  const pickDate = (d: string, additive: boolean) => {
    if (additive) {
      const next = new Set(selectedDates);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      patchHeatmap({ selectedDates: next });
      return;
    }
    if (selectedDates.size === 1 && selectedDates.has(d)) {
      patchHeatmap({ selectedDates: new Set() }); // toggle the lone date off → Today
    } else {
      patchHeatmap({ selectedDates: new Set([d]) });
    }
  };

  const summaries = useMultiDateSummaries(activeDates, "all");
  const loading = activeDates.length > 0 && summaries.some((q) => q.isLoading && !q.data);
  const { data: returns } = useFlowReturns(colorMetric === "pl");
  const { data: technicals } = useTickerTechnicals(); // reference data, cached

  // Merge per-ticker across the selected dates.
  const cells = useMemo(() => {
    const map = new Map<string, Cell>();
    for (const q of summaries) {
      const d = q.data;
      if (!d?.tickers) continue;
      for (const t of d.tickers) {
        const k = (t.ticker || "").toUpperCase();
        if (!k) continue;
        const cur = map.get(k) ?? { ticker: k, count: 0, bull: 0, bear: 0, premium: 0 };
        cur.count += t.count || 0;
        cur.bull += t.bull || 0;
        cur.bear += t.bear || 0;
        cur.premium += t.total_premium || 0;
        map.set(k, cur);
      }
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries.map((q) => q.dataUpdatedAt).join(","), activeDates.join(",")]);

  // Theme-Pulse play_score per ticker (single small endpoint, always fetched —
  // backs both the "play" pulse and the Play filter).
  const { data: playData } = useThemePulseScores();
  const playScores = playData?.scores;

  // Earnings needed when the earnings pulse OR the earnings filter is active;
  // ML entries when the ML pulse OR the ML filter is active. Reads the single
  // source (ticker_earnings) via the batch endpoint — no recompute for cached.
  const needEarnings = pulse === "earnings" || earnOn;
  const needMl = pulse === "ml" || mlOn;
  const cellTickers = useMemo(() => cells.map((c) => c.ticker), [cells]);
  const { data: earnings } = useTickerEarningsBatch(needEarnings ? cellTickers : []);
  const mlEntryQueries = useMultiDateEntries(needMl ? activeDates : [], true);
  // Best (max) ML score per ticker across the selected dates' entries.
  const mlByTicker = useMemo(() => {
    const m = new Map<string, number>();
    if (!needMl) return m;
    for (const q of mlEntryQueries) {
      for (const e of q.data?.entries ?? []) {
        const tk = String(e.ticker || "").toUpperCase();
        const ml = Number(e.ml_score ?? e.notable?.score ?? 0);
        if (tk && ml > (m.get(tk) ?? 0)) m.set(tk, ml);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needMl, mlEntryQueries.map((q) => q.dataUpdatedAt).join(",")]);

  const sizeValue = useCallback(
    (c: Cell): number => {
      switch (sizeMetric) {
        case "entries":
          return c.count;
        case "conviction":
          return c.premium * Math.abs(biasOf(c));
        case "market_cap":
          // floor so not-yet-fetched / ETF tickers still show (tiny), don't vanish
          return meta?.[c.ticker]?.market_cap || 5e8;
        default:
          return c.premium;
      }
    },
    [sizeMetric, meta]
  );

  const colorValue = useCallback(
    (c: Cell): number | null => {
      if (colorMetric === "pl") return returns?.tickers?.[c.ticker]?.avg_pnl_pct ?? null;
      if (colorMetric === "target") return meta?.[c.ticker]?.target_pct ?? null;
      if (colorMetric === "technical") return technicals?.[c.ticker]?.tech_score ?? null;
      if (colorMetric === "pattern") return signedPattern(technicals?.[c.ticker]);
      return biasOf(c) * 100;
    },
    [colorMetric, returns, meta, technicals]
  );

  // Raw 0..100 strength + direction for the threshold-based pulse metrics
  // (ML / TA setup / chart pattern). null when no data for this ticker.
  const pulseStrength = useCallback(
    (c: Cell): { val: number | null; dir?: "up" | "down" } => {
      if (pulse === "ml") return { val: mlByTicker.get(c.ticker) ?? null };
      if (pulse === "play") return { val: playScores?.[c.ticker] ?? null };
      if (pulse === "technical") {
        const t = technicals?.[c.ticker];
        return t ? { val: t.setup_strength ?? 0, dir: (t.tech_score ?? 0) >= 0 ? "up" : "down" } : { val: null };
      }
      if (pulse === "pattern") {
        const t = technicals?.[c.ticker];
        return t?.pattern
          ? { val: t.pattern_strength ?? 0, dir: t.pattern_dir === "bull" ? "up" : t.pattern_dir === "bear" ? "down" : undefined }
          : { val: null };
      }
      return { val: null };
    },
    [pulse, mlByTicker, playScores, technicals]
  );

  const earningsDays = useCallback(
    (ticker: string): number | null => {
      const iso = earnings?.[ticker];
      if (!iso) return null;
      const days = (new Date(iso).getTime() - Date.now()) / 86400000;
      return days < 0 ? null : days;
    },
    [earnings]
  );

  // Visible cells after the ML / Play / Earnings slider filters (each gated on
  // its toggle). These drive the layout, counts, and group aggregation — the
  // fetches above still cover all `cells` so the filter has data to act on.
  const vcells = useMemo(() => {
    if (!mlOn && !playOn && !earnOn) return cells;
    return cells.filter((c) => {
      if (mlOn && (mlByTicker.get(c.ticker) ?? -1) < mlMin) return false;
      if (playOn && (playScores?.[c.ticker] ?? -1) < playMin) return false;
      if (earnOn) {
        const d = earningsDays(c.ticker);
        if (d == null || d > earnDays) return false;
      }
      return true;
    });
  }, [cells, mlOn, mlMin, mlByTicker, playOn, playMin, playScores, earnOn, earnDays, earningsDays]);
  const filtersActive = mlOn || playOn || earnOn;

  // Per-tile pulse. Earnings is window-gated; ML/TA/pattern gate on the
  // adjustable `pulseThreshold`. Suppressed on tiles when group-pulse is on.
  const pulseOf = useCallback(
    (c: Cell): { on: boolean; intensity: number; dir?: "up" | "down" } => {
      if (pulseGroup && groupBy !== "none") return { on: false, intensity: 0 };
      if (pulse === "earnings") {
        const days = earningsDays(c.ticker);
        if (days == null || days > earnDays) return { on: false, intensity: 0 };
        return { on: true, intensity: days <= earnDays * 0.2 ? 1 : days <= earnDays * 0.5 ? 0.7 : 0.45 };
      }
      const { val, dir } = pulseStrength(c);
      if (val == null || val < pulseThreshold) return { on: false, intensity: 0 };
      return { on: true, intensity: clamp(val / 100, 0.35, 1), dir };
    },
    [pulse, pulseGroup, groupBy, earningsDays, earnDays, pulseStrength, pulseThreshold]
  );

  // Per-group pulse: does this sector/theme have a member that clears the bar?
  const groupPulseOf = useCallback(
    (_key: string, members: Cell[]): { on: boolean; intensity: number; dir?: "up" | "down"; count: number } => {
      if (pulse === "earnings") {
        let soonest = Infinity;
        let count = 0;
        for (const c of members) {
          const d = earningsDays(c.ticker);
          if (d == null || d > earnDays) continue;
          count += 1;
          if (d < soonest) soonest = d;
        }
        if (count === 0) return { on: false, intensity: 0, count: 0 };
        return { on: true, intensity: soonest <= earnDays * 0.2 ? 1 : soonest <= earnDays * 0.5 ? 0.7 : 0.45, count };
      }
      let maxVal = 0;
      let count = 0;
      let up = 0;
      let down = 0;
      for (const c of members) {
        const { val, dir } = pulseStrength(c);
        if (val == null) continue;
        if (val >= pulseThreshold) {
          count += 1;
          if (dir === "up") up += 1;
          else if (dir === "down") down += 1;
        }
        if (val > maxVal) maxVal = val;
      }
      if (count === 0) return { on: false, intensity: 0, count: 0 };
      return {
        on: true,
        intensity: clamp(maxVal / 100, 0.35, 1),
        dir: up > down ? "up" : down > up ? "down" : undefined,
        count,
      };
    },
    [pulse, earningsDays, earnDays, pulseStrength, pulseThreshold]
  );

  const groupOf = useCallback(
    (c: Cell): string => {
      if (groupBy === "none") return "";
      return taxonomy?.[c.ticker]?.[groupBy] || "Unclassified";
    },
    [groupBy, taxonomy]
  );

  // Member cells per group key — backs the group-level pulse aggregation.
  const membersByGroup = useMemo(() => {
    const m = new Map<string, Cell[]>();
    if (groupBy === "none") return m;
    for (const c of vcells) {
      const k = groupOf(c);
      const arr = m.get(k);
      if (arr) arr.push(c);
      else m.set(k, [c]);
    }
    return m;
  }, [vcells, groupBy, groupOf]);

  const [boxRef, box] = useElementSize();

  // Layout: flat squarify, or grouped (two-level) when groupBy is set.
  const { tiles, groups } = useMemo(() => {
    const W = box.width;
    const H = box.height;
    if (W < 2 || H < 2 || vcells.length === 0) return { tiles: [] as PlacedTile[], groups: [] as GroupRect[] };

    if (groupBy === "none") {
      const placed = squarify(
        vcells.map((c) => ({ item: c, value: Math.max(0, sizeValue(c)) })),
        W,
        H
      );
      return {
        tiles: placed.map((p) => ({ cell: p.item, x: p.x, y: p.y, w: p.w, h: p.h })),
        groups: [] as GroupRect[],
      };
    }

    // Group cells, then squarify groups, then squarify each group's tiles.
    const byKey = new Map<string, Cell[]>();
    for (const c of vcells) {
      const k = groupOf(c);
      const arr = byKey.get(k) ?? [];
      arr.push(c);
      byKey.set(k, arr);
    }
    const groupNodes = [...byKey.entries()].map(([key, cs]) => ({
      item: { key, cs },
      value: Math.max(0, cs.reduce((s, c) => s + sizeValue(c), 0)),
    }));
    const groupRects = squarify(groupNodes, W, H);

    const outTiles: PlacedTile[] = [];
    const outGroups: GroupRect[] = [];
    const pad = 2;
    for (const gr of groupRects) {
      const headerH = gr.h > 54 && gr.w > 46 ? 15 : 0;
      const innerX = gr.x + pad;
      const innerY = gr.y + headerH;
      const innerW = Math.max(0, gr.w - pad * 2);
      const innerH = Math.max(0, gr.h - headerH - pad);
      outGroups.push({ key: gr.item.key, x: gr.x, y: gr.y, w: gr.w, h: gr.h, headerH, n: gr.item.cs.length });
      const childPlaced = squarify(
        gr.item.cs.map((c) => ({ item: c, value: Math.max(0, sizeValue(c)) })),
        innerW,
        innerH
      );
      for (const p of childPlaced) {
        outTiles.push({ cell: p.item, x: innerX + p.x, y: innerY + p.y, w: p.w, h: p.h });
      }
    }
    return { tiles: outTiles, groups: outGroups };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vcells, box.width, box.height, sizeMetric, groupBy, meta, taxonomy, returns]);

  const sizeLabel = useCallback(
    (c: Cell): string => {
      if (sizeMetric === "entries") return `${c.count}×`;
      if (sizeMetric === "market_cap") return formatCap(meta?.[c.ticker]?.market_cap);
      return formatPremium(c.premium);
    },
    [sizeMetric, meta]
  );

  const totalPremium = useMemo(() => vcells.reduce((s, c) => s + c.premium, 0), [vcells]);
  const isAll = selectedDates.size > 0 && selectedDates.size === dates.length;

  const viewToggle = (
    <div className="flex items-center rounded-lg border border-border overflow-hidden">
      {(["treemap", "map"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors"
          style={{
            background: view === v ? "color-mix(in srgb, var(--accent-blue) 15%, transparent)" : "transparent",
            color: view === v ? "var(--accent-blue)" : "var(--text-muted)",
          }}
        >
          {v === "treemap" ? <LayoutGrid size={13} /> : <MapIcon size={13} />}
          {v === "treemap" ? "Treemap" : "Map"}
        </button>
      ))}
    </div>
  );

  if (view === "map") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">{viewToggle}</div>
        <CompanyMapView heightOffset={300} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <style>{HEATMAP_KEYFRAMES}</style>
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {viewToggle}
        {/* Date strip — a mini entry-volume histogram: each day's bar height is
            its flow entry count, so heavy days stand out at a glance. */}
        <div className="flex items-stretch rounded-lg border border-border overflow-hidden bg-bg-card">
          <button
            onClick={() => patchHeatmap({ selectedDates: new Set(dates.map((d) => d.date)) })}
            className="px-3 text-xs font-semibold transition-colors flex items-center"
            style={{
              background: isAll ? "color-mix(in srgb, var(--accent-blue) 15%, transparent)" : "transparent",
              color: isAll ? "var(--accent-blue)" : "var(--text-muted)",
            }}
          >
            All
          </button>
          {(() => {
            const slice = dates.slice(0, 10);
            const maxE = Math.max(1, ...slice.map((d) => d.entries || 0));
            return slice.map((d) => {
              const on =
                selectedDates.has(d.date) || (selectedDates.size === 0 && d.date === latestDate);
              const isToday = d.date === latestDate;
              const barH = Math.max(3, Math.round(((d.entries || 0) / maxE) * 20));
              return (
                <button
                  key={d.date}
                  onClick={(e) => pickDate(d.date, e.shiftKey || e.metaKey || e.ctrlKey)}
                  className="flex flex-col items-center justify-end gap-1 px-1.5 py-1.5 border-l border-border transition-colors"
                  style={{ background: on ? "color-mix(in srgb, var(--accent-blue) 14%, transparent)" : "transparent" }}
                  title={`${d.entries} entries · ${d.date}${isToday ? " (today)" : ""} · click to view · shift-click to add days`}
                >
                  <span
                    className="w-2.5 rounded-sm transition-all"
                    style={{
                      height: barH,
                      background: on ? "var(--accent-blue)" : "var(--text-muted)",
                      opacity: on ? 1 : 0.45,
                    }}
                  />
                  <span
                    className="text-[9px] font-mono leading-none"
                    style={{ color: on ? "var(--accent-blue)" : "var(--text-muted)" }}
                  >
                    {isToday ? "Today" : d.date.slice(5)}
                  </span>
                </button>
              );
            });
          })()}
        </div>

        <MetricSelect label="Size" icon={Maximize2} accent="var(--accent-blue)" value={sizeMetric} onChange={(v) => patchHeatmap({ sizeMetric: v as SizeMetric })} options={SIZE_OPTIONS} />
        <MetricSelect label="Color" icon={Palette} accent="var(--accent-purple)" value={colorMetric} onChange={(v) => patchHeatmap({ colorMetric: v as ColorMetric })} options={COLOR_OPTIONS} />
        <MetricSelect label="Group" icon={Layers} accent="var(--accent-cyan, #22d3ee)" value={groupBy} onChange={(v) => patchHeatmap({ groupBy: v as GroupBy })} options={GROUP_OPTIONS} />
        <MetricSelect label="Pulse" icon={Radio} accent="var(--accent-orange, #f59e0b)" value={pulse} onChange={(v) => patchHeatmap({ pulse: v as Pulse })} options={PULSE_OPTIONS} />

        {/* Threshold for the score-based pulses (ML / TA / pattern).
            Earnings pulses gate on the ≤10/20/30d window instead. */}
        {(pulse === "ml" || pulse === "play" || pulse === "technical" || pulse === "pattern") && (
          <label
            className="flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2 py-1.5"
            title="Minimum 0–100 strength a ticker needs to pulse (e.g. ML ≥ 80)"
          >
            <span className="text-[10px] uppercase tracking-wide text-text-muted">≥</span>
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={pulseThreshold}
              onChange={(e) => patchHeatmap({ pulseThreshold: clamp(Number(e.target.value) || 0, 0, 100) })}
              className="w-12 bg-transparent text-xs text-text-primary outline-none font-mono"
            />
          </label>
        )}

        {/* Pulse the whole sector/theme frame instead of individual tiles. */}
        {pulse !== "off" && (
          <label
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs select-none ${
              groupBy === "none"
                ? "border-border text-text-muted opacity-50 cursor-not-allowed"
                : "border-border text-text-secondary cursor-pointer"
            }`}
            title={
              groupBy === "none"
                ? "Pick a Group (Sector / Theme / Sub-category) to enable group pulsing"
                : "Pulse the entire group frame when any member clears the threshold"
            }
          >
            <input
              type="checkbox"
              checked={pulseGroup && groupBy !== "none"}
              disabled={groupBy === "none"}
              onChange={(e) => patchHeatmap({ pulseGroup: e.target.checked })}
              className="accent-accent-blue"
            />
            Pulse group
          </label>
        )}

        {/* Tile filters — hide tiles below/over the slider value when toggled on. */}
        <span className="text-[10px] uppercase tracking-wide text-text-muted ml-1">Filter</span>
        <FilterSlider
          label="ML ≥" on={mlOn} value={mlMin} min={0} max={100} step={5}
          onToggle={(v) => patchHeatmap({ mlOn: v })} onValue={(v) => patchHeatmap({ mlMin: v })}
          title="Hide tiles whose best ML score (P[option doubles]) is below this"
        />
        <FilterSlider
          label="Play ≥" on={playOn} value={playMin} min={0} max={100} step={5}
          onToggle={(v) => patchHeatmap({ playOn: v })} onValue={(v) => patchHeatmap({ playMin: v })}
          title="Hide tiles whose Theme-Pulse play score is below this"
        />
        <FilterSlider
          label="ER ≤" on={earnOn} value={earnDays} min={1} max={90} step={1} suffix="d"
          onToggle={(v) => patchHeatmap({ earnOn: v })} onValue={(v) => patchHeatmap({ earnDays: v })}
          title="Hide tiles with no earnings within this many days (single source: ticker_earnings). Also sets the Earnings pulse window."
        />

        <div className="ml-auto flex items-center gap-2 text-xs">
          {activeDates.length > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold"
              style={{
                color: "var(--accent-blue)",
                borderColor: "color-mix(in srgb, var(--accent-blue) 35%, var(--border))",
                background: "color-mix(in srgb, var(--accent-blue) 10%, transparent)",
              }}
              title="Flow from these dates is merged (unioned). Click a single date to view just that day."
            >
              {activeDates.length} days merged
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1">
            <Grid3x3 size={12} className="text-accent-blue" />
            <span className="font-mono font-semibold text-text-primary">
              {filtersActive ? `${vcells.length}/${cells.length}` : cells.length}
            </span>
            <span className="text-text-muted">tickers</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1">
            <Sigma size={12} className="text-accent-green" />
            <span className="font-mono font-semibold text-text-primary">{formatPremium(totalPremium)}</span>
            <span className="text-text-muted">total</span>
          </span>
          <ColorLegend metric={colorMetric} />
          <a
            href="/api/intel-graph/theme-pulse/export?format=csv"
            download
            title="Download all theme pulses (CSV) for manual analysis"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-text-muted hover:text-accent-cyan hover:border-accent-cyan/40 transition-colors"
          >
            <Download size={12} /> pulses
          </a>
        </div>
      </div>

      {/* ── Treemap ──────────────────────────────────────────── */}
      <div
        ref={boxRef}
        className="relative w-full rounded-lg border border-border bg-bg-primary overflow-hidden"
        style={{ height: "calc(100vh - 320px)", minHeight: 460 }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm animate-pulse">
            loading flow…
          </div>
        )}
        {!loading && vcells.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted text-sm">
            {cells.length > 0 && filtersActive
              ? "No tickers match the active filters."
              : "No flow for the selected date(s)."}
          </div>
        )}

        {/* group frames + headers (behind tiles) */}
        {groups.map((g) => {
          const gp = pulseGroup ? groupPulseOf(g.key, membersByGroup.get(g.key) ?? []) : { on: false, intensity: 0, count: 0 } as { on: boolean; intensity: number; dir?: "up" | "down"; count: number };
          const frameStyle: React.CSSProperties = {};
          if (gp.on) {
            const dur = gp.intensity >= 0.9 ? 0.85 : gp.intensity >= 0.6 ? 1.2 : 1.7;
            const glow = gp.dir === "up" ? "var(--accent-green)" : gp.dir === "down" ? "var(--accent-red)" : "var(--accent-orange, #e3a008)";
            frameStyle.animation = `hm-pulse ${dur}s ease-in-out infinite`;
            (frameStyle as Record<string, string>)["--hm-glow"] = glow;
            frameStyle.borderRadius = "2px";
          }
          return (
            <div
              key={`grp-${g.key}`}
              className="absolute pointer-events-none"
              style={{ left: g.x, top: g.y, width: Math.max(0, g.w - 1), height: Math.max(0, g.h - 1) }}
            >
              <div
                className="absolute inset-0 rounded-sm"
                style={{ border: gp.on ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.15)", ...frameStyle }}
              />
              {g.headerH > 0 && (
                <div
                  className="absolute left-0 top-0 w-full px-1 flex items-center text-[10px] font-semibold uppercase tracking-wide truncate"
                  style={{ height: g.headerH, background: gp.on ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)", color: gp.on ? "var(--text-primary)" : "var(--text-secondary)" }}
                >
                  <span className="truncate">{g.key}</span>
                  <span className="ml-1 opacity-50">{g.n}</span>
                  {gp.on && gp.count > 0 && (
                    <span className="ml-1" style={{ color: "var(--accent-blue)" }}>· {gp.count}★</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* tiles */}
        {tiles.map((p) => {
          const cv = colorValue(p.cell);
          const label =
            colorMetric === "pl"
              ? cv === null
                ? "—"
                : `${cv >= 0 ? "+" : ""}${cv.toFixed(0)}%`
              : colorMetric === "target"
                ? cv === null
                  ? "—"
                  : `${cv >= 0 ? "+" : ""}${cv.toFixed(0)}%`
                : colorMetric === "pattern"
                  ? technicals?.[p.cell.ticker]?.pattern || sizeLabel(p.cell)
                  : sizeLabel(p.cell);
          return (
            <Tile
              key={p.cell.ticker}
              x={p.x}
              y={p.y}
              w={p.w}
              h={p.h}
              cell={p.cell}
              name={names?.[p.cell.ticker]}
              meta={meta?.[p.cell.ticker]}
              tax={taxonomy?.[p.cell.ticker]}
              tech={technicals?.[p.cell.ticker]}
              colorMetric={colorMetric}
              colorVal={cv}
              label={label}
              pulse={pulseOf(p.cell)}
              active={p.cell.ticker === activeTicker}
              onClick={() => setActiveTicker(p.cell.ticker)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── Tile ─────────────────────────────────────────────────── */

function tileBg(metric: ColorMetric, value: number | null): string {
  if (value === null) return "var(--bg-card)";
  let t: number;
  if (metric === "pl") t = clamp(value / 40, -1, 1);
  else if (metric === "target") t = clamp(value / 30, -1, 1);
  else if (metric === "technical") t = clamp(value / 70, -1, 1);
  else if (metric === "pattern") t = clamp(value / 80, -1, 1);
  else t = clamp(value / 100, -1, 1);
  const mag = Math.abs(t);
  const pct = Math.round(10 + 62 * mag); // 10%..72% mixed into the card bg
  const accent = t >= 0 ? "var(--accent-green)" : "var(--accent-red)";
  return `color-mix(in srgb, ${accent} ${pct}%, var(--bg-card))`;
}

function Tile({
  x,
  y,
  w,
  h,
  cell,
  name,
  meta,
  tax,
  tech,
  colorMetric,
  colorVal,
  label,
  pulse,
  active,
  onClick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  cell: Cell;
  name?: string;
  meta?: TickerMeta;
  tax?: { sector: string; theme: string; subcategory: string; direction: string };
  tech?: TickerTechnical;
  colorMetric: ColorMetric;
  colorVal: number | null;
  label: string;
  pulse: { on: boolean; intensity: number; dir?: "up" | "down" };
  active: boolean;
  onClick: () => void;
}) {
  const showTicker = w > 30 && h > 16;
  const showName = w > 96 && h > 50 && !!name;
  const showVal = w > 56 && h > 32;

  // Pulse: faster + brighter the stronger the signal. Glow color follows the
  // direction when known (green up / red down), else a neutral amber.
  const pulseStyle: React.CSSProperties = {};
  if (pulse.on) {
    const dur = pulse.intensity >= 0.9 ? 0.85 : pulse.intensity >= 0.6 ? 1.2 : 1.7;
    const glow =
      pulse.dir === "up"
        ? "var(--accent-green)"
        : pulse.dir === "down"
          ? "var(--accent-red)"
          : "var(--accent-orange, #e3a008)";
    pulseStyle.animation = `hm-pulse ${dur}s ease-in-out infinite`;
    (pulseStyle as Record<string, string>)["--hm-glow"] = glow;
  }
  const showArrow = pulse.on && !!pulse.dir && w > 26 && h > 24;

  const tip =
    `${cell.ticker}${name ? ` · ${name}` : ""}\n` +
    `${formatPremium(cell.premium)} premium · ${cell.count} entries · ${cell.bull} bull / ${cell.bear} bear` +
    (meta?.market_cap ? `\nmkt cap ${formatCap(meta.market_cap)}` : "") +
    (tax?.sector ? `\n${tax.sector} › ${tax.theme}${tax.subcategory ? ` › ${tax.subcategory}` : ""}` : "") +
    (meta?.target_pct !== null && meta?.target_pct !== undefined
      ? `\nanalyst target ${meta.target_pct >= 0 ? "+" : ""}${meta.target_pct.toFixed(1)}% vs price`
      : "") +
    (colorMetric === "pl" && colorVal !== null
      ? `\nflow P/L ${colorVal >= 0 ? "+" : ""}${colorVal.toFixed(1)}%`
      : "") +
    (tech
      ? `\nTA ${tech.tech_score >= 0 ? "+" : ""}${tech.tech_score} (${tech.trend}) · RSI ${tech.rsi14}` +
        (tech.near_level ? ` · at fib ${tech.near_level}` : "") +
        (tech.setup_strength >= 50 ? ` · setup ${tech.setup_strength}` : "")
      : "") +
    (tech?.pattern
      ? `\npattern: ${tech.pattern} (${tech.pattern_dir}, ${tech.pattern_strength})` +
        (tech.patterns && tech.patterns.length > 1 ? `\n  also: ${tech.patterns.slice(1).join(", ")}` : "")
      : "");

  return (
    <button
      type="button"
      onClick={onClick}
      title={tip}
      className="absolute flex flex-col items-center justify-center overflow-hidden text-center transition-[outline] hover:outline hover:outline-2 hover:outline-white/40"
      style={{
        left: x,
        top: y,
        width: Math.max(0, w - 1.5),
        height: Math.max(0, h - 1.5),
        background: tileBg(colorMetric, colorVal),
        outline: active ? "2px solid var(--accent-blue)" : undefined,
        outlineOffset: active ? "-2px" : undefined,
        ...pulseStyle,
      }}
    >
      {showArrow && (
        <span
          className="absolute top-0.5 right-0.5 leading-none font-bold"
          style={{
            fontSize: 11,
            color: pulse.dir === "up" ? "var(--accent-green)" : "var(--accent-red)",
            textShadow: "0 0 2px rgba(0,0,0,0.6)",
          }}
        >
          {pulse.dir === "up" ? "▲" : "▼"}
        </span>
      )}
      {showTicker && (
        <span
          className="font-mono font-bold text-text-primary leading-none"
          style={{ fontSize: Math.min(18, Math.max(9, Math.min(w / 4.5, h / 2.2))) }}
        >
          {cell.ticker}
        </span>
      )}
      {showVal && (
        <span className="font-mono text-text-primary/80 leading-none mt-0.5 text-[10px]">{label}</span>
      )}
      {showName && (
        <span className="text-text-primary/60 leading-tight mt-0.5 px-1 text-[10px] line-clamp-1">{name}</span>
      )}
    </button>
  );
}

/* ── Filter slider (checkbox + range + value) ─────────────── */

function FilterSlider({
  label,
  on,
  value,
  min,
  max,
  step,
  suffix = "",
  onToggle,
  onValue,
  title,
}: {
  label: string;
  on: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onToggle: (v: boolean) => void;
  onValue: (v: number) => void;
  title?: string;
}) {
  const accent = "var(--accent-blue)";
  return (
    <label
      title={title}
      className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer select-none transition-all"
      style={{
        borderColor: on ? `color-mix(in srgb, ${accent} 50%, var(--border))` : "var(--border)",
        background: on ? `color-mix(in srgb, ${accent} 10%, var(--bg-card))` : "var(--bg-card)",
      }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onToggle(e.target.checked)}
        className="accent-accent-blue"
      />
      <span
        className="text-[10px] uppercase tracking-wide whitespace-nowrap"
        style={{ color: on ? accent : "var(--text-muted)" }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValue(Number(e.target.value))}
        className="w-16 accent-accent-blue cursor-pointer"
        style={{ opacity: on ? 1 : 0.5 }}
      />
      <span
        className="font-mono text-xs font-semibold w-9 text-center tabular-nums rounded px-1 py-0.5"
        style={{
          color: on ? accent : "var(--text-muted)",
          background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : "transparent",
        }}
      >
        {value}
        {suffix}
      </span>
    </label>
  );
}

/* ── Metric dropdown ──────────────────────────────────────── */

function MetricSelect({
  label,
  value,
  onChange,
  options,
  icon: Icon,
  accent = "var(--accent-blue)",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; hint?: string }[];
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  accent?: string;
}) {
  const active = options.find((o) => o.id === value);
  return (
    <label
      className="relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all hover:brightness-125"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 35%, var(--border))`,
        background: `color-mix(in srgb, ${accent} 8%, var(--bg-card))`,
      }}
      title={active?.hint}
    >
      {Icon && <Icon size={13} style={{ color: accent }} />}
      <span className="text-[9px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-xs font-semibold text-text-primary whitespace-nowrap">
        {active?.label ?? value}
      </span>
      <ChevronDown size={12} className="text-text-muted" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} className="bg-bg-card text-text-primary">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ── Color legend ─────────────────────────────────────────── */

function ColorLegend({ metric }: { metric: ColorMetric }) {
  const ends: Record<ColorMetric, [string, string]> = {
    bias: ["bear", "bull"],
    pl: ["−40%", "+40%"],
    target: ["below", "above"],
    technical: ["bearish", "bullish"],
    pattern: ["bearish", "bullish"],
  };
  const [lo, hi] = ends[metric];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-card px-2 py-1 text-[10px]">
      <span style={{ color: "var(--accent-red)" }}>{lo}</span>
      <span
        className="inline-block h-2.5 w-16 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--accent-red), color-mix(in srgb, var(--text-muted) 25%, transparent), var(--accent-green))",
        }}
      />
      <span style={{ color: "var(--accent-green)" }}>{hi}</span>
    </span>
  );
}
