/**
 * IFlowTracker — main orchestrator for the options-flow analyzer view.
 *
 * Lives in the right column of the Command Center (v1) page. This file is the
 * top-level component only; the heavy lifting lives in `./iflow/`:
 *   - `iflow/types.ts`      — shared types (filter modes, response shapes)
 *   - `iflow/utils.ts`      — pure helpers (classifySide, dteTag, scoreEntry…)
 *   - `iflow/estimator.ts`  — option P/L estimator (must mirror the Python one)
 *   - `iflow/hooks.ts`      — all React Query hooks used here
 *   - `iflow/EntryRow.tsx`  — single entry row in the detail panel
 *   - `iflow/TickerCard.tsx`— grid card + EarningsBadge
 *   - `iflow/TopPicks.tsx`  — single-date conviction list
 *   - `iflow/TickerDetail.tsx` — right-column detail panel
 *
 * Layout: a viewport-bounded grid with two independent scrollers — long
 * ticker grid no longer pushes the flow detail below the fold.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { QueryNotice } from "../../components/QueryNotice";
import { FlowCoverageNotice } from "../../components/FlowCoverageNotice";
import { flowCoverage } from "../../lib/flowCoverage";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Download,
  Grid,
  List,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import apiClient from "../../api/client";
import { Chip, Segmented } from "../../components/Glass";
import { KpiTile, Tile, TileGrid } from "../../components/Cockpit";
import type { ChipTone } from "../../components/Glass";
import { useAppStore } from "../../store/useAppStore";
import { useDashboardFilters } from "../../store/useDashboardFilters";
import { formatDate, formatPremium } from "../../lib/utils";
import { parseLocalDate, daysFromToday } from "../../lib/dateOnly";
import type { TrackedTicker } from "../../lib/types";
import { useLeaderboard } from "../../api/alerts";
import { useVoicesTrending } from "../../api/voices";
import { useTaxonomy } from "../../api/taxonomy";
import { useThemePulseScores } from "../../api/intelGraph";
import type { BiasFilter, DteFilter, SortMode, EarningsWindow } from "./iflow/types";
import type { IfHighlight } from "../../store/useDashboardFilters";
import { EARNINGS_WINDOW_DAYS, matchesDte, classifySide, dteTag } from "./iflow/utils";
import {
  useIFlowDates,
  useIFlowSummary,
  useMultiDateSummaries,
  useMultiDateEntries,
  useTickerIntelBatch,
  useTickerEarningsBatch,
  useFlowReturns,
  useEscalatingBatch,
} from "./iflow/hooks";
import type { EscRollup } from "./iflow/hooks";
import { TickerCard } from "./iflow/TickerCard";
import { TopPicks } from "./iflow/TopPicks";
import { TopSignals } from "./iflow/TopSignals";
import { TickerDetail } from "./iflow/TickerDetail";
import { ContractsView } from "./iflow/ContractsView";
import { ThemeSection } from "./iflow/ThemeSection";
import { EntryTape } from "./iflow/EntryTape";

type WatchView = "tickers" | "contracts" | "both";
const CARD_GRID = "grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
type GroupMode = "subcat" | "macro" | "flat";

/** Clickable wrapper around the shared `Chip` primitive — used for every
 *  toggleable filter chip in the control strip (dates, bias, DTE, earnings,
 *  traders…). Active state re-expresses the pre-remodel accent colors via
 *  the Chip tone so both themes track automatically. */
function ChipButton({
  active,
  tone,
  onClick,
  title,
  children,
}: {
  active: boolean;
  /** "accent" = amber interaction fill (date selection); other tones are
   *  informational category hues (e.g. purple for traders). */
  tone: ChipTone | "accent";
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  if (tone === "accent") {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-pressed={active}
        className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors lg:min-h-7 ${
          active
            ? "bg-accent text-[var(--accent-ink)]"
            : "border border-border text-text-secondary hover:text-text-primary"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex min-h-11 items-center rounded-full lg:min-h-0"
    >
      <Chip
        tone={active ? tone : "neutral"}
        className={active ? "" : "hover:text-text-primary transition-colors cursor-pointer"}
      >
        {children}
      </Chip>
    </button>
  );
}

export function IFlowTracker() {
  // Filter/view state lives in the shared dashboard-filters store so it
  // survives tab switches (the Command Center unmounts the inactive tab,
  // which would otherwise reset every local useState). UI-only state
  // (selectedTicker, the search input ref) stays local below.
  const {
    bias,
    dte,
    sort,
    // Grid = per-ticker aggregated cards (the original view).
    // Tape = chronological per-entry feed for one date — answers "what just
    // came in today" in raw form. Sort dropdown is hidden in tape mode
    // because tape is always newest-first by arrival timestamp.
    viewMode,
    earningsWindow,
    tradersOnly,
    selectedAuthors,
    search,
    selectedDates,
    watchView,
    groupMode,
    categoryFilter,
    highlightMode,
    highlightMin,
  } = useDashboardFilters((s) => s.iflow);
  const patchIFlow = useDashboardFilters((s) => s.patchIFlow);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeTicker = useAppStore((s) => s.activeTicker);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const watchlist = useAppStore((s) => s.watchlist);
  const watchedContracts = useAppStore((s) => s.watchedContracts);

  // Reverse-sync: when the global activeTicker changes (user typed in the
  // Analyze input, clicked a chip in the Graph Context card, etc.), surface
  // that ticker inside iFlow Tracker too — opens its detail panel + filters
  // the search box so the user sees the same ticker everywhere the dashboard
  // can show it. Forward-sync (clicking a row in iFlow → activeTicker) is
  // handled at the individual click sites.
  useEffect(() => {
    if (activeTicker && activeTicker !== selectedTicker) {
      setSelectedTicker(activeTicker);
      patchIFlow({ search: activeTicker });
    }
    // selectedTicker intentionally excluded — we only react to activeTicker
    // changes, not to internal selection updates that already match it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);
  const { data: taxonomy } = useTaxonomy();

  const datesQuery = useIFlowDates();
  const { data: datesData } = datesQuery;
  const dates = useMemo(() => datesData?.dates ?? [], [datesData?.dates]);
  const isAllDates = selectedDates.size === 0;
  const isSingleDate = selectedDates.size === 1;
  const singleDate = isSingleDate ? [...selectedDates][0] : "";

  // Tape view supports any date selection — single, multi, or All Dates
  // (which falls back to "today" inside the Tape so the user isn't
  // staring at thousands of rows). The earlier single-date restriction
  // was lifted when we added multi-date entry fetching.
  // The actual date list the Tape consumes. When the user hasn't picked
  // anything (All Dates), default to today only — multi-date is opt-in
  // via the date selector to keep the row count manageable.
  const tapeDates: string[] = useMemo(() => {
    if (selectedDates.size > 0) return [...selectedDates].sort().reverse();
    const today = new Date().toISOString().slice(0, 10);
    const def = dates.some((d: { date: string }) => d.date === today) ? today : dates[0]?.date;
    return def ? [def] : [];
  }, [selectedDates, dates]);

  // Date toggling = multi-select. Selecting a new date clears the selected
  // ticker so the right column doesn't show stale data.
  const toggleDate = (d: string) => {
    const next = new Set(selectedDates);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    patchIFlow({ selectedDates: next });
    setSelectedTicker(null);
  };

  const openTicker = (ticker: string) => {
    setSelectedTicker(ticker);
    setActiveTicker(ticker);
    setMobileFiltersOpen(false);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.setTimeout(() => {
        document
          .querySelector("[data-iflow-anchor]")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  // Earnings window is a FILTER on the current date selection's tickers
  // (fixed 2026-08-07 — it used to override the date selection and silently
  // aggregate every date, so "1W + today" showed the whole earnings universe
  // instead of today's flow with earnings within a week).
  const earningsFilterOn = earningsWindow !== "all";
  const useSingleDateView = isSingleDate;

  // Date keys to aggregate when we're NOT in single-date view.
  //   - All Dates / earnings-override → every available date
  //   - Explicit multi-select         → the selected dates
  // The flow JSON files are the authoritative entry source; /flow/iflow/summary
  // reads them directly. We deliberately avoid /flow/tickers — that endpoint
  // reads options_flow.db, which the iflow fetcher no longer populates (and
  // which can also be corrupted), causing "All Dates" to silently empty out.
  const aggregateDateKeys: string[] = useSingleDateView
    ? []
    : isAllDates
    ? dates.map((d) => d.date)
    : [...selectedDates].sort().reverse();

  const summaryQuery = useIFlowSummary(
    useSingleDateView ? singleDate : "",
    dte,
  );
  const { data: summary, isLoading: summaryLoading } = summaryQuery;
  const multiSummaryQueries = useMultiDateSummaries(aggregateDateKeys, dte);
  const aggregateLoading =
    aggregateDateKeys.length > 0 && multiSummaryQueries.some((q) => q.isLoading);

  const loading = datesQuery.isLoading || (useSingleDateView ? summaryLoading : aggregateLoading);
  const loadError = datesQuery.isError || (useSingleDateView
    ? summaryQuery.isError
    : multiSummaryQueries.some((query) => query.isError));

  const retryFlowData = () => {
    void datesQuery.refetch();
    if (useSingleDateView) {
      void summaryQuery.refetch();
    } else {
      for (const query of multiSummaryQueries) void query.refetch();
    }
  };

  // Source of truth for the ticker grid. Single-date view uses the raw
  // summary; everything else merges per-date summaries together. The
  // per-ticker `latest_ts` is carried through (single date) or maxed
  // across dates (multi-date merge) so the "Most Recent" sort works in
  // both modes.
  const tickers: TrackedTicker[] = useMemo(() => {
    if (useSingleDateView) {
      if (!summary) return [];
      return summary.tickers.map((t) => ({
        ticker: t.ticker,
        total_entries: t.count,
        bullish: t.bull,
        bearish: t.bear,
        net_premium: formatPremium(t.total_premium),
        total_premium: t.total_premium,
        latest_ts: t.latest_ts ?? "",
      }));
    }
    const merged: Record<string, { count: number; bull: number; bear: number; premium: number; latest_ts: string }> = {};
    for (const q of multiSummaryQueries) {
      if (!q.data) continue;
      for (const t of q.data.tickers) {
        if (!merged[t.ticker]) merged[t.ticker] = { count: 0, bull: 0, bear: 0, premium: 0, latest_ts: "" };
        merged[t.ticker].count += t.count;
        merged[t.ticker].bull += t.bull;
        merged[t.ticker].bear += t.bear;
        merged[t.ticker].premium += t.total_premium;
        const ts = t.latest_ts ?? "";
        if (ts > merged[t.ticker].latest_ts) merged[t.ticker].latest_ts = ts;
      }
    }
    return Object.entries(merged).map(([ticker, m]) => ({
      ticker,
      total_entries: m.count,
      bullish: m.bull,
      bearish: m.bear,
      net_premium: formatPremium(m.premium),
      total_premium: m.premium,
      latest_ts: m.latest_ts,
    }));
  }, [useSingleDateView, summary, multiSummaryQueries]);

  // Escalation/accumulation intel for the visible tickers (per-ticker history
  // calls are heavy — cap at top 20).
  const tickerNames = useMemo(
    () => tickers.slice(0, 20).map((t) => t.ticker),
    [tickers],
  );
  const { data: intelMap } = useTickerIntelBatch(tickerNames);

  // Earnings batch PREWARMS in the background. Server SQLite cache backs it
  // (24h TTL), so first user click on a window is instant. Don't gate this
  // on the window being active — that was the original "loading earnings…"
  // flash bug.
  //
  // Wait until the underlying summaries have all settled before assembling
  // the ticker list, otherwise the list grows as each per-date summary
  // resolves (42 in parallel for "All Dates"), the React Query cache key
  // changes every time, and we fire a new earnings batch request on every
  // change. `keepPreviousData` on the hook smooths the UX further.
  const allTickerNames = useMemo(
    () => (loading ? [] : tickers.map((t) => t.ticker)),
    [loading, tickers],
  );
  const { data: earningsMap, isFetching: earningsLoading } = useTickerEarningsBatch(allTickerNames);

  // Escalation rollup for EVERY visible ticker — one HTTP, single backend pass
  // over the last 14d of flow. Backs the ↗N chips on ThemeSection headers and
  // each sub-bucket header. Reuses `allTickerNames` (loading-gated above) so
  // it doesn't refire on every interim summary resolution.
  const { data: escMap } = useEscalatingBatch(allTickerNames, 14);

  // ── Grid-card highlight data ───────────────────────────────────────────────
  // The Highlight selector re-points the green border at one of: escalating
  // (default, uses intelMap/escMap above), bullish accumulation, the Theme-Pulse
  // play score, or the best ML score. Play scores are one tiny shared endpoint
  // (cheap, cached with the heat map). ML needs per-entry data, so it's gated on
  // the "ml" mode and bounded to recent dates in All-Dates view.
  const { data: playScoreData } = useThemePulseScores();
  const playScores = playScoreData?.scores;

  // Dates whose entries we walk for the per-ticker best ML score. Mirror the
  // grid's visible-date set, but cap All-Dates to the 10 most-recent so we don't
  // fire ~40 include_notable entry fetches just to light a border.
  const mlDates: string[] = useMemo(() => {
    if (highlightMode !== "ml") return [];
    if (useSingleDateView) return singleDate ? [singleDate] : [];
    if (isAllDates) return dates.slice(0, 10).map((d) => d.date);
    return [...selectedDates].sort().reverse();
  }, [highlightMode, useSingleDateView, singleDate, isAllDates, dates, selectedDates]);
  const mlEntryQueries = useMultiDateEntries(mlDates, true);
  const mlByTicker = useMemo(() => {
    const m = new Map<string, number>();
    for (const q of mlEntryQueries) {
      for (const e of q.data?.entries ?? []) {
        const tk = String(e.ticker || "").toUpperCase();
        // ml lives inside `notable` (v5: 0-100 percentile), so the 80
        // default threshold means "top 20% of recent prints".
        const ml = Number(e.notable?.ml_score ?? 0);
        if (tk && ml > (m.get(tk) ?? 0)) m.set(tk, ml);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mlEntryQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Flow P/L per ticker — only fetched when "Highest Returns" sort is on.
  // Server walks all available flow JSON and premium-weights P/L estimates.
  const returnsQuery = useFlowReturns(sort === "returns");
  const { data: flowReturnsData, isFetching: returnsLoading } = returnsQuery;
  const flowReturnsMap = flowReturnsData?.tickers;
  const flowReturnsMeta = flowReturnsData?.meta;

  // Recent Voices mentions (Serenity, …) for the iFlow ticker-card badge.
  // One trending fetch covers every visible card; the cards just look their
  // ticker up in this map. 15-min staleTime in the hook keeps re-renders
  // free. The badge is purely informational — no fetch is gated on it.
  const { data: voicesTrending } = useVoicesTrending(7, 200);
  const voicesByTicker = useMemo(() => {
    const m: Record<string, { mentions: number; bullish: number; bearish: number }> = {};
    for (const row of voicesTrending?.tickers ?? []) {
      m[row.ticker] = {
        mentions: row.mentions,
        bullish: row.bullish,
        bearish: row.bearish,
      };
    }
    return m;
  }, [voicesTrending]);

  // Trader list for the chip row (ordered by recent activity).
  const { data: leaderboardData } = useLeaderboard(30);
  const traderList = useMemo(() => {
    if (!leaderboardData || !("leaderboard" in leaderboardData)) return [];
    return [...leaderboardData.leaderboard]
      .filter((r) => r.author)
      .sort((a, b) => b.n_calls - a.n_calls);
  }, [leaderboardData]);

  // Per-ticker trader coverage — same source the right panel uses
  // (`trader_matches` annotated on flow entries). Guarantees grid and
  // panel never disagree about which tickers have trader activity.
  const coverageQuery = useQuery<{
    ok: boolean;
    coverage: Record<string, string[]>;
  }>({
    queryKey: ["flow", "trader-coverage", 30],
    queryFn: () =>
      apiClient.get(`/flow/iflow/trader-coverage?days=30`).then((r) => r.data),
    staleTime: 60_000,
    enabled: tradersOnly,
  });
  const { data: coverageData } = coverageQuery;
  const coverageReady = !tradersOnly || (!coverageQuery.isLoading && !coverageQuery.isError);
  const authorTickerSet = useMemo(() => {
    const s = new Set<string>();
    const cov = coverageData?.coverage;
    if (!cov) return s;
    const filterAuthors = selectedAuthors.size > 0 ? selectedAuthors : null;
    for (const [ticker, authors] of Object.entries(cov)) {
      if (!filterAuthors) {
        s.add(ticker);
      } else if (authors.some((a) => filterAuthors.has(a))) {
        s.add(ticker);
      }
    }
    return s;
  }, [coverageData, selectedAuthors]);

  /* Theme filter: resolve the taxonomy category to its ticker set ONCE here,
   * so Grid and Tape filter on exactly the same membership and the Tape never
   * needs the taxonomy itself. */
  const categoryTickers = useMemo(() => {
    if (!categoryFilter || !taxonomy) return null;
    const out = new Set<string>();
    for (const [tk, e] of Object.entries(taxonomy.ticker_lookup)) {
      if (e.category === categoryFilter) out.add(tk.toUpperCase());
    }
    return out;
  }, [categoryFilter, taxonomy]);

  const filtered = useMemo(() => {
    let list = [...tickers];
    if (bias === "bullish") list = list.filter((t) => t.bullish > t.bearish);
    else if (bias === "bearish") list = list.filter((t) => t.bearish > t.bullish);
    if (search) list = list.filter((t) => t.ticker.toUpperCase().includes(search));
    if (tradersOnly) {
      list = list.filter((t) => authorTickerSet.has(t.ticker.toUpperCase()));
    }
    if (categoryTickers) {
      list = list.filter((t) => categoryTickers.has(t.ticker.toUpperCase()));
    }

    const earningsActive = earningsWindow !== "all" && !!earningsMap;
    if (earningsActive) {
      const maxDays = EARNINGS_WINDOW_DAYS[earningsWindow];
      list = list.filter((t) => {
        const d = earningsMap![t.ticker];
        if (!d) return false;
        const days = daysFromToday(d);
        return days >= 0 && days <= maxDays;
      });
      // Earnings-window mode overrides the regular sort: nearest first.
      list.sort((a, b) => {
        const da = earningsMap![a.ticker] ? parseLocalDate(earningsMap![a.ticker]!).getTime() : Infinity;
        const db = earningsMap![b.ticker] ? parseLocalDate(earningsMap![b.ticker]!).getTime() : Infinity;
        return da - db;
      });
      return list;
    }

    if (sort === "entries") {
      list.sort((a, b) => b.total_entries - a.total_entries);
    } else if (sort === "premium") {
      list.sort(
        (a, b) => (b.total_premium ?? 0) - (a.total_premium ?? 0),
      );
    } else if (sort === "score") {
      list.sort((a, b) => {
        const ra = a.total_entries > 0 ? a.bullish / a.total_entries : 0;
        const rb = b.total_entries > 0 ? b.bullish / b.total_entries : 0;
        return Math.abs(rb - 0.5) - Math.abs(ra - 0.5);
      });
    } else if (sort === "escalating" && intelMap) {
      list.sort((a, b) => {
        const ia = intelMap[a.ticker];
        const ib = intelMap[b.ticker];
        const escA = ia?.escalating ? 1 : 0;
        const escB = ib?.escalating ? 1 : 0;
        if (escB !== escA) return escB - escA;
        const scoreA = ia?.accumScore ?? 0;
        const scoreB = ib?.accumScore ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return b.total_entries - a.total_entries;
      });
    } else if (sort === "returns" && flowCoverage(flowReturnsMeta).reliable) {
      // Composite = avg P/L × scored entries. Frequency multiplies score, so
      // a 37-entry +657% ticker decisively beats a 1-entry +5696% outlier.
      list.sort((a, b) => {
        const sa = flowReturnsMap?.[a.ticker]?.score;
        const sb = flowReturnsMap?.[b.ticker]?.score;
        const va = sa ?? -Infinity;
        const vb = sb ?? -Infinity;
        return vb - va;
      });
    } else if (sort === "recent") {
      // Most-recent first by latest_ts. Timestamps are pre-formatted as
      // lex-sortable strings (`YYYY-MM-DD HH:MM[:SS]`), so plain string
      // compare is correct. Entries with no timestamp sink to the bottom;
      // ties broken by entry count.
      list.sort((a, b) => {
        const ta = a.latest_ts || "";
        const tb = b.latest_ts || "";
        if (tb !== ta) return tb > ta ? 1 : -1;
        return b.total_entries - a.total_entries;
      });
    }
    return list;
  }, [tickers, bias, search, sort, intelMap, earningsWindow, earningsMap, flowReturnsMap, flowReturnsMeta, tradersOnly, authorTickerSet, categoryTickers]);

  // Resolve the green-border highlight for one card under the active mode.
  // Returns {on} + a hover title explaining why (and the raw score even when
  // it's below the threshold, so the card stays auditable).
  const highlightOf = (t: TrackedTicker): { on: boolean; title?: string } => {
    const tk = t.ticker;
    switch (highlightMode) {
      case "off":
        return { on: false };
      case "play": {
        const v = playScores?.[tk];
        if (v == null) return { on: false };
        return v >= highlightMin
          ? { on: true, title: `Play score ${v} ≥ ${highlightMin} — flow accumulation + catalyst + technicals (capital-preservation tuned)` }
          : { on: false, title: `Play score ${v}` };
      }
      case "ml": {
        const v = mlByTicker.get(tk);
        if (v == null) return { on: false };
        return v >= highlightMin
          ? { on: true, title: `Best contract ML rank ${v} ≥ ${highlightMin}; not a ticker probability` }
          : { on: false, title: `Best ML score ${v}` };
      }
      case "accum": {
        const lbl = (intelMap?.[tk]?.accumLabel || "").toUpperCase();
        const e = escMap?.[tk];
        const netBull = t.bullish > t.bearish;
        const richBull = lbl.includes("ACCUM") && !lbl.includes("DIST") && netBull;
        const escBull = !!e && e.dominant_side === "Bull" && e.escalating;
        if (richBull) return { on: true, title: lbl.replace(/_/g, " ").toLowerCase() };
        if (escBull) return { on: true, title: "bullish accumulation (strikes escalating, bull side)" };
        return { on: false };
      }
      case "escalating":
      default: {
        const on = !!(intelMap?.[tk]?.escalating || escMap?.[tk]?.escalating);
        return on ? { on: true, title: "strikes escalating" } : { on: false };
      }
    }
  };

  const selectedData = tickers.find((t) => t.ticker === selectedTicker);

  // Day-summary figures for the hero strip — derived from the visible
  // (filtered) tickers so the numbers always match what's on screen.
  const daySum = filtered.reduce(
    (a, t) => {
      a.entries += t.total_entries;
      a.bull += t.bullish;
      a.bear += t.bearish;
      a.prem += t.total_premium ?? 0;
      return a;
    },
    { entries: 0, bull: 0, bear: 0, prem: 0 },
  );
  const sideTotal = daySum.bull + daySum.bear;
  const bullShare = sideTotal > 0 ? Math.round((daySum.bull / sideTotal) * 100) : null;
  const sentiment =
    isSingleDate && summary
      ? summary.net_sentiment
      : daySum.bull > daySum.bear
      ? "BULLISH"
      : daySum.bear > daySum.bull
      ? "BEARISH"
      : "NEUTRAL";
  const scopeLabel = isAllDates
    ? "All dates"
    : isSingleDate
    ? formatDate(singleDate)
    : `${selectedDates.size} dates selected`;

  return (
    /* anchor: clicking a theme in the rotation map scrolls the page here */
    <div
      className="min-w-0 max-w-full overflow-x-clip pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-iflow-anchor
    >
      {/* ── Toolbar: everyday controls in one row; the rest behind Filters ── */}
      <div className="mobile-workspace-controls glass-strong sticky z-20 mb-4 flex min-w-0 flex-wrap items-center gap-2 overflow-y-auto p-2 md:static md:z-auto md:max-h-none md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <div className="mobile-horizontal-strip flex w-full min-w-0 items-center gap-1 overflow-x-auto lg:w-auto lg:max-w-[46%]">
          <ChipButton
            active={isAllDates}
            tone="accent"
            onClick={() => {
              patchIFlow({ selectedDates: new Set() });
              setSelectedTicker(null);
            }}
          >
            All dates
          </ChipButton>
          {dates.slice(0, 8).map((d) => (
            <ChipButton
              key={d.date}
              active={selectedDates.has(d.date)}
              tone="accent"
              title={`${d.entries} entries`}
              onClick={() => toggleDate(d.date)}
            >
              <span className="num">{d.date.slice(5)}</span>
            </ChipButton>
          ))}
        </div>
        <div
          className="relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-full border border-border px-3 py-1.5 transition-colors focus-within:border-accent lg:min-h-0 lg:w-44"
          style={{ background: "var(--glass-bg)" }}
        >
          <Search size={14} className="text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => patchIFlow({ search: e.target.value.toUpperCase() })}
            placeholder="Search ticker"
            className="w-full border-none bg-transparent pr-5 text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                patchIFlow({ search: "" });
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-text-muted transition-colors hover:text-text-primary lg:min-h-0 lg:min-w-0 lg:right-2"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <Segmented<"grid" | "tape">
          ariaLabel="Layout"
          className="mobile-horizontal-strip"
          value={viewMode}
          onChange={(v) => patchIFlow({ viewMode: v })}
          options={[
            {
              value: "grid",
              label: (
                <span className="flex items-center gap-1" title="Per-ticker cards">
                  <Grid size={12} />
                  Grid
                </span>
              ),
            },
            {
              value: "tape",
              label: (
                <span className="flex items-center gap-1" title="Chronological feed of every entry (defaults to today)">
                  <List size={12} />
                  Tape
                </span>
              ),
            },
          ]}
        />

        <Segmented<WatchView>
          ariaLabel="Watchlist view"
          className="mobile-horizontal-strip"
          value={watchView}
          onChange={(v) => patchIFlow({ watchView: v })}
          options={[
            {
              value: "tickers",
              label: "Tickers",
              badge: watchlist.length > 0 ? (
                <span className="num text-text-muted">{watchlist.length}</span>
              ) : undefined,
            },
            {
              value: "contracts",
              label: "Contracts",
              badge: watchedContracts.length > 0 ? (
                <span className="num text-text-muted">{watchedContracts.length}</span>
              ) : undefined,
            },
            {
              value: "both",
              label: "Both",
            },
          ]}
        />

        <label
          className="flex min-h-11 items-center gap-1.5 text-xs text-text-muted lg:min-h-0"
          title={viewMode === "tape" ? "Tape is always sorted by its own columns" : undefined}
        >
          Sort
          <select
            value={sort}
            disabled={viewMode === "tape"}
            onChange={(e) => patchIFlow({ sort: e.target.value as SortMode })}
            className="min-h-11 rounded-full border border-border bg-bg-card px-3 text-xs text-text-primary outline-none focus:border-accent disabled:opacity-40 lg:min-h-8"
          >
            <option value="recent">Most recent</option>
            <option value="entries">Entries</option>
            <option value="premium">Premium</option>
            <option value="score">Conviction</option>
            <option value="escalating">Escalating</option>
            <option value="returns">Estimated return</option>
          </select>
        </label>

        {(() => {
          const activeFilters =
            (bias !== "all" ? 1 : 0) +
            (dte !== "all" ? 1 : 0) +
            (earningsWindow !== "all" ? 1 : 0) +
            (tradersOnly ? 1 : 0) +
            (groupMode !== "subcat" ? 1 : 0) +
            (highlightMode !== "escalating" ? 1 : 0);
          const row = "flex min-w-0 flex-col gap-1.5 md:flex-row md:items-center md:gap-3";
          const lbl = "w-20 shrink-0 text-xs text-text-muted";
          return (
            <details
              open={mobileFiltersOpen}
              onToggle={(e) => setMobileFiltersOpen(e.currentTarget.open)}
              className="group relative max-lg:open:w-full"
            >
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary lg:min-h-8 [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal size={13} aria-hidden="true" />
                Filters
                {activeFilters > 0 && (
                  <span className="num rounded-full bg-accent px-1.5 text-xs font-semibold text-[var(--accent-ink)]">
                    {activeFilters}
                  </span>
                )}
                <ChevronDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
              </summary>
              <div
                id="iflow-mobile-filters"
                className="card mt-2 flex w-full flex-col gap-3 p-4 lg:absolute lg:right-0 lg:top-full lg:z-30 lg:w-[34rem] lg:max-w-[calc(100vw-2rem)]"
              >
                <div className={row}>
                  <span className={lbl}>Bias</span>
                  <Segmented<BiasFilter>
                    ariaLabel="Bias"
                    className="mobile-horizontal-strip"
                    value={bias}
                    onChange={(v) => patchIFlow({ bias: v })}
                    options={[
                      { value: "all", label: "All" },
                      { value: "bullish", label: "Bullish" },
                      { value: "bearish", label: "Bearish" },
                    ]}
                  />
                </div>
                <div className={row}>
                  <span className={lbl}>DTE</span>
                  <Segmented<DteFilter>
                    ariaLabel="DTE"
                    className="mobile-horizontal-strip"
                    value={dte}
                    onChange={(v) => {
                      patchIFlow({ dte: v });
                      setSelectedTicker(null);
                    }}
                    options={[
                      { value: "all", label: "All" },
                      { value: "lotto", label: "Lotto" },
                      { value: "swing", label: "Swing" },
                      { value: "leap", label: "Leap" },
                    ]}
                  />
                </div>
                <div className={row}>
                  <span className={lbl}>Earnings</span>
                  <Segmented<EarningsWindow>
                    ariaLabel="Earnings window"
                    className="mobile-horizontal-strip"
                    value={earningsWindow}
                    onChange={(v) => patchIFlow({ earningsWindow: v })}
                    options={[
                      { value: "all", label: "Any" },
                      { value: "today", label: "Today" },
                      { value: "1w", label: "1W" },
                      { value: "2w", label: "2W" },
                      { value: "1m", label: "1M" },
                      { value: "2m", label: "2M" },
                    ]}
                  />
                  {earningsWindow !== "all" && earningsLoading && !earningsMap && (
                    <span className="animate-pulse text-xs text-text-muted">Loading earnings…</span>
                  )}
                </div>
                <div
                  className={row}
                  title={
                    "Subcat: by sector → broad clustered subcategory (84 buckets, e.g. EUV Litho WFE).\n" +
                    "Macro: by sector → primary macro driver (M1-M10).\n" +
                    "Flat: no grouping — flat grid sorted by the chosen sort mode."
                  }
                >
                  <span className={lbl}>Group</span>
                  <Segmented<GroupMode>
                    ariaLabel="Group"
                    className="mobile-horizontal-strip"
                    value={groupMode}
                    onChange={(v) => patchIFlow({ groupMode: v })}
                    options={[
                      { value: "subcat", label: "Subcategory" },
                      { value: "macro", label: "Macro" },
                      { value: "flat", label: "Flat" },
                    ]}
                  />
                </div>
                {/* Highlight: which signal marks a grid card. Grid-only. */}
                {viewMode !== "tape" && (
                  <div className={row}>
                    <span className={lbl}>Highlight</span>
                    <Segmented<IfHighlight>
                      ariaLabel="Highlight"
                      className="mobile-horizontal-strip"
                      value={highlightMode}
                      onChange={(v) => patchIFlow({ highlightMode: v })}
                      options={[
                        { value: "off", label: <span title="No highlight">Off</span> },
                        { value: "escalating", label: <span title="Strikes escalating (original default)">Esc</span> },
                        { value: "accum", label: <span title="Bullish accumulation (accumulation label / escalating bull side)">Accum</span> },
                        { value: "play", label: <span title="Theme-Pulse play score ≥ threshold — capital-preservation tuned">Play</span> },
                        { value: "ml", label: <span title="Best within-DTE ML percentile ≥ threshold on recent flow">ML</span> },
                      ]}
                    />
                    {(highlightMode === "play" || highlightMode === "ml") && (
                      <label
                        className="flex items-center gap-1.5 text-xs text-text-muted"
                        title="Minimum 0–100 score a ticker needs to be highlighted"
                      >
                        Min
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={5}
                          value={highlightMin}
                          onChange={(e) =>
                            patchIFlow({ highlightMin: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                          }
                          className="num w-14 rounded-full border border-border bg-transparent px-2 py-0.5 text-xs text-text-primary outline-none"
                        />
                      </label>
                    )}
                  </div>
                )}
                <div className={row}>
                  <span className={lbl}>Traders</span>
                  <div className="mobile-horizontal-strip flex min-w-0 flex-wrap items-center gap-1">
                    <ChipButton
                      active={tradersOnly}
                      tone="purple"
                      onClick={() => {
                        const next = !tradersOnly;
                        // Clearing Traders also clears any author selection so a stale
                        // author filter doesn't silently apply next time it's enabled.
                        patchIFlow(
                          next
                            ? { tradersOnly: true }
                            : { tradersOnly: false, selectedAuthors: new Set() },
                        );
                      }}
                    >
                      Only trader-called tickers
                    </ChipButton>
                    {tradersOnly && traderList.map((t) => (
                      <ChipButton
                        key={t.author}
                        active={selectedAuthors.has(t.author)}
                        tone="purple"
                        title={`${t.n_calls} calls · top ${t.top_ticker ?? "—"}`}
                        onClick={() => {
                          const next = new Set(selectedAuthors);
                          if (next.has(t.author)) next.delete(t.author);
                          else next.add(t.author);
                          patchIFlow({ selectedAuthors: next });
                          setSelectedTicker(null);
                        }}
                      >
                        {t.author}
                        <span className="num text-text-muted">{t.n_calls}</span>
                      </ChipButton>
                    ))}
                    {tradersOnly && selectedAuthors.size > 0 && (
                      <button
                        type="button"
                        onClick={() => patchIFlow({ selectedAuthors: new Set() })}
                        aria-label="Clear trader selection"
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-xs text-text-muted transition-colors hover:text-text-primary lg:min-h-0 lg:min-w-0 lg:px-2 lg:py-1"
                        title="Clear trader selection"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <span className="text-xs text-text-muted">Export the visible tickers with full P/L</span>
                  <DownloadCsvButton
                    filteredTickers={filtered.map((t) => t.ticker)}
                    selectedDates={selectedDates}
                    isAllDates={isAllDates}
                    dte={dte}
                  />
                </div>
              </div>
            </details>
          );
        })()}

        {categoryFilter && (
          <button
            type="button"
            onClick={() => patchIFlow({ categoryFilter: "" })}
            title="Clear the theme filter"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-card-hover lg:min-h-8"
          >
            {categoryFilter.replace(/_/g, " ").toLowerCase()}
            <X size={11} className="text-text-muted" />
          </button>
        )}

        {/* Async status for the returns sort (text, not controls) */}
        {sort === "returns" && viewMode !== "tape" && (returnsLoading || flowReturnsMeta?.earliest_date) && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            {returnsLoading ? (
              <span className="animate-pulse text-accent">Loading returns…</span>
            ) : (
              <span className="num">
                flow since {flowReturnsMeta!.earliest_date} · {flowReturnsMeta!.days_covered}d ·{" "}
                {flowReturnsMeta!.entry_count.toLocaleString()} entries
              </span>
            )}
          </div>
        )}
        {sort === "returns" && <><QueryNotice queries={[returnsQuery]} label="Flow return estimates" /><FlowCoverageNotice meta={flowReturnsMeta} /></>}
      </div>

      {/* ── KPI strip + ranked lists: one cockpit grid ── */}
      {!loading && !loadError && (
        <TileGrid className="mb-3.5">
          <KpiTile
            label={
              <>
                Premium · {scopeLabel}
                {earningsFilterOn && <> · earnings within {earningsWindow.toUpperCase()}</>}
              </>
            }
            /* ponytail: formatPremium tops out at M; the all-dates total runs into billions */
            value={daySum.prem >= 1e9 ? `$${(daySum.prem / 1e9).toFixed(1)}B` : formatPremium(daySum.prem)}
            delta={sentiment.charAt(0) + sentiment.slice(1).toLowerCase()}
            tone={sentiment === "BULLISH" ? "up" : sentiment === "BEARISH" ? "down" : "neutral"}
            sub={bullShare != null ? `${bullShare}% bull entries` : undefined}
          />
          <KpiTile
            label="Tickers"
            value={filtered.length.toLocaleString()}
            sub={tickers.length !== filtered.length ? `of ${tickers.length.toLocaleString()} with flow` : "with flow"}
          />
          <KpiTile
            label="Entries"
            value={daySum.entries.toLocaleString()}
            sub={filtered.length > 0 ? `${(daySum.entries / filtered.length).toFixed(1)} per ticker` : undefined}
          />
          <KpiTile
            label="Bull / bear"
            value={
              <>
                <span className="delta-up">{daySum.bull.toLocaleString()}</span>
                <span className="text-text-muted"> / </span>
                <span className="delta-down">{daySum.bear.toLocaleString()}</span>
              </>
            }
            sub={
              isSingleDate && summary && !earningsFilterOn ? (
                `day ${summary.bull_count} / ${summary.bear_count}`
              ) : bullShare != null ? (
                <span className="inline-flex h-1.5 w-full max-w-40 overflow-hidden rounded-full align-middle" style={{ background: "var(--track)" }} aria-label={`${bullShare}% bull`}>
                  <span style={{ width: `${bullShare}%`, background: "var(--accent-green)" }} />
                  <span style={{ width: `${100 - bullShare}%`, background: "var(--accent-red)" }} />
                </span>
              ) : undefined
            }
          />
          {/* Top Picks + Top Signals (single date only); each renders its own Tile or nothing */}
          {isSingleDate && singleDate && (
            <>
              <TopPicks date={singleDate} dteFilter={dte} />
              <TopSignals date={singleDate} dteFilter={dte} />
            </>
          )}
        </TileGrid>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {loading && (
        <div className="animate-pulse">
          <TileGrid className="mb-3.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-border bg-bg-card lg:col-span-3" />
            ))}
          </TileGrid>
          <div className="h-80 rounded-xl border border-border bg-bg-card" />
        </div>
      )}

      {!loading && loadError && (
        <div className="card flex items-center justify-center gap-2 py-8 text-sm text-accent-red">
          <AlertTriangle size={14} />
          <span>Unable to load flow data.</span>
          <button
            type="button"
            onClick={retryFlowData}
            className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary"
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {/* ── Grid + Detail (two independent scrollers) ───────────────── */}
      {/* Each column has its own overflow-y-auto so a long ticker grid
          doesn't push the flow detail below the fold. If the page chrome
          height changes, adjust the 260px offset. */}
      {!loading && !loadError && (
        <div
          className="grid min-w-0 grid-cols-12 gap-4 max-lg:gap-2 max-lg:!h-auto max-lg:!min-h-0"
          style={{ height: "calc(100vh - 260px)", minHeight: 420 }}
        >
          <div
            className={`${selectedTicker ? "col-span-7 max-lg:hidden" : "col-span-12"} flex min-w-0 max-w-full flex-col gap-3.5 overflow-y-auto pr-1 max-lg:col-span-12 max-lg:overflow-visible max-lg:pr-0`}
          >
            {tradersOnly && coverageQuery.isLoading && (
              <div className="card flex items-center justify-center gap-2 py-6 text-xs text-text-muted">
                <Loader2 size={13} className="animate-spin" /> Loading trader coverage...
              </div>
            )}
            {tradersOnly && coverageQuery.isError && (
              <div className="card flex items-center justify-center gap-2 py-6 text-xs text-accent-red">
                <AlertTriangle size={13} />
                <span>Unable to load trader coverage.</span>
                <button
                  type="button"
                  onClick={() => void coverageQuery.refetch()}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
                >
                  <RefreshCw size={11} /> Retry
                </button>
              </div>
            )}
            {/* Watched-contracts surface: shown in "contracts" + "both" modes. */}
            {(watchView === "contracts" || watchView === "both") && (
              <div className="min-w-0 max-w-full">
                <ContractsView
                  onSelectTicker={openTicker}
                />
              </div>
            )}
            {/* Tape mode: chronological feed of all entries across
                whichever dates are selected. Single-date, multi-date,
                and All Dates (defaults to today) all work — the merge
                happens inside EntryTape via useMultiDateEntries. */}
            {coverageReady && watchView !== "contracts" && viewMode === "tape" && tapeDates.length > 0 && (
              <div className="min-w-0 max-w-full">
                <EntryTape
                  dates={tapeDates}
                  bias={bias}
                  dte={dte}
                  search={search}
                  tradersOnly={tradersOnly}
                  authorTickerSet={authorTickerSet}
                  categoryTickers={categoryTickers}
                  earningsWindow={earningsWindow}
                  earningsMap={earningsMap ?? null}
                  earningsMaxDays={earningsWindow !== "all" ? EARNINGS_WINDOW_DAYS[earningsWindow] : null}
                  selectedTicker={selectedTicker}
                  onSelectTicker={openTicker}
                />
              </div>
            )}
            {/* Ticker grid: hidden entirely in "contracts" mode. */}
            {coverageReady && watchView !== "contracts" && viewMode === "grid" && (() => {
              // Pull watched tickers from the FULL list (not `filtered`) so filter
              // changes don't hide pinned tickers. Watched tickers are subtracted
              // from the main grid to avoid showing the same card twice.
              const watchSet = new Set(watchlist);
              const watchedShown = tickers.filter(
                (t) => watchSet.has(t.ticker) && (!tradersOnly || authorTickerSet.has(t.ticker.toUpperCase())),
              );
              const othersShown = filtered.filter((t) => !watchSet.has(t.ticker));
              const renderCard = (t: TrackedTicker) => {
                // Merge the rich top-20 intel with the universal 14d escalation
                // rollup so the green border + ↗ icon work for every visible
                // ticker, not just the prewarmed 20.
                const richIntel = intelMap?.[t.ticker];
                const escRow = escMap?.[t.ticker];
                const mergedIntel = richIntel
                  ? richIntel
                  : escRow
                    ? {
                        escalating: escRow.escalating,
                        accumScore: 0,
                        accumLabel: "",
                        exitSignals: 0,
                        daysActive: escRow.days_active,
                      }
                    : undefined;
                const hl = highlightOf(t);
                return (
                <TickerCard
                  key={t.ticker}
                  t={t}
                  selected={selectedTicker === t.ticker}
                  onClick={() => {
                    if (selectedTicker === t.ticker) {
                      setSelectedTicker(null);
                    } else {
                      openTicker(t.ticker);
                    }
                  }}
                  intel={mergedIntel}
                  highlightOn={hl.on}
                  highlightTitle={hl.title}
                  voicesIntel={voicesByTicker[t.ticker]}
                  retPct={
                    sort === "returns"
                      ? flowReturnsMap?.[t.ticker]?.avg_pnl_pct ?? null
                      : undefined
                  }
                  retEntries={
                    sort === "returns" ? flowReturnsMap?.[t.ticker]?.scored_entries ?? 0 : undefined
                  }
                />
                );
              };

              if (filtered.length === 0 && watchedShown.length === 0) {
                return (
                  <Tile title="No tickers match your filters">
                    <p className="m-0 text-sm text-text-muted">Loosen bias, DTE or earnings in Filters, or pick another date.</p>
                  </Tile>
                );
              }

              return (
                <>
                  {watchlist.length > 0 && (
                    <Tile
                      title={
                        <span className="inline-flex items-baseline gap-2">
                          <Star size={13} className="self-center text-accent-orange" style={{ fill: "var(--accent-orange)" }} aria-hidden="true" />
                          Watchlist
                          <span className="num text-xs font-normal text-text-muted">
                            {watchedShown.length}
                            {watchedShown.length < watchlist.length && <>/{watchlist.length}</>}
                          </span>
                        </span>
                      }
                    >
                      {watchedShown.length === 0 ? (
                        <div className="text-sm text-text-muted">
                          None of your watched tickers have flow on the selected dates.
                        </div>
                      ) : (
                        <div className={CARD_GRID}>{watchedShown.map(renderCard)}</div>
                      )}
                    </Tile>
                  )}
                  {othersShown.length > 0 &&
                    (groupMode !== "flat" && taxonomy ? (
                      <ThemedGrid
                        tickers={othersShown}
                        taxonomy={taxonomy}
                        renderCard={renderCard}
                        subGroupBy={groupMode === "subcat" ? "theme" : "macro"}
                        escMap={escMap}
                      />
                    ) : (
                      <Tile
                        title={
                          <>
                            {watchlist.length > 0 ? "All tickers" : "Tickers"}{" "}
                            <span className="num text-xs font-normal text-text-muted">{othersShown.length}</span>
                          </>
                        }
                      >
                        <div className={CARD_GRID}>{othersShown.map(renderCard)}</div>
                      </Tile>
                    ))}
                </>
              );
            })()}
          </div>
          {selectedTicker && selectedData && (
            <div className="col-span-5 min-w-0 max-w-full overflow-y-auto pr-1 max-lg:col-span-12 max-lg:overflow-visible max-lg:pr-0">
              <button
                type="button"
                onClick={() => setSelectedTicker(null)}
                className="glass-strong sticky top-[calc(3rem+env(safe-area-inset-top))] z-10 mb-2 inline-flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] px-3 text-xs font-semibold text-text-secondary lg:hidden"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to tickers
              </button>
              <TickerDetail
                ticker={selectedTicker}
                trackedData={selectedData}
                selectedDates={selectedDates}
                dteFilter={dte}
                tradersOnly={tradersOnly}
                selectedAuthors={selectedAuthors}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Themed grid (renders one collapsible section per sector category) ──────
// Buckets `tickers` by `taxonomy.ticker_lookup[ticker].category` and emits one
// ThemeSection per category. Categories with zero visible tickers are skipped.
// Tickers that don't appear in the taxonomy fall into an UNCLASSIFIED section
// rendered last. Iteration follows the JSON's natural key order (which the
// taxonomy author curated as AI_INFRASTRUCTURE → AI_POWER → ... → SPECIAL_SITUATIONS).
function ThemedGrid({
  tickers,
  taxonomy,
  renderCard,
  subGroupBy = "macro",
  escMap,
}: {
  tickers: TrackedTicker[];
  taxonomy: import("../../api/taxonomy").Taxonomy;
  renderCard: (t: TrackedTicker) => React.ReactNode;
  subGroupBy?: "macro" | "theme";
  escMap?: Record<string, EscRollup>;
}) {
  const lookup = taxonomy.ticker_lookup;
  const byCategory: Record<string, TrackedTicker[]> = {};
  const unclassified: TrackedTicker[] = [];
  for (const t of tickers) {
    const cat = lookup[t.ticker]?.category;
    if (!cat) {
      unclassified.push(t);
      continue;
    }
    (byCategory[cat] ||= []).push(t);
  }
  const categoryOrder = Object.keys(taxonomy.taxonomy);
  const themeDescByCat = taxonomy.theme_descriptions || {};

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {categoryOrder.map((cat) => {
        const items = byCategory[cat];
        if (!items || items.length === 0) return null;
        return (
          <ThemeSection
            key={cat}
            category={cat}
            categoryDescription={taxonomy.category_descriptions[cat]}
            visibleTickers={items}
            lookupMap={lookup}
            macros={taxonomy.macros}
            bottlenecks={taxonomy.bottlenecks}
            initiallyExpanded
            renderCard={renderCard}
            subGroupBy={subGroupBy}
            themeDescriptions={themeDescByCat[cat]}
            escMap={escMap}
          />
        );
      })}
      {unclassified.length > 0 && (
        <ThemeSection
          key="__UNCLASSIFIED__"
          category="UNCLASSIFIED"
          categoryDescription="Tickers with flow but not present in the sector taxonomy"
          visibleTickers={unclassified}
          lookupMap={lookup}
          macros={taxonomy.macros}
          bottlenecks={taxonomy.bottlenecks}
          initiallyExpanded={false}
          renderCard={renderCard}
          subGroupBy={subGroupBy}
          escMap={escMap}
        />
      )}
    </div>
  );
}

// ── CSV download ──────────────────────────────────────────────────────────────
// Calls /flow/iflow/entries-export with the filtered ticker list, then applies
// the date + DTE filter client-side. Backend already enriches each entry with
// the current price and est P/L using the same delta+theta model as the per-row
// badges, so the CSV stays consistent with what's shown on screen.
function DownloadCsvButton({
  filteredTickers,
  selectedDates,
  isAllDates,
  dte,
}: {
  filteredTickers: string[];
  selectedDates: Set<string>;
  isAllDates: boolean;
  dte: DteFilter;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!filteredTickers.length || busy) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ days: "365", tickers: filteredTickers.join(",") });
      const { data } = await apiClient.get<{
        meta: { earliest_date: string | null; latest_date: string | null; entry_count: number };
        entries: any[];
      }>(`/flow/iflow/entries-export?${params}`);

      let entries = data?.entries ?? [];
      // Apply date + DTE filters client-side so the CSV always matches what's
      // visible in the UI.
      if (!isAllDates && selectedDates.size > 0) {
        entries = entries.filter((e) => selectedDates.has(e.date));
      }
      if (dte !== "all") {
        entries = entries.filter((e) => matchesDte(e.dte, dte));
      }
      if (!entries.length) {
        alert("No entries match the current filters.");
        return;
      }

      const cols = [
        "date", "ticker", "side", "action", "type", "strike", "expiry",
        "dte", "dte_bucket", "vol_oi_ratio", "ask_pct", "bid_pct", "multi_pct",
        "premium", "net_premium", "underlying_at_fill", "current_price",
        "opt_fill", "est_pnl_pct", "channel", "analysis",
      ];

      const esc = (v: any): string => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const rows = entries.map((e) => {
        const { action } = classifySide(e.type, e.ask_pct, e.vol_oi_ratio, e.side);
        const bucket = dteTag(e.dte)?.text ?? "";
        const row: Record<string, any> = { ...e, action, dte_bucket: bucket };
        return cols.map((c) => esc(row[c])).join(",");
      });

      const csv = [cols.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      // iflow-2026-05-11-43t.csv (single date) / iflow-all-43t.csv (all dates)
      // / iflow-multi-43t.csv (>1 explicit date selected)
      const datePart = isAllDates
        ? "all"
        : selectedDates.size === 1
        ? [...selectedDates][0]
        : "multi";
      a.href = url;
      a.download = `iflow-${datePart}-${filteredTickers.length}t-${entries.length}rows.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("CSV export failed:", err);
      alert(`Export failed: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy || filteredTickers.length === 0}
      title={
        filteredTickers.length === 0
          ? "No tickers match the current filters"
          : `Download CSV of ${filteredTickers.length} ticker(s) with full P/L`
      }
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-8"
    >
      <Download size={12} />
      {busy ? "Exporting…" : "Download CSV"}
    </button>
  );
}
