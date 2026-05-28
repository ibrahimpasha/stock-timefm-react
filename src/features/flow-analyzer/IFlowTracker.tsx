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
import { useQuery } from "@tanstack/react-query";
import { Eye, Search, Filter, Download, X, Star, Layers, Grid, List } from "lucide-react";
import apiClient from "../../api/client";
import { useAppStore } from "../../store/useAppStore";
import { formatPremium } from "../../lib/utils";
import type { TrackedTicker } from "../../lib/types";
import { useLeaderboard } from "../../api/alerts";
import { useVoicesTrending } from "../../api/voices";
import { useTaxonomy } from "../../api/taxonomy";
import type { BiasFilter, DteFilter, SortMode, EarningsWindow } from "./iflow/types";
import { EARNINGS_WINDOW_DAYS, parsePremium, matchesDte, classifySide, dteTag } from "./iflow/utils";
import {
  useIFlowDates,
  useIFlowSummary,
  useMultiDateSummaries,
  useTickerIntelBatch,
  useTickerEarningsBatch,
  useFlowReturns,
  useEscalatingBatch,
} from "./iflow/hooks";
import type { EscRollup } from "./iflow/hooks";
import { TickerCard } from "./iflow/TickerCard";
import { TopPicks } from "./iflow/TopPicks";
import { TickerDetail } from "./iflow/TickerDetail";
import { ContractsView } from "./iflow/ContractsView";
import { ThemeSection } from "./iflow/ThemeSection";
import { EntryTape } from "./iflow/EntryTape";

type WatchView = "tickers" | "contracts" | "both";
type GroupMode = "subcat" | "macro" | "flat";

export function IFlowTracker() {
  const [bias, setBias] = useState<BiasFilter>("all");
  const [dte, setDte] = useState<DteFilter>("all");
  const [sort, setSort] = useState<SortMode>("entries");
  // Grid = per-ticker aggregated cards (the original view).
  // Tape = chronological per-entry feed for one date — answers "what just
  // came in today" in raw form. Sort dropdown is hidden in tape mode
  // because tape is always newest-first by arrival timestamp.
  const [viewMode, setViewMode] = useState<"grid" | "tape">("grid");
  const [earningsWindow, setEarningsWindow] = useState<EarningsWindow>("all");
  const [tradersOnly, setTradersOnly] = useState(false);
  const [selectedAuthors, setSelectedAuthors] = useState<Set<string>>(new Set());
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
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
      setSearch(activeTicker);
    }
    // selectedTicker intentionally excluded — we only react to activeTicker
    // changes, not to internal selection updates that already match it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTicker]);
  const [watchView, setWatchView] = useState<WatchView>("tickers");
  const [groupMode, setGroupMode] = useState<GroupMode>("subcat");
  const { data: taxonomy } = useTaxonomy();

  const { data: datesData } = useIFlowDates();
  const dates = datesData?.dates ?? [];
  const isAllDates = selectedDates.size === 0;
  const isSingleDate = selectedDates.size === 1;
  const singleDate = isSingleDate ? [...selectedDates][0] : "";

  // Tape view supports any date selection — single, multi, or All Dates
  // (which falls back to "today" inside the Tape so the user isn't
  // staring at thousands of rows). The earlier single-date restriction
  // was lifted when we added multi-date entry fetching.
  // Default tape date when nothing is selected = today's date if present
  // in the iFlow corpus, else the most recent date with data.
  const pickTapeDefaultDate = (): string | null => {
    if (!dates.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    return dates.some((d: { date: string }) => d.date === today) ? today : dates[0].date;
  };

  // The actual date list the Tape consumes. When the user hasn't picked
  // anything (All Dates), default to today only — multi-date is opt-in
  // via the date selector to keep the row count manageable.
  const tapeDates: string[] = useMemo(() => {
    if (selectedDates.size > 0) return [...selectedDates].sort().reverse();
    const def = pickTapeDefaultDate();
    return def ? [def] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDates, dates]);

  // Date toggling = multi-select. Selecting a new date clears the selected
  // ticker so the right column doesn't show stale data.
  const toggleDate = (d: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
    setSelectedTicker(null);
  };

  // Earnings-window mode is a "show me tickers with earnings soon" view; it
  // intentionally overrides the date selection. Otherwise a ticker like TSEM
  // (earnings in 2 days but no flow on the selected dates) would be invisible.
  const earningsFilterOn = earningsWindow !== "all";
  const useSingleDateView = isSingleDate && !earningsFilterOn;

  // Date keys to aggregate when we're NOT in single-date view.
  //   - All Dates / earnings-override → every available date
  //   - Explicit multi-select         → the selected dates
  // The flow JSON files are the authoritative entry source; /flow/iflow/summary
  // reads them directly. We deliberately avoid /flow/tickers — that endpoint
  // reads options_flow.db, which the iflow fetcher no longer populates (and
  // which can also be corrupted), causing "All Dates" to silently empty out.
  const aggregateDateKeys: string[] = useSingleDateView
    ? []
    : isAllDates || earningsFilterOn
    ? dates.map((d) => d.date)
    : [...selectedDates].sort().reverse();

  const { data: summary, isLoading: summaryLoading } = useIFlowSummary(
    useSingleDateView ? singleDate : "",
    dte,
  );
  const multiSummaryQueries = useMultiDateSummaries(aggregateDateKeys, dte);
  const aggregateLoading =
    aggregateDateKeys.length > 0 && multiSummaryQueries.some((q) => q.isLoading);

  const loading = useSingleDateView ? summaryLoading : aggregateLoading;

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
  const { data: coverageData } = useQuery<{
    ok: boolean;
    coverage: Record<string, string[]>;
  }>({
    queryKey: ["flow", "trader-coverage", 30],
    queryFn: () =>
      apiClient.get(`/flow/iflow/trader-coverage?days=30`).then((r) => r.data),
    staleTime: 60_000,
    enabled: tradersOnly,
  });
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

  const filtered = useMemo(() => {
    let list = [...tickers];
    if (bias === "bullish") list = list.filter((t) => t.bullish > t.bearish);
    else if (bias === "bearish") list = list.filter((t) => t.bearish > t.bullish);
    if (search) list = list.filter((t) => t.ticker.toUpperCase().includes(search));
    if (tradersOnly && authorTickerSet.size > 0) {
      list = list.filter((t) => authorTickerSet.has(t.ticker.toUpperCase()));
    }

    const earningsActive = earningsWindow !== "all" && !!earningsMap;
    if (earningsActive) {
      const maxDays = EARNINGS_WINDOW_DAYS[earningsWindow];
      const now = Date.now();
      list = list.filter((t) => {
        const d = earningsMap![t.ticker];
        if (!d) return false;
        const days = (new Date(d).getTime() - now) / 86_400_000;
        return days >= 0 && days <= maxDays;
      });
      // Earnings-window mode overrides the regular sort: nearest first.
      list.sort((a, b) => {
        const da = earningsMap![a.ticker] ? new Date(earningsMap![a.ticker]!).getTime() : Infinity;
        const db = earningsMap![b.ticker] ? new Date(earningsMap![b.ticker]!).getTime() : Infinity;
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
  }, [tickers, bias, search, sort, intelMap, earningsWindow, earningsMap, flowReturnsMap, tradersOnly, authorTickerSet]);

  const selectedData = tickers.find((t) => t.ticker === selectedTicker);

  return (
    <div>
      {/* ── Date bar + Search ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => {
              setSelectedDates(new Set());
              setSelectedTicker(null);
            }}
            className="px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: isAllDates ? "rgba(88,166,255,0.15)" : "transparent",
              color: isAllDates ? "var(--accent-blue)" : "var(--text-muted)",
            }}
          >
            All Dates
          </button>
          {dates.slice(0, 8).map((d) => (
            <button
              key={d.date}
              onClick={() => toggleDate(d.date)}
              className="px-2.5 py-1.5 text-xs font-mono transition-colors border-l border-border"
              style={{
                background: selectedDates.has(d.date) ? "rgba(88,166,255,0.15)" : "transparent",
                color: selectedDates.has(d.date) ? "var(--accent-blue)" : "var(--text-muted)",
              }}
            >
              {d.date.slice(5)}
              <span className="ml-1 opacity-60">{d.entries}</span>
            </button>
          ))}
        </div>
        <div className="relative flex items-center gap-2 rounded-lg border border-border bg-bg-primary px-3 py-1.5 flex-1 max-w-xs focus-within:border-accent-blue transition-colors">
          <Search size={14} className="text-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            placeholder="Search ticker..."
            className="bg-transparent border-none outline-none text-text-primary font-mono text-xs w-full placeholder:text-text-muted pr-5"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
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
            <> — earnings universe (all dates, ignoring date selection)</>
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
      </div>

      {/* ── View toggle: which watchlist surface(s) to show ─────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Star size={13} className="text-accent-orange" />
        <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">
          View
        </span>
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {(
            [
              ["Tickers", "tickers", watchlist.length],
              ["Contracts", "contracts", watchedContracts.length],
              ["Both", "both", watchlist.length + watchedContracts.length],
            ] as const
          ).map(([label, v, count]) => (
            <button
              key={v}
              onClick={() => setWatchView(v as WatchView)}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background:
                  watchView === v ? "rgba(227,127,46,0.12)" : "transparent",
                color:
                  watchView === v ? "var(--accent-orange)" : "var(--text-muted)",
                borderRight: "1px solid var(--border)",
              }}
            >
              {label}
              {count > 0 && (
                <span className="ml-1 opacity-70 font-mono">{count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-2">
          <Layers size={13} className="text-text-muted" />
          <span className="text-xs text-text-muted font-semibold uppercase tracking-wider">
            Group
          </span>
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {(
              [
                ["Subcat", "subcat", "By sector → broad clustered subcategory (84 buckets, e.g. EUV Litho WFE)."],
                ["Macro", "macro", "By sector → primary macro driver (M1-M10)."],
                ["Flat", "flat", "No grouping — flat grid sorted by the chosen sort mode."],
              ] as const
            ).map(([label, v, tip]) => (
              <button
                key={v}
                onClick={() => setGroupMode(v as GroupMode)}
                className="px-3 py-1 text-xs font-semibold transition-colors"
                style={{
                  background:
                    groupMode === v ? "rgba(88,166,255,0.15)" : "transparent",
                  color:
                    groupMode === v ? "var(--accent-blue)" : "var(--text-muted)",
                  borderRight: "1px solid var(--border)",
                }}
                title={tip}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Filters: Bias + DTE + Sort + Earnings ───────────────────── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Filter size={13} className="text-text-muted" />
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {(
            [
              ["All", "all", "var(--text-secondary)"],
              ["Bullish", "bullish", "var(--accent-green)"],
              ["Bearish", "bearish", "var(--accent-red)"],
            ] as const
          ).map(([l, v, c]) => (
            <button
              key={v}
              onClick={() => setBias(v as BiasFilter)}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background: bias === v ? `${c}15` : "transparent",
                color: bias === v ? c : "var(--text-muted)",
                borderRight: "1px solid var(--border)",
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {(
            [
              ["All DTE", "all", "var(--text-secondary)"],
              ["Lotto", "lotto", "var(--accent-orange)"],
              ["Swing", "swing", "var(--accent-blue)"],
              ["Leap", "leap", "var(--accent-cyan)"],
            ] as const
          ).map(([l, v, c]) => (
            <button
              key={v}
              onClick={() => {
                setDte(v as DteFilter);
                setSelectedTicker(null);
              }}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background: dte === v ? `${c}15` : "transparent",
                color: dte === v ? c : "var(--text-muted)",
                borderRight: "1px solid var(--border)",
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="text-text-muted text-xs">View:</span>
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {([["Grid", "grid", Grid], ["Tape", "tape", List]] as const).map(([l, v, Icon]) => {
            const isTape = v === "tape";
            const handleClick = () => {
              setViewMode(isTape ? "tape" : "grid");
              // Tape now supports multi-date. We no longer force a snap
              // to a single date; the Tape itself defaults to today when
              // no dates are selected.
            };
            return (
              <button
                key={v}
                onClick={handleClick}
                title={isTape
                  ? "Chronological feed of every entry. Single, multi-date, or defaults to today if you haven't picked dates."
                  : "Per-ticker cards"}
                className="px-2.5 py-1 text-xs font-semibold transition-colors flex items-center gap-1"
                style={{
                  background: viewMode === v ? "rgba(88,166,255,0.15)" : "transparent",
                  color: viewMode === v ? "var(--accent-blue)" : "var(--text-muted)",
                  borderRight: "1px solid var(--border)",
                }}
              >
                <Icon size={12} />
                {l}
              </button>
            );
          })}
        </div>
        <span
          className="text-text-muted text-xs"
          style={{ opacity: viewMode === "tape" ? 0.4 : 1 }}
        >
          Sort:
        </span>
        <div
          className="flex items-center rounded-lg border border-border overflow-hidden"
          style={{ opacity: viewMode === "tape" ? 0.4 : 1, pointerEvents: viewMode === "tape" ? "none" : "auto" }}
        >
          {(
            [
              ["Most Recent", "recent"],
              ["Entries", "entries"],
              ["Premium", "premium"],
              ["Conviction", "score"],
              ["Escalating", "escalating"],
              ["Highest Returns", "returns"],
            ] as const
          ).map(([l, v]) => (
            <button
              key={v}
              onClick={() => setSort(v as SortMode)}
              className="px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background: sort === v ? "rgba(88,166,255,0.15)" : "transparent",
                color: sort === v ? "var(--accent-blue)" : "var(--text-muted)",
                borderRight: "1px solid var(--border)",
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {sort === "returns" && returnsLoading && (
          <span className="text-xs text-accent-blue animate-pulse">loading returns…</span>
        )}
        {sort === "returns" && !returnsLoading && flowReturnsMeta?.earliest_date && (
          <span className="text-xs text-text-muted font-mono">
            flow since {flowReturnsMeta.earliest_date} · {flowReturnsMeta.days_covered}d ·{" "}
            {flowReturnsMeta.entry_count.toLocaleString()} entries
          </span>
        )}
        <span className="text-text-muted text-xs">Earnings:</span>
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          {(
            [
              ["Any", "all"],
              ["1W", "1w"],
              ["2W", "2w"],
              ["1M", "1m"],
              ["2M", "2m"],
            ] as const
          ).map(([l, v]) => {
            const active = earningsWindow === v;
            return (
              <button
                key={v}
                onClick={() => setEarningsWindow(v as EarningsWindow)}
                className="px-3 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: active ? "rgba(227,127,46,0.15)" : "transparent",
                  color: active ? "var(--accent-orange)" : "var(--text-muted)",
                  borderRight: "1px solid var(--border)",
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
        {earningsWindow !== "all" && earningsLoading && !earningsMap && (
          <span className="text-xs text-accent-orange animate-pulse">loading earnings…</span>
        )}
        <div className="flex items-center rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => {
              setTradersOnly((v) => {
                const next = !v;
                if (!next) setSelectedAuthors(new Set());
                return next;
              });
            }}
            className="px-3 py-1 text-xs font-semibold transition-colors"
            style={{
              background: tradersOnly ? "rgba(188,140,255,0.15)" : "transparent",
              color: tradersOnly ? "var(--accent-purple)" : "var(--text-muted)",
            }}
          >
            Traders
          </button>
        </div>
        {tradersOnly && traderList.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {traderList.map((t) => {
              const active = selectedAuthors.has(t.author);
              return (
                <button
                  key={t.author}
                  onClick={() => {
                    setSelectedAuthors((prev) => {
                      const next = new Set(prev);
                      if (next.has(t.author)) next.delete(t.author);
                      else next.add(t.author);
                      return next;
                    });
                    setSelectedTicker(null);
                  }}
                  className="px-2 py-1 rounded text-xs font-semibold transition-colors border"
                  style={{
                    background: active ? "rgba(188,140,255,0.15)" : "transparent",
                    color: active ? "var(--accent-purple)" : "var(--text-muted)",
                    borderColor: active ? "var(--accent-purple)" : "var(--border)",
                  }}
                  title={`${t.n_calls} calls · top ${t.top_ticker ?? "—"}`}
                >
                  {t.author}
                  <span className="ml-1 opacity-60 font-mono">{t.n_calls}</span>
                </button>
              );
            })}
            {selectedAuthors.size > 0 && (
              <button
                onClick={() => setSelectedAuthors(new Set())}
                className="px-2 py-1 rounded text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
                title="Clear trader selection"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Top Picks (single date only) ────────────────────────────── */}
      {isSingleDate && singleDate && <TopPicks date={singleDate} dteFilter={dte} />}

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

      {/* ── Grid + Detail (two independent scrollers) ───────────────── */}
      {/* Each column has its own overflow-y-auto so a long ticker grid
          doesn't push the flow detail below the fold. If the page chrome
          height changes, adjust the 260px offset. */}
      {!loading && (
        <div
          className="grid grid-cols-12 gap-4"
          style={{ height: "calc(100vh - 260px)", minHeight: 420 }}
        >
          <div
            className={`${selectedTicker ? "col-span-5" : "col-span-12"} overflow-y-auto pr-1`}
          >
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
            {watchView !== "contracts" && viewMode === "tape" && tapeDates.length > 0 && (
              <EntryTape
                dates={tapeDates}
                bias={bias}
                dte={dte}
                search={search}
                tradersOnly={tradersOnly}
                authorTickerSet={authorTickerSet}
                selectedTicker={selectedTicker}
                onSelectTicker={(t) => {
                  setSelectedTicker(t);
                  setActiveTicker(t);
                }}
              />
            )}
            {/* Ticker grid: hidden entirely in "contracts" mode. */}
            {watchView !== "contracts" && viewMode === "grid" && (() => {
              // Pull watched tickers from the FULL list (not `filtered`) so filter
              // changes don't hide pinned tickers. Watched tickers are subtracted
              // from the main grid to avoid showing the same card twice.
              const watchSet = new Set(watchlist);
              const watchedShown = tickers.filter((t) => watchSet.has(t.ticker));
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
                    <Eye size={24} className="mx-auto mb-2 text-text-muted opacity-40" />
                    <p className="text-sm text-text-muted">No tickers match your filters</p>
                  </div>
                );
              }

              return (
                <>
                  {watchlist.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-accent-orange">
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
                      <div className="mt-3 border-t border-border opacity-40" />
                    </div>
                  )}
                  {othersShown.length > 0 && (
                    <>
                      {watchlist.length > 0 && (
                        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 text-text-muted">
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
            <div className="col-span-7 overflow-y-auto pr-1">
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
      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-accent-blue hover:bg-accent-blue/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download size={12} />
      {busy ? "exporting…" : "CSV"}
    </button>
  );
}
