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
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, X, Star, Grid, List, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import apiClient from "../../api/client";
import { Chip, Segmented } from "../../components/Glass";
import type { ChipTone } from "../../components/Glass";
import { useAppStore } from "../../store/useAppStore";
import { useDashboardFilters } from "../../store/useDashboardFilters";
import { formatPremium } from "../../lib/utils";
import { parseLocalDate, daysFromToday } from "../../lib/dateOnly";
import type { TrackedTicker } from "../../lib/types";
import { useLeaderboard } from "../../api/alerts";
import { useVoicesTrending } from "../../api/voices";
import { useTaxonomy } from "../../api/taxonomy";
import { useThemePulseScores } from "../../api/intelGraph";
import type { BiasFilter, DteFilter, SortMode, EarningsWindow } from "./iflow/types";
import type { IfHighlight } from "../../store/useDashboardFilters";
import { EARNINGS_WINDOW_DAYS, parsePremium, matchesDte, classifySide, dteTag } from "./iflow/utils";
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
  tone: ChipTone;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title} className="rounded-full">
      <Chip
        tone={active ? tone : "neutral"}
        className={active ? "" : "hover:text-text-primary transition-colors cursor-pointer"}
      >
        {children}
      </Chip>
    </button>
  );
}

/** Tiny muted label preceding a control group in the strip. */
function StripLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs text-text-muted">{children}</span>;
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
        // ml lives inside `notable` — the old `e.ml_score` read hit nothing
        // and fell through to NScore, so the "ML" highlight thresholded the
        // wrong metric entirely. Use the 0-100 display rank so the 80 default
        // threshold means "top 20% of recent prints".
        const ml = Number(e.notable?.ml_rank ?? e.notable?.ml_score ?? 0);
        if (tk && ml > (m.get(tk) ?? 0)) m.set(tk, ml);
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mlEntryQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Flow P/L per ticker — only fetched when "Highest Returns" sort is on.
  // Server walks all available flow JSON and premium-weights P/L estimates.
  const { data: flowReturnsData, isFetching: returnsLoading } = useFlowReturns(sort === "returns");
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
        (a, b) => parsePremium(b.net_premium || "$0") - parsePremium(a.net_premium || "$0"),
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
    } else if (sort === "returns") {
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
  }, [tickers, bias, search, sort, intelMap, earningsWindow, earningsMap, flowReturnsMap, tradersOnly, authorTickerSet, categoryTickers]);

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
          ? { on: true, title: `Best ML rank ${v} ≥ ${highlightMin} (percentile vs last 60d of prints)` }
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

  return (
    /* anchor: clicking a theme in the rotation map scrolls the page here */
    <div data-iflow-anchor>
      {/* ── Control strip: dates + search + view/group/sort/filters ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <ChipButton
            active={isAllDates}
            tone="blue"
            onClick={() => {
              patchIFlow({ selectedDates: new Set() });
              setSelectedTicker(null);
            }}
          >
            All Dates
          </ChipButton>
          {dates.slice(0, 8).map((d) => (
            <ChipButton
              key={d.date}
              active={selectedDates.has(d.date)}
              tone="blue"
              onClick={() => toggleDate(d.date)}
            >
              <span className="num">{d.date.slice(5)}</span>
              <span className="num opacity-60">{d.entries}</span>
            </ChipButton>
          ))}
        </div>
        <div
          className="relative flex items-center gap-2 rounded-full border border-border px-3 py-1.5 flex-1 max-w-xs focus-within:border-accent-blue transition-colors"
          style={{ background: "var(--glass-bg)" }}
        >
          <Search size={14} className="text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => patchIFlow({ search: e.target.value.toUpperCase() })}
            placeholder="Search ticker..."
            className="bg-transparent border-none outline-none text-text-primary font-mono text-xs w-full placeholder:text-text-muted pr-5"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                patchIFlow({ search: "" });
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span className="text-xs text-text-muted">
          {filtered.length} tickers
          {earningsFilterOn ? (
            <> — with earnings ≤{earningsWindow.toUpperCase()} out</>
          ) : (
            <>
              {isSingleDate && summary && (
                <>
                  {" "}
                  —{" "}
                  <span
                    style={{
                      color:
                        summary.net_sentiment === "BULLISH"
                          ? "var(--accent-green)"
                          : summary.net_sentiment === "BEARISH"
                          ? "var(--accent-red)"
                          : "var(--accent-orange)",
                    }}
                  >
                    {summary.net_sentiment}
                  </span>{" "}
                  ({summary.bull_count}B / {summary.bear_count}R)
                </>
              )}
              {selectedDates.size > 1 && <> — {selectedDates.size} dates selected</>}
            </>
          )}
        </span>
        <DownloadCsvButton
          filteredTickers={filtered.map((t) => t.ticker)}
          selectedDates={selectedDates}
          isAllDates={isAllDates}
          dte={dte}
        />

        {/* Watchlist surface(s) to show */}
        <StripLabel>View</StripLabel>
        <Segmented<WatchView>
          value={watchView}
          onChange={(v) => patchIFlow({ watchView: v })}
          options={[
            {
              value: "tickers",
              label: "Tickers",
              badge: watchlist.length > 0 ? (
                <span className="num opacity-70">{watchlist.length}</span>
              ) : undefined,
            },
            {
              value: "contracts",
              label: "Contracts",
              badge: watchedContracts.length > 0 ? (
                <span className="num opacity-70">{watchedContracts.length}</span>
              ) : undefined,
            },
            {
              value: "both",
              label: "Both",
              badge: watchlist.length + watchedContracts.length > 0 ? (
                <span className="num opacity-70">
                  {watchlist.length + watchedContracts.length}
                </span>
              ) : undefined,
            },
          ]}
        />

        {categoryFilter && (
          <button
            type="button"
            onClick={() => patchIFlow({ categoryFilter: "" })}
            title="Clear the theme filter"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                       transition-colors shrink-0"
            style={{
              color: "var(--accent-cyan)",
              background: "color-mix(in srgb, var(--accent-cyan) 14%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-cyan) 35%, transparent)",
            }}
          >
            {categoryFilter.replace(/_/g, " ")}
            <X size={11} />
          </button>
        )}
        <StripLabel>Group</StripLabel>
        <span
          title={
            "Subcat: by sector → broad clustered subcategory (84 buckets, e.g. EUV Litho WFE).\n" +
            "Macro: by sector → primary macro driver (M1-M10).\n" +
            "Flat: no grouping — flat grid sorted by the chosen sort mode."
          }
        >
          <Segmented<GroupMode>
            value={groupMode}
            onChange={(v) => patchIFlow({ groupMode: v })}
            options={[
              { value: "subcat", label: "Subcat" },
              { value: "macro", label: "Macro" },
              { value: "flat", label: "Flat" },
            ]}
          />
        </span>

        {/* Bias — green/red is the bull/bear encoding, kept via Chip tones */}
        <StripLabel>Bias</StripLabel>
        <div className="flex items-center gap-1">
          {(
            [
              ["All", "all", "blue"],
              ["Bullish", "bullish", "green"],
              ["Bearish", "bearish", "red"],
            ] as const
          ).map(([l, v, tone]) => (
            <ChipButton
              key={v}
              active={bias === v}
              tone={tone as ChipTone}
              onClick={() => patchIFlow({ bias: v as BiasFilter })}
            >
              {l}
            </ChipButton>
          ))}
        </div>

        {/* DTE — orange/blue/cyan mirror the lotto/swing/leap tag colors */}
        <StripLabel>DTE</StripLabel>
        <div className="flex items-center gap-1">
          {(
            [
              ["All DTE", "all", "blue"],
              ["Lotto", "lotto", "orange"],
              ["Swing", "swing", "blue"],
              ["Leap", "leap", "cyan"],
            ] as const
          ).map(([l, v, tone]) => (
            <ChipButton
              key={v}
              active={dte === v}
              tone={tone as ChipTone}
              onClick={() => {
                patchIFlow({ dte: v as DteFilter });
                setSelectedTicker(null);
              }}
            >
              {l}
            </ChipButton>
          ))}
        </div>

        <StripLabel>Layout</StripLabel>
        <span title="Grid: per-ticker cards. Tape: chronological feed of every entry — single, multi-date, or defaults to today if you haven't picked dates.">
          <Segmented<"grid" | "tape">
            value={viewMode}
            onChange={(v) => {
              patchIFlow({ viewMode: v });
              // Tape now supports multi-date. We no longer force a snap
              // to a single date; the Tape itself defaults to today when
              // no dates are selected.
            }}
            options={[
              {
                value: "grid",
                label: (
                  <span className="flex items-center gap-1">
                    <Grid size={12} />
                    Grid
                  </span>
                ),
              },
              {
                value: "tape",
                label: (
                  <span className="flex items-center gap-1">
                    <List size={12} />
                    Tape
                  </span>
                ),
              },
            ]}
          />
        </span>

        <span
          className="text-text-muted text-xs"
          style={{ opacity: viewMode === "tape" ? 0.4 : 1 }}
        >
          Sort
        </span>
        <span
          style={{
            opacity: viewMode === "tape" ? 0.4 : 1,
            pointerEvents: viewMode === "tape" ? "none" : "auto",
          }}
        >
          <Segmented<SortMode>
            value={sort}
            onChange={(v) => patchIFlow({ sort: v })}
            options={[
              { value: "recent", label: "Most Recent" },
              { value: "entries", label: "Entries" },
              { value: "premium", label: "Premium" },
              { value: "score", label: "Conviction" },
              { value: "escalating", label: "Escalating" },
              { value: "returns", label: "Highest Returns" },
            ]}
          />
        </span>
        {sort === "returns" && returnsLoading && (
          <span className="text-xs text-accent-blue animate-pulse">loading returns…</span>
        )}
        {sort === "returns" && !returnsLoading && flowReturnsMeta?.earliest_date && (
          <span className="text-xs text-text-muted num">
            flow since {flowReturnsMeta.earliest_date} · {flowReturnsMeta.days_covered}d ·{" "}
            {flowReturnsMeta.entry_count.toLocaleString()} entries
          </span>
        )}
        {/* Highlight: which signal lights a grid card's green border. Grid-only —
            irrelevant in the chronological Tape view. */}
        {viewMode !== "tape" && (
          <>
            <StripLabel>Highlight</StripLabel>
            <div className="flex items-center gap-1">
              {(
                [
                  ["Off", "off", "No green border"],
                  ["Esc", "escalating", "Strikes escalating (original default)"],
                  ["Accum", "accum", "Bullish accumulation (accumulation label / escalating bull side)"],
                  ["Play", "play", "Theme-Pulse play score ≥ threshold — capital-preservation tuned (accumulation + catalyst + technicals, penalizes stretched names)"],
                  ["ML", "ml", "Best ML score ≥ threshold — P[option doubles] on recent flow"],
                ] as const
              ).map(([l, v, tip]) => (
                <ChipButton
                  key={v}
                  active={highlightMode === v}
                  tone="green"
                  title={tip}
                  onClick={() => patchIFlow({ highlightMode: v as IfHighlight })}
                >
                  {l}
                </ChipButton>
              ))}
            </div>
            {(highlightMode === "play" || highlightMode === "ml") && (
              <label
                className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"
                style={{ background: "var(--glass-bg)" }}
                title="Minimum 0–100 score a ticker needs to get the green border"
              >
                <span className="text-xs text-text-muted">≥</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={highlightMin}
                  onChange={(e) =>
                    patchIFlow({ highlightMin: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                  }
                  className="w-12 bg-transparent text-xs text-text-primary outline-none num"
                />
              </label>
            )}
          </>
        )}
        <StripLabel>Earnings</StripLabel>
        <div className="flex items-center gap-1">
          {(
            [
              ["Any", "all"],
              ["1W", "1w"],
              ["2W", "2w"],
              ["1M", "1m"],
              ["2M", "2m"],
            ] as const
          ).map(([l, v]) => (
            <ChipButton
              key={v}
              active={earningsWindow === v}
              tone="orange"
              onClick={() => patchIFlow({ earningsWindow: v as EarningsWindow })}
            >
              {l}
            </ChipButton>
          ))}
        </div>
        {earningsWindow !== "all" && earningsLoading && !earningsMap && (
          <span className="text-xs text-accent-orange animate-pulse">loading earnings…</span>
        )}
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
          Traders
        </ChipButton>
        {tradersOnly && traderList.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {traderList.map((t) => (
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
                <span className="num opacity-60">{t.n_calls}</span>
              </ChipButton>
            ))}
            {selectedAuthors.size > 0 && (
              <button
                onClick={() => patchIFlow({ selectedAuthors: new Set() })}
                className="px-2 py-1 rounded-full text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                title="Clear trader selection"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Top Picks + Top Signals (single date only) ───────────────── */}
      {isSingleDate && singleDate && (
        <div className="grid xl:grid-cols-2 gap-x-4">
          <TopPicks date={singleDate} dteFilter={dte} />
          <TopSignals date={singleDate} dteFilter={dte} />
        </div>
      )}

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {loading && (
        <div className="animate-pulse">
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="card h-20" />
            ))}
          </div>
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
          className="grid grid-cols-12 gap-4 max-md:gap-2 max-md:!h-auto max-md:!min-h-0"
          style={{ height: "calc(100vh - 260px)", minHeight: 420 }}
        >
          <div
            className={`${selectedTicker ? "col-span-7" : "col-span-12"} overflow-y-auto pr-1 max-md:col-span-12 max-md:overflow-visible max-md:pr-0`}
          >
            {tradersOnly && coverageQuery.isLoading && (
              <div className="card mb-3 flex items-center justify-center gap-2 py-6 text-xs text-text-muted">
                <Loader2 size={13} className="animate-spin" /> Loading trader coverage...
              </div>
            )}
            {tradersOnly && coverageQuery.isError && (
              <div className="card mb-3 flex items-center justify-center gap-2 py-6 text-xs text-accent-red">
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
              <div className={watchView === "both" ? "mb-4" : ""}>
                <ContractsView
                  onSelectTicker={(t) => {
                    setSelectedTicker(t);
                    setActiveTicker(t);
                  }}
                />
              </div>
            )}
            {/* Tape mode: chronological feed of all entries across
                whichever dates are selected. Single-date, multi-date,
                and All Dates (defaults to today) all work — the merge
                happens inside EntryTape via useMultiDateEntries. */}
            {coverageReady && watchView !== "contracts" && viewMode === "tape" && tapeDates.length > 0 && (
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
                onSelectTicker={(t) => {
                  setSelectedTicker(t);
                  setActiveTicker(t);
                }}
              />
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
                      setSelectedTicker(t.ticker);
                      setActiveTicker(t.ticker);
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
                  <div className="card text-center py-8">
                    <p className="text-sm text-text-muted">No tickers match your filters</p>
                  </div>
                );
              }

              return (
                <>
                  {watchlist.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-2 flex items-center gap-1.5 text-accent-orange">
                        <Star size={12} style={{ fill: "var(--accent-orange)" }} />
                        Watchlist ({watchedShown.length}
                        {watchedShown.length < watchlist.length && (
                          <span className="opacity-60">/{watchlist.length}</span>
                        )}
                        )
                      </h4>
                      {watchedShown.length === 0 ? (
                        <div className="text-xs text-text-muted italic px-1">
                          None of your watched tickers have flow on the selected dates.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {watchedShown.map(renderCard)}
                        </div>
                      )}
                    </div>
                  )}
                  {othersShown.length > 0 && (
                    <>
                      {watchlist.length > 0 && (
                        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] mb-2 text-text-secondary">
                          All Tickers ({othersShown.length})
                        </h4>
                      )}
                      {groupMode !== "flat" && taxonomy ? (
                        <ThemedGrid
                          tickers={othersShown}
                          taxonomy={taxonomy}
                          renderCard={renderCard}
                          subGroupBy={groupMode === "subcat" ? "theme" : "macro"}
                          escMap={escMap}
                        />
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {othersShown.map(renderCard)}
                        </div>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </div>
          {selectedTicker && selectedData && (
            <div className="col-span-5 overflow-y-auto pr-1 max-md:col-span-12 max-md:overflow-visible max-md:pr-0">
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
    <div>
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
      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-accent-blue hover:bg-accent-blue/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download size={12} />
      {busy ? "exporting…" : "CSV"}
    </button>
  );
}
