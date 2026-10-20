import { useMemo, useState } from "react";
import { QueryNotice } from "../components/QueryNotice";
import { marketDate } from "../lib/liveFeeds";
import { ArrowUpDown } from "lucide-react";

import { useAppStore } from "../store/useAppStore";
import { useLeaderboard, useAlertsPositions, useTradersToday } from "../api/alerts";
import { Sparkline, RangeBar } from "../components/CCPrimitives";
import { Segmented, Stat } from "../components/Glass";
import {
  formatPercentRaw,
  relativeAge,
  absoluteAge,
  changeColor,
} from "../lib/utils";
import type {
  AlertPosition,
  LeaderboardRow,
  AlertsPositionsOk,
} from "../lib/types";
import { SignalsView } from "../features/traders/SignalsView";
import { TradersTodayFeed } from "../features/traders/TradersTodayFeed";
import {
  TraderPositionRow,
  positionKeyString,
} from "../features/traders/TraderPositionRow";
import { TraderBrief } from "../features/traders/TraderBrief";

/* ── Helpers ──────────────────────────────────────────────── */

type SortMode = "n_calls" | "today" | "win_rate" | "mean_pl_pct" | "latest" | "author";

const SORT_LABELS: Record<SortMode, string> = {
  n_calls: "Calls",
  today: "Today",
  win_rate: "Win %",
  mean_pl_pct: "Mean reported outcome",
  latest: "Latest",
  author: "Author",
};

/** Segmented sort options — short labels so the pill fits the column. */
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "n_calls", label: "Calls" },
  { value: "today", label: "Today" },
  { value: "win_rate", label: "Win" },
  { value: "mean_pl_pct", label: "Mean" },
  { value: "latest", label: "Last" },
  { value: "author", label: "A-Z" },
];

/**
 * Per-position headline P/L: realized cumulative when the position has been
 * trimmed/closed (status in {closed, stopped, partial}), otherwise the latest
 * unrealized mark. Mirrors the same logic inside `TraderPositionRow`.
 */
function positionPct(p: AlertPosition): number | null {
  // Per-play profit = MAX stated exit: trims at +50/+70/+120 on one play
  // mean the play ran to +120%, never the sum of the trims.
  const s = (p.status || "").toLowerCase();
  if (s === "closed" || s === "stopped" || s === "partial") {
    return p.max_exit_pct ?? p.cumulative_exit_pct ?? p.current_pl_pct ?? null;
  }
  return p.current_pl_pct ?? p.max_exit_pct ?? p.cumulative_exit_pct ?? null;
}

/** Compare two ISO timestamps; nulls sort last. */
function cmpTs(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/* ── Empty / loading states ──────────────────────────────── */

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-center justify-center min-h-80">
      <div className="max-w-lg text-center">
        <h2 className="section-title mb-2">{title}</h2>
        <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function SkeletonCard({ height = 96 }: { height?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{
        height,
        background: "var(--bg-card-hover)",
        borderRadius: "var(--radius-panel)",
      }}
    />
  );
}

/* ── Leaderboard table ───────────────────────────────────── */

interface LeaderboardTableProps {
  rows: LeaderboardRow[];
  selected: string | null;
  onSelect: (author: string) => void;
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
  sortDesc: boolean;
  /** Map of author → today's event count, computed from /alerts/today. */
  todayMap?: Record<string, number>;
}

function LeaderboardHeader({
  mode,
  label,
  align = "left",
  sortMode,
  onSort,
  sortDesc,
}: {
  mode: SortMode;
  label: string;
  align?: "left" | "right";
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
  sortDesc: boolean;
}) {
  const active = sortMode === mode;
  return (
    <th
      aria-sort={active ? (sortDesc ? "descending" : "ascending") : undefined}
      className={`px-3 py-2 text-xs font-medium whitespace-nowrap select-none ${
        active ? "text-text-primary" : "text-text-muted"
      }`}
      style={{
        textAlign: align,
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "var(--card-bg)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => onSort(mode)}
        className={`inline-flex min-h-6 w-full items-center gap-1 rounded ${align === "right" ? "justify-end" : "justify-start"}`}
      >
        {label}
        {active && <ArrowUpDown size={10} className="opacity-70" aria-hidden="true" />}
      </button>
    </th>
  );
}

function LeaderboardTable({
  rows,
  selected,
  onSelect,
  sortMode,
  onSort,
  sortDesc,
  todayMap = {},
}: LeaderboardTableProps) {
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortMode) {
        case "n_calls":
          cmp = (a.n_calls || 0) - (b.n_calls || 0);
          break;
        case "today":
          cmp = (todayMap[a.author] || 0) - (todayMap[b.author] || 0);
          break;
        case "win_rate":
          cmp = (a.win_rate ?? -1) - (b.win_rate ?? -1);
          break;
        case "mean_pl_pct":
          cmp = (a.mean_pl_pct ?? -Infinity) - (b.mean_pl_pct ?? -Infinity);
          break;
        case "latest":
          cmp = cmpTs(a.latest_call_ts, b.latest_call_ts);
          break;
        case "author":
          cmp = (a.author || "").localeCompare(b.author || "");
          break;
      }
      return sortDesc ? -cmp : cmp;
    });
    return copy;
  }, [rows, sortMode, sortDesc, todayMap]);

  return (
    <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <LeaderboardHeader mode="author" label="Trader" sortMode={sortMode} onSort={onSort} sortDesc={sortDesc} />
            <LeaderboardHeader mode="n_calls" label="N" align="right" sortMode={sortMode} onSort={onSort} sortDesc={sortDesc} />
            <LeaderboardHeader mode="today" label="Today" align="right" sortMode={sortMode} onSort={onSort} sortDesc={sortDesc} />
            <LeaderboardHeader mode="win_rate" label="Win" align="right" sortMode={sortMode} onSort={onSort} sortDesc={sortDesc} />
            <LeaderboardHeader mode="mean_pl_pct" label="Mean" align="right" sortMode={sortMode} onSort={onSort} sortDesc={sortDesc} />
            <LeaderboardHeader mode="latest" label="Last" align="right" sortMode={sortMode} onSort={onSort} sortDesc={sortDesc} />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((r, i) => {
            const isSel = selected === r.author;
            const winPct = r.win_rate != null ? r.win_rate * 100 : null;
            return (
              <tr
                key={r.author}
                onClick={() => onSelect(r.author)}
                className="cursor-pointer hover:bg-bg-card-hover transition-colors"
                style={{
                  background: isSel
                    ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                    : undefined,
                }}
              >
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className={`num w-5 shrink-0 text-right text-sm ${i < 3 ? "font-semibold text-text-primary" : "text-text-muted"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(r.author);
                    }}
                    aria-pressed={isSel}
                    className={`text-sm text-text-primary max-w-40 truncate ${
                      isSel ? "font-semibold" : "font-medium"
                    } block min-h-6 w-full rounded text-left`}
                    title={r.author}
                  >
                    {r.author}
                  </button>
                  {r.top_ticker && (
                    <div className="text-xs text-text-muted">
                      top <span className="ticker text-text-secondary">{r.top_ticker}</span>
                    </div>
                  )}
                  </div>
                  </div>
                </td>
                <td
                  className="num px-3 py-2.5 text-right text-sm text-text-secondary"
                >
                  {r.n_calls}
                  {r.n_realized > 0 && (
                    <span
                      className="text-xs text-text-muted ml-1"
                      title={`${r.n_realized} realized (closed)`}
                    >
                      /{r.n_realized}
                    </span>
                  )}
                </td>
                <td
                  className={`num px-3 py-2.5 text-right text-sm ${
                    (todayMap[r.author] || 0) > 0
                      ? "font-semibold text-text-primary"
                      : "text-text-muted"
                  }`}
                  title="Events extracted today (open/add/trim/close/stop/status/recap)"
                >
                  {todayMap[r.author] || 0}
                </td>
                <td className="px-3 py-2.5 min-w-24">
                  {winPct != null ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="num text-sm font-semibold min-w-9 text-right"
                        style={{ color: changeColor(winPct - 50) }}
                      >
                        {winPct.toFixed(0)}%
                      </span>
                      <div className="flex-1 min-w-10">
                        <RangeBar low={0} high={100} last={winPct} width="100%" />
                      </div>
                    </div>
                  ) : (
                    <span className="num text-sm text-text-muted">—</span>
                  )}
                </td>
                <td
                  className="num px-3 py-2.5 text-right text-sm font-semibold"
                  style={{
                    color:
                      r.mean_pl_pct != null
                        ? changeColor(r.mean_pl_pct)
                        : "var(--text-muted)",
                  }}
                >
                  {r.mean_pl_pct != null
                    ? formatPercentRaw(r.mean_pl_pct, 1)
                    : "—"}
                </td>
                <td
                  className="num px-3 py-2.5 text-right text-xs text-text-muted whitespace-nowrap"
                  title={absoluteAge(r.latest_call_ts) || ""}
                >
                  {relativeAge(r.latest_call_ts) || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Trader profile (right column) ───────────────────────── */

interface TraderProfileProps {
  author: string | null;
  leaderboardRow: LeaderboardRow | null;
}

function TraderProfile({ author, leaderboardRow }: TraderProfileProps) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const activeTicker = useAppStore((s) => s.activeTicker);
  const [expandedPositionKey, setExpandedPositionKey] = useState<string | null>(
    null,
  );

  const positionsQuery = useAlertsPositions(author ?? "", 60);
  const { data, isLoading, isFetching } = positionsQuery;

  if (!author) {
    return (
      <EmptyState
        title="Select a trader"
        body="Pick a row on the left to see their recent positions, win rate, and P/L profile."
      />
    );
  }

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="space-y-4">
        <SkeletonCard height={120} />
        <SkeletonCard height={300} />
      </div>
    );
  }

  if (!data || data.ok === false) {
    return (
      <div><QueryNotice queries={[positionsQuery]} label="Trader positions" />
      <EmptyState
        title="Trader profile unavailable"
        body={
          data && data.ok === false
            ? `Backend returned: ${data.reason}.`
            : "Could not load this trader's positions."
        }
      /></div>
    );
  }

  const ok = data as AlertsPositionsOk;
  // Sort by LATEST-activity ts desc so positions touched today float to the
  // top. Fall back to opened_at, then earliest event ts. This matches the
  // collapsed-row date (which now shows the last-event date, not open date).
  const positions: AlertPosition[] = [...ok.positions].sort((a, b) => {
    const latest = (p: AlertPosition): string | null => {
      if (p.events.length > 0) return p.events[p.events.length - 1].ts;
      return p.opened_at || null;
    };
    const tsA = latest(a);
    const tsB = latest(b);
    if (!tsA && !tsB) return 0;
    if (!tsA) return 1;
    if (!tsB) return -1;
    return tsA < tsB ? 1 : tsA > tsB ? -1 : 0;
  });

  /* ── Header stats — derived from POSITIONS, not per-event summary. ──
     - Calls       → total positions in window
     - Realized    → positions that have at least one trim/close/stop (status in
                      closed / stopped / partial)
     - Win         → fraction of realized positions with cumulative_exit_pct > 0
     - Mean P/L    → mean of positionPct(p) across positions (null-skipped)
     - Cumulative  → sum of positionPct(p) across positions (null-skipped) */
  const nPositions = positions.length;
  const realizedPositions = positions.filter((p) => {
    const s = (p.status || "").toLowerCase();
    return s === "closed" || s === "stopped" || s === "partial";
  });
  const nRealized = realizedPositions.length;

  const winRate: number | null = (() => {
    const scored = realizedPositions.filter(
      (p) => (p.max_exit_pct ?? p.cumulative_exit_pct) != null,
    );
    if (scored.length === 0) return null;
    const wins = scored.filter(
      (p) => (p.max_exit_pct ?? p.cumulative_exit_pct ?? 0) > 0,
    ).length;
    return wins / scored.length;
  })();

  const pctList: number[] = positions
    .map((p) => positionPct(p))
    .filter((v): v is number => v != null);

  const meanPl: number | null =
    pctList.length > 0
      ? pctList.reduce((a, b) => a + b, 0) / pctList.length
      : null;

  // Sparkline + cumulative — walk positions chronologically.
  const sparkPoints: number[] = (() => {
    const chrono = [...positions].reverse();
    let acc = 0;
    const out: number[] = [];
    for (const p of chrono) {
      const pct = positionPct(p);
      if (pct != null) acc += pct;
      out.push(acc);
    }
    return out.length >= 2 ? out : [];
  })();

  const winPct =
    winRate != null ? (winRate * 100).toFixed(0) + "%" : "—";
  const meanPlStr =
    meanPl != null ? formatPercentRaw(meanPl, 1) : "—";
  const meanPlColor =
    meanPl != null ? changeColor(meanPl) : "var(--text-muted)";

  const outcomeSum =
    sparkPoints.length >= 1 ? sparkPoints[sparkPoints.length - 1] : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-8">
      <QueryNotice queries={[positionsQuery]} label="Trader positions" />

      {/* Hero: who, and the one number that summarizes them. */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 flex-1">
            <h2 className="headline truncate" title={author}>
              {author}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {leaderboardRow?.top_ticker && (
                <>
                  Most traded{" "}
                  <button
                    type="button"
                    onClick={() => setActiveTicker(leaderboardRow.top_ticker!)}
                    aria-label={`Select ${leaderboardRow.top_ticker} ticker`}
                    className="ticker cursor-pointer text-accent-blue hover:underline"
                  >
                    {leaderboardRow.top_ticker}
                  </button>
                  <span className="text-text-muted"> · </span>
                </>
              )}
              <span className="text-text-muted">
                Reported peak/exit outcomes, not fill-weighted realized or
                portfolio returns.
              </span>
            </p>
          </div>

          {/* Cumulative outcome — the hero number of the panel */}
          <div className="flex shrink-0 items-end gap-4">
            {sparkPoints.length >= 2 && (
              <Sparkline
                points={sparkPoints}
                width={160}
                height={44}
                color={
                  (outcomeSum ?? 0) >= 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)"
                }
                fill
              />
            )}
            <div className="text-right">
              <div className="text-xs text-text-muted">Outcome sum</div>
              <div
                className="num text-3xl font-semibold tracking-tight"
                style={{
                  color:
                    outcomeSum != null
                      ? changeColor(outcomeSum)
                      : "var(--text-muted)",
                }}
              >
                {outcomeSum != null ? `${outcomeSum.toFixed(1)}` : "—"}
                <span className="ml-1 text-base font-medium text-text-muted">
                  pp
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Metric strip — summary Stats (derived from positions) */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
          <Stat label="Positions" value={String(nPositions)} />
          <Stat
            label="With exits"
            value={String(nRealized)}
            sub={nPositions ? `${nRealized}/${nPositions}` : undefined}
          />
          <Stat
            label="Positive exits"
            value={winPct}
            tone={
              winRate != null
                ? winRate * 100 - 50 >= 0
                  ? "green"
                  : "red"
                : undefined
            }
          />
          <Stat
            label="Mean outcome"
            value={<span style={{ color: meanPlColor }}>{meanPlStr}</span>}
          />
        </div>
      </header>

      {/* Trader Brief — collapsible LLM digest (style, sectors, watching). */}
      <TraderBrief author={author} />

      {/* Positions list */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h3 className="section-title">Positions</h3>
          <span className="num text-sm text-text-muted">{positions.length}</span>
        </div>
        <div className="card overflow-hidden" style={{ padding: 0 }}>
          {positions.length === 0 ? (
            <div className="py-6 text-center text-sm text-text-muted">
              No positions in window.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {positions.map((p) => {
                const k = positionKeyString(p.position_key);
                return (
                  <TraderPositionRow
                    key={k}
                    position={p}
                    expanded={expandedPositionKey === k}
                    activeTicker={activeTicker}
                    onToggle={(key) =>
                      setExpandedPositionKey((cur) =>
                        cur === key ? null : key,
                      )
                    }
                    onTickerClick={(t) => setActiveTicker(t)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Page shell ──────────────────────────────────────────── */

export function TraderLeaderboardPage() {
  const [lookback] = useState<number>(30);
  const [sortMode, setSortMode] = useState<SortMode>("n_calls");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [selected, setSelected] = useState<string | null>(null);

  const leaderboardQuery = useLeaderboard(lookback);
  const { data, isLoading, isFetching } = leaderboardQuery;
  // Pass the user's LOCAL calendar day — the backend defaults to the UTC day,
  // which rolls over at 5pm PT and blanks the evening review window.
  const { data: todayData } = useTradersToday(marketDate());
  const todayMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    todayData?.authors?.forEach((a) => {
      m[a.author] = a.count;
    });
    return m;
  }, [todayData]);

  const rows: LeaderboardRow[] = useMemo(() => {
    if (!data || data.ok === false) return [];
    return data.leaderboard;
  }, [data]);

  // Default-select: first row by n_calls desc (matches backend default order).
  // We use the backend's first row directly — it's already n_calls-desc.
  const defaultAuthor = rows.length > 0 ? rows[0].author : null;
  const activeSelected = selected ?? defaultAuthor;
  const selectedRow =
    rows.find((r) => r.author === activeSelected) || null;

  const handleSort = (mode: SortMode) => {
    if (mode === sortMode) {
      setSortDesc((d) => !d);
    } else {
      setSortMode(mode);
      // Sensible defaults: descending for numeric metrics, ascending for author.
      setSortDesc(mode !== "author");
    }
  };

  // Page header counts
  const nTraders = data && data.ok ? data.n_traders : 0;
  const headerSub =
    data && data.ok === false
      ? `Backend: ${data.reason}`
      : `Last ${lookback} days · ${nTraders} trader${nTraders === 1 ? "" : "s"}`;

  return (
    <div className="desk-page">
      <header className="desk-header">
        <div className="desk-header__title">
          <h1>Traders</h1>
          <p>{headerSub}</p>
        </div>
        <div className="desk-header__actions text-xs text-text-muted">
          Auto-refresh 60s
        </div>
      </header>
      <QueryNotice queries={[leaderboardQuery]} label="Trader leaderboard" />

      {/* Body */}
      {(leaderboardQuery.isError || leaderboardQuery.fetchStatus === "paused") && !data ? null : data && data.ok === false ? (
        <EmptyState
          title="Alerts pipeline not yet initialized"
          body="Start the fetcher service (`stock-timefm-alerts.service`) and run `scripts/parse_and_score_alerts.py` to populate the alerts DB. This page will populate on the next refresh once the tables exist."
        />
      ) : isLoading || (isFetching && !data) ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-5 xl:col-span-4 space-y-2">
            <SkeletonCard height={48} />
            <SkeletonCard height={48} />
            <SkeletonCard height={48} />
            <SkeletonCard height={48} />
          </div>
          <div className="col-span-12 lg:col-span-7 xl:col-span-8 space-y-3">
            <SkeletonCard height={120} />
            <SkeletonCard height={360} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No alerts in last ${lookback} days`}
          body="No parsed trade calls returned for this window."
        />
      ) : (
        <div className="grid grid-cols-12 items-start gap-x-10 gap-y-8">
          {/* Left: the ranking — the page's focal point */}
          <section className="col-span-12 flex min-w-0 flex-col gap-3 lg:col-span-5 xl:col-span-4">
            <div>
              <h2 className="section-title">Leaderboard</h2>
              <p className="section-sub inline-flex items-center gap-1">
                Ranked by {SORT_LABELS[sortMode].toLowerCase()}
                <ArrowUpDown size={11} className="opacity-70" aria-hidden="true" />
                {sortDesc ? "high to low" : "low to high"}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Segmented<SortMode>
                ariaLabel="Leaderboard sort"
                options={SORT_OPTIONS}
                value={sortMode}
                onChange={handleSort}
              />
            </div>
            <div className="card overflow-hidden" style={{ padding: 0 }}>
              <LeaderboardTable
                rows={rows}
                selected={activeSelected}
                onSelect={setSelected}
                sortMode={sortMode}
                onSort={handleSort}
                sortDesc={sortDesc}
                todayMap={todayMap}
              />
            </div>
          </section>

          {/* Right: selected trader profile */}
          <div className="col-span-12 min-w-0 lg:col-span-7 xl:col-span-8">
            <TraderProfile
              author={activeSelected}
              leaderboardRow={selectedRow}
            />
          </div>
        </div>
      )}

      {/* Secondary band: cross-trader signals + today's raw feed (rail). */}
      <div className="mt-4 grid grid-cols-12 items-start gap-x-10 gap-y-8 border-t border-border pt-8">
        <div className="col-span-12 min-w-0 xl:col-span-8">
          <SignalsView />
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-4">
          {/* Today's raw chronological activity — straight from
              extracted_calls. No state derivation, no stitching. */}
          <TradersTodayFeed />
        </div>
      </div>
    </div>
  );
}
