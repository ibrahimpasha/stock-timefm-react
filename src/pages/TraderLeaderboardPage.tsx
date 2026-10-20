import { useMemo, useState } from "react";
import { QueryNotice } from "../components/QueryNotice";
import { marketDate } from "../lib/liveFeeds";
import { ArrowUpDown } from "lucide-react";

import { useAppStore } from "../store/useAppStore";
import { useLeaderboard, useAlertsPositions, useTradersToday } from "../api/alerts";
import { Sparkline } from "../components/CCPrimitives";
import { Segmented } from "../components/Glass";
import { TileGrid, Tile, Kpi, KpiTile, toneOf, toneColor } from "../components/Cockpit";
import {
  formatPercentRaw,
  relativeAge,
  absoluteAge,
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

/** Min exits before a trader can hold the "best win rate / mean" KPI —
 *  one lucky close shouldn't headline the page. */
const KPI_MIN_EXITS = 3;

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

const TONE_FILL = {
  up: "var(--accent-green)",
  down: "var(--accent-red)",
  neutral: "var(--text-muted)",
} as const;

/** Win-rate bar: fills from the left on the track, 50% tick marks breakeven. */
function WinBar({ pct }: { pct: number }) {
  const t = pct >= 50 ? "up" : "down";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative h-3 min-w-0 flex-1 rounded-[3px]" style={{ background: "var(--track)" }}>
        <div className="h-3 rounded-[3px]" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: toneColor(t) }} />
        <span aria-hidden="true" className="absolute -top-0.5 left-1/2 h-4 w-px" style={{ background: "var(--text-muted)" }} />
      </div>
      <span className="num w-9 shrink-0 text-right text-[0.8125rem]" style={{ color: toneColor(t) }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

/** Signed bar centered on zero. `max` = |value| that fills one half. */
function SignedBar({ value, max }: { value: number; max: number }) {
  const t = toneOf(value);
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const bar = { width: `${Math.max(pct, value ? 3 : 0)}%`, background: toneColor(t) };
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <div className="flex justify-end">{value < 0 && <span className="h-3 rounded-l-[3px]" style={bar} />}</div>
        <div className="flex border-l border-border">{value > 0 && <span className="h-3 rounded-r-[3px]" style={bar} />}</div>
      </div>
      <span className="num w-14 shrink-0 text-right text-[0.8125rem]" style={{ color: toneColor(t) }}>
        {formatPercentRaw(value, 1)}
      </span>
    </div>
  );
}

/* ── Empty / loading states ──────────────────────────────── */

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-center justify-center min-h-60">
      <div className="max-w-lg text-center">
        <h2 className="mb-2 text-[0.9375rem] font-semibold text-text-primary">{title}</h2>
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

/* ── Leaderboard (bar rows) ──────────────────────────────── */

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

/* rank | trader | N | today | win bar | mean bar | last */
const LB_COLS =
  "grid-cols-[1.5rem_minmax(0,1fr)_3.25rem_minmax(0,1fr)_minmax(0,1fr)] md:grid-cols-[1.5rem_minmax(7rem,1.1fr)_3.25rem_2.75rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem]";

function SortHead({
  mode,
  label,
  align = "left",
  sortMode,
  onSort,
  sortDesc,
  className = "",
}: {
  mode: SortMode;
  label: string;
  align?: "left" | "right";
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
  sortDesc: boolean;
  className?: string;
}) {
  const active = sortMode === mode;
  return (
    <button
      type="button"
      onClick={() => onSort(mode)}
      aria-sort={active ? (sortDesc ? "descending" : "ascending") : undefined}
      className={`inline-flex min-h-6 items-center gap-1 rounded text-xs whitespace-nowrap ${
        align === "right" ? "justify-end" : "justify-start"
      } ${active ? "font-semibold text-accent" : "font-medium text-text-muted hover:text-text-primary"} ${className}`}
    >
      {label}
      {active && <ArrowUpDown size={10} className="opacity-70" aria-hidden="true" />}
    </button>
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

  const maxMean = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Math.abs(r.mean_pl_pct ?? 0)), 0) || 1,
    [rows],
  );

  const h = { sortMode, onSort, sortDesc };
  return (
    <div className="-mx-1 overflow-auto" style={{ maxHeight: "calc(100vh - 300px)", minHeight: 240 }}>
      <div
        className={`sticky top-0 z-[1] grid items-center gap-x-3 border-b border-border bg-bg-card px-2 pb-1.5 ${LB_COLS}`}
      >
        <span className="text-xs text-text-muted">#</span>
        <SortHead mode="author" label="Trader" {...h} />
        <SortHead mode="n_calls" label="Calls" align="right" {...h} />
        <SortHead mode="today" label="Today" align="right" className="max-md:hidden" {...h} />
        <SortHead mode="win_rate" label="Win rate" {...h} />
        <SortHead mode="mean_pl_pct" label="Mean outcome" {...h} />
        <SortHead mode="latest" label="Last" align="right" className="max-md:hidden" {...h} />
      </div>
      <div className="flex flex-col">
        {sorted.map((r, i) => {
          const isSel = selected === r.author;
          const winPct = r.win_rate != null ? r.win_rate * 100 : null;
          const today = todayMap[r.author] || 0;
          return (
            <button
              key={r.author}
              type="button"
              onClick={() => onSelect(r.author)}
              aria-pressed={isSel}
              className={`grid min-h-11 w-full items-center gap-x-3 rounded-md px-2 py-1.5 text-left transition-colors ${LB_COLS} ${
                isSel ? "" : "hover:bg-bg-card-hover"
              }`}
              style={{
                background: isSel ? "color-mix(in srgb, var(--accent) 14%, transparent)" : undefined,
              }}
            >
              <span
                className={`num text-right text-[0.8125rem] ${
                  isSel ? "font-semibold text-accent" : i < 3 ? "font-semibold text-text-primary" : "text-text-muted"
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-sm text-text-primary ${isSel ? "font-semibold" : "font-medium"}`}
                  title={r.author}
                >
                  {r.author}
                </span>
                {r.top_ticker && (
                  <span className="block truncate text-xs text-text-muted">
                    top <span className="ticker text-text-secondary">{r.top_ticker}</span>
                  </span>
                )}
              </span>
              <span className="num text-right text-[0.8125rem] text-text-secondary">
                {r.n_calls}
                {r.n_realized > 0 && (
                  <span className="text-xs text-text-muted" title={`${r.n_realized} realized (closed)`}>
                    /{r.n_realized}
                  </span>
                )}
              </span>
              <span
                className={`num text-right text-[0.8125rem] max-md:hidden ${
                  today > 0 ? "font-semibold text-text-primary" : "text-text-muted"
                }`}
                title="Events extracted today (open/add/trim/close/stop/status/recap)"
              >
                {today}
              </span>
              {winPct != null ? (
                <WinBar pct={winPct} />
              ) : (
                <span className="num text-[0.8125rem] text-text-muted">—</span>
              )}
              {r.mean_pl_pct != null ? (
                <SignedBar value={r.mean_pl_pct} max={maxMean} />
              ) : (
                <span className="num text-[0.8125rem] text-text-muted">—</span>
              )}
              <span
                className="num whitespace-nowrap text-right text-xs text-text-muted max-md:hidden"
                title={absoluteAge(r.latest_call_ts) || ""}
              >
                {relativeAge(r.latest_call_ts) || "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Trader profile (profile tile + positions tile + brief) ─ */

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
      <Tile span={12}>
        <EmptyState
          title="Select a trader"
          body="Pick a row in the leaderboard to see their recent positions, win rate, and P/L profile."
        />
      </Tile>
    );
  }

  if (isLoading || (isFetching && !data)) {
    return (
      <>
        <Tile span={4}>
          <SkeletonCard height={220} />
        </Tile>
        <Tile span={8}>
          <SkeletonCard height={300} />
        </Tile>
      </>
    );
  }

  if (!data || data.ok === false) {
    return (
      <Tile span={12} title={author}>
        <QueryNotice queries={[positionsQuery]} label="Trader positions" />
        <EmptyState
          title="Trader profile unavailable"
          body={
            data && data.ok === false
              ? `Backend returned: ${data.reason}.`
              : "Could not load this trader's positions."
          }
        />
      </Tile>
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

  const outcomeSum =
    sparkPoints.length >= 1 ? sparkPoints[sparkPoints.length - 1] : null;
  const openCount = positions.filter((p) => !["closed", "stopped"].includes((p.status || "").toLowerCase())).length;

  return (
    <>
      {/* Profile: who, the hero number, the curve, the 4 stats. */}
      <Tile
        span={4}
        title={
          <span className="block truncate" title={author}>
            {author}
          </span>
        }
        meta={
          leaderboardRow?.top_ticker ? (
            <>
              most traded{" "}
              <button
                type="button"
                onClick={() => setActiveTicker(leaderboardRow.top_ticker!)}
                aria-label={`Select ${leaderboardRow.top_ticker} ticker`}
                className="ticker cursor-pointer text-text-primary hover:text-accent"
              >
                {leaderboardRow.top_ticker}
              </button>
            </>
          ) : undefined
        }
        bodyClassName="gap-4"
      >
        <QueryNotice queries={[positionsQuery]} label="Trader positions" />
        <Kpi
          label="Outcome sum, 60d"
          value={
            <span style={{ color: outcomeSum != null ? toneColor(toneOf(outcomeSum)) : "var(--text-muted)" }}>
              {outcomeSum != null ? outcomeSum.toFixed(1) : "—"}
              <span className="ml-1 text-base font-medium text-text-muted">pp</span>
            </span>
          }
          size="xl"
        />
        {sparkPoints.length >= 2 && (
          <div className="overflow-hidden">
            <Sparkline
              points={sparkPoints}
              width={320}
              height={64}
              color={(outcomeSum ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)"}
              fill
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3">
          <Kpi label="Positions" value={nPositions} sub={`${openCount} not closed`} size="md" />
          <Kpi
            label="With exits"
            value={nRealized}
            sub={nPositions ? `${nRealized}/${nPositions}` : undefined}
            size="md"
          />
          <Kpi
            label="Positive exits"
            value={
              <span
                style={{
                  color: winRate != null ? TONE_FILL[winRate >= 0.5 ? "up" : "down"] : undefined,
                }}
              >
                {winRate != null ? (winRate * 100).toFixed(0) + "%" : "—"}
              </span>
            }
            size="md"
          />
          <Kpi
            label="Mean outcome"
            value={
              <span style={{ color: meanPl != null ? toneColor(toneOf(meanPl)) : "var(--text-muted)" }}>
                {meanPl != null ? formatPercentRaw(meanPl, 1) : "—"}
              </span>
            }
            size="md"
          />
        </div>
        <p className="mt-auto text-xs leading-relaxed text-text-muted">
          Reported peak/exit outcomes, not fill-weighted realized or portfolio returns.
        </p>
      </Tile>

      {/* Positions table */}
      <Tile span={8} title="Positions" meta={<span className="num">{positions.length} in 60d</span>}>
        {positions.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-muted">No positions in window.</div>
        ) : (
          <div className="-mx-1 overflow-auto" style={{ maxHeight: 640 }}>
            <div className="sticky top-0 z-[1] grid grid-cols-[3.25rem_minmax(0,1fr)_5rem_1.5rem] items-center gap-x-3 border-b border-border bg-bg-card px-2 pb-1.5 text-xs text-text-muted md:grid-cols-[3.25rem_4.75rem_minmax(0,1fr)_5rem_3.75rem_4.5rem_3rem_5.5rem_1.5rem]">
              <span>Last</span>
              <span className="max-md:hidden">Status</span>
              <span>Contract</span>
              <span className="max-md:hidden">DTE</span>
              <span className="text-right max-md:hidden">Entry</span>
              <span className="text-right max-md:hidden">Und</span>
              <span className="text-right max-md:hidden">Ev</span>
              <span className="text-right">P/L</span>
              <span />
            </div>
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
          </div>
        )}
      </Tile>

      {/* Trader Brief — collapsible LLM digest (style, sectors, watching). */}
      <div className="min-w-0 lg:col-span-12">
        <TraderBrief author={author} />
      </div>
    </>
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

  // KPI strip — pure derivations off the leaderboard rows.
  const kpis = useMemo(() => {
    const calls = rows.reduce((s, r) => s + (r.n_calls || 0), 0);
    const realized = rows.reduce((s, r) => s + (r.n_realized || 0), 0);
    const pool = rows.filter((r) => r.n_realized >= KPI_MIN_EXITS);
    const cand = pool.length > 0 ? pool : rows;
    const best = (f: (r: LeaderboardRow) => number | null) =>
      cand.reduce<LeaderboardRow | null>((b, r) => {
        const v = f(r);
        if (v == null) return b;
        const bv = b ? f(b) : null;
        return bv == null || v > bv ? r : b;
      }, null);
    return {
      calls,
      realized,
      bestWin: best((r) => r.win_rate),
      bestMean: best((r) => r.mean_pl_pct),
      minNote: pool.length > 0 ? ` · ${KPI_MIN_EXITS}+ exits` : "",
    };
  }, [rows]);
  const activeToday = Object.keys(todayMap).length;

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

  const bestWinPct = kpis.bestWin?.win_rate != null ? kpis.bestWin.win_rate * 100 : null;
  const bestMean = kpis.bestMean?.mean_pl_pct ?? null;

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
        <TileGrid>
          {[0, 1, 2, 3].map((i) => (
            <Tile key={i} span={3}>
              <SkeletonCard height={56} />
            </Tile>
          ))}
          <Tile span={7}>
            <SkeletonCard height={360} />
          </Tile>
          <Tile span={5}>
            <SkeletonCard height={360} />
          </Tile>
        </TileGrid>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No alerts in last ${lookback} days`}
          body="No parsed trade calls returned for this window."
        />
      ) : (
        <TileGrid>
          {/* KPI strip */}
          <KpiTile label="Traders" value={nTraders} sub={`${activeToday} active today`} />
          <KpiTile
            label={`Calls, ${lookback}d`}
            value={kpis.calls.toLocaleString()}
            sub={`${kpis.realized.toLocaleString()} with exits`}
          />
          <KpiTile
            label="Best win rate"
            value={bestWinPct != null ? `${bestWinPct.toFixed(0)}%` : "—"}
            sub={kpis.bestWin ? `${kpis.bestWin.author}${kpis.minNote}` : undefined}
          />
          <KpiTile
            label="Best mean outcome"
            value={
              <span style={{ color: bestMean != null ? toneColor(toneOf(bestMean)) : undefined }}>
                {bestMean != null ? formatPercentRaw(bestMean, 1) : "—"}
              </span>
            }
            sub={kpis.bestMean ? `${kpis.bestMean.author}${kpis.minNote}` : undefined}
          />

          {/* Leaderboard — the page's primary dataset */}
          <Tile
            span={7}
            title="Leaderboard"
            meta={
              <span className="inline-flex items-center gap-1">
                by {SORT_LABELS[sortMode].toLowerCase()}, {sortDesc ? "high to low" : "low to high"}
              </span>
            }
            actions={
              <div className="max-w-full overflow-x-auto">
                <Segmented<SortMode>
                  ariaLabel="Leaderboard sort"
                  options={SORT_OPTIONS}
                  value={sortMode}
                  onChange={handleSort}
                />
              </div>
            }
          >
            <LeaderboardTable
              rows={rows}
              selected={activeSelected}
              onSelect={setSelected}
              sortMode={sortMode}
              onSort={handleSort}
              sortDesc={sortDesc}
              todayMap={todayMap}
            />
          </Tile>

          {/* Today's raw chronological activity — straight from
              extracted_calls. No state derivation, no stitching. */}
          <div className="flex min-w-0 flex-col lg:col-span-5">
            <TradersTodayFeed />
          </div>

          {/* Selected trader: profile + positions + brief */}
          <TraderProfile author={activeSelected} leaderboardRow={selectedRow} />
        </TileGrid>
      )}

      {/* Cross-trader signals */}
      <div className="mt-3.5 min-w-0">
        <SignalsView />
      </div>
    </div>
  );
}
