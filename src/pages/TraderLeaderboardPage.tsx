import { useMemo, useState } from "react";
import { Users, TrendingUp, ArrowUpDown } from "lucide-react";

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
  mean_pl_pct: "Mean P/L",
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
  const s = (p.status || "").toLowerCase();
  if (s === "closed" || s === "stopped") {
    return p.cumulative_exit_pct ?? p.current_pl_pct ?? null;
  }
  if (s === "partial") {
    return p.cumulative_exit_pct ?? p.current_pl_pct ?? null;
  }
  return p.current_pl_pct ?? p.cumulative_exit_pct ?? null;
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
      <div className="card max-w-lg text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2">
          Alerts feed
        </div>
        <h2 className="text-sm font-semibold text-text-primary mb-2">
          {title}
        </h2>
        <p className="text-sm text-text-muted leading-relaxed">{body}</p>
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
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
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
}: {
  mode: SortMode;
  label: string;
  align?: "left" | "right";
  sortMode: SortMode;
  onSort: (mode: SortMode) => void;
}) {
  const active = sortMode === mode;
  return (
    <th
      onClick={() => onSort(mode)}
      className={`px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] whitespace-nowrap cursor-pointer select-none ${
        active ? "text-text-secondary" : "text-text-muted"
      }`}
      style={{
        textAlign: align,
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "var(--glass-bg-strong)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <ArrowUpDown size={10} className="opacity-70" />}
      </span>
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

  const tdBorder = { borderBottom: "1px solid var(--border)" } as const;

  return (
    <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <LeaderboardHeader mode="author" label="Trader" sortMode={sortMode} onSort={onSort} />
            <LeaderboardHeader mode="n_calls" label="N" align="right" sortMode={sortMode} onSort={onSort} />
            <LeaderboardHeader mode="today" label="Today" align="right" sortMode={sortMode} onSort={onSort} />
            <LeaderboardHeader mode="win_rate" label="Win" align="right" sortMode={sortMode} onSort={onSort} />
            <LeaderboardHeader mode="mean_pl_pct" label="Mean" align="right" sortMode={sortMode} onSort={onSort} />
            <LeaderboardHeader mode="latest" label="Last" align="right" sortMode={sortMode} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
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
                  borderLeft: isSel
                    ? "2px solid var(--accent-blue)"
                    : "2px solid transparent",
                }}
              >
                <td className="px-2.5 py-2" style={tdBorder}>
                  <div
                    className={`num text-sm text-text-primary max-w-40 truncate ${
                      isSel ? "font-bold" : "font-semibold"
                    }`}
                    title={r.author}
                  >
                    {r.author}
                  </div>
                  {r.top_ticker && (
                    <div className="num text-xs text-text-muted mt-0.5">
                      top: {r.top_ticker}
                    </div>
                  )}
                </td>
                <td
                  className="num px-2.5 py-2 text-right text-sm text-text-secondary"
                  style={tdBorder}
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
                  className={`num px-2.5 py-2 text-right text-sm ${
                    (todayMap[r.author] || 0) > 0 ? "font-semibold" : ""
                  }`}
                  style={{
                    ...tdBorder,
                    color:
                      (todayMap[r.author] || 0) > 0
                        ? "var(--accent-orange)"
                        : "var(--text-muted)",
                  }}
                  title="Events extracted today (open/add/trim/close/stop/status/recap)"
                >
                  {todayMap[r.author] || 0}
                </td>
                <td className="px-2.5 py-2 min-w-24" style={tdBorder}>
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
                  className="num px-2.5 py-2 text-right text-sm font-semibold"
                  style={{
                    ...tdBorder,
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
                  className="num px-2.5 py-2 text-right text-xs text-text-muted whitespace-nowrap"
                  style={tdBorder}
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

  const { data, isLoading, isFetching } = useAlertsPositions(author ?? "", 60);

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
      <div className="space-y-3">
        <SkeletonCard height={120} />
        <SkeletonCard height={300} />
      </div>
    );
  }

  if (!data || data.ok === false) {
    return (
      <EmptyState
        title="Trader profile unavailable"
        body={
          data && data.ok === false
            ? `Backend returned: ${data.reason}.`
            : "Could not load this trader's positions."
        }
      />
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
      (p) => p.cumulative_exit_pct != null,
    );
    if (scored.length === 0) return null;
    const wins = scored.filter((p) => (p.cumulative_exit_pct ?? 0) > 0).length;
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

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Header card — glass-strong so the detail column reads as the
          focused layer over the ambient field. */}
      <section className="glass-strong p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1">
              Trader
            </div>
            <div
              className="num text-lg font-bold text-text-primary truncate"
              title={author}
            >
              {author}
            </div>
            {leaderboardRow?.top_ticker && (
              <div className="mt-1.5 text-sm text-text-secondary">
                top ticker:{" "}
                <button
                  type="button"
                  onClick={() => setActiveTicker(leaderboardRow.top_ticker!)}
                  className="num text-sm font-bold cursor-pointer p-0"
                  style={{
                    color: "var(--accent-blue)",
                    background: "transparent",
                    border: "none",
                  }}
                >
                  {leaderboardRow.top_ticker}
                </button>
              </div>
            )}
          </div>

          {/* Cumulative P/L sparkline — the hero number of the panel */}
          {sparkPoints.length >= 2 && (
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1">
                Cumulative P/L
              </div>
              <Sparkline
                points={sparkPoints}
                width={140}
                height={36}
                color={
                  sparkPoints[sparkPoints.length - 1] >= 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)"
                }
                fill
              />
              <div
                className="num text-lg font-bold mt-0.5"
                style={{
                  color: changeColor(sparkPoints[sparkPoints.length - 1]),
                }}
              >
                {formatPercentRaw(sparkPoints[sparkPoints.length - 1], 1)}
              </div>
            </div>
          )}
        </div>

        {/* Metric strip — summary Stats (derived from positions) */}
        <div
          className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3.5 pt-3.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <Stat label="Positions" value={String(nPositions)} />
          <Stat
            label="Realized"
            value={String(nRealized)}
            sub={nPositions ? `${nRealized}/${nPositions}` : undefined}
          />
          <Stat
            label="Win"
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
            label="Mean P/L"
            value={
              <span style={{ color: meanPlColor }}>{meanPlStr}</span>
            }
          />
          <Stat
            label="Cumulative P/L"
            value={
              sparkPoints.length >= 1 ? (
                <span
                  style={{
                    color: changeColor(
                      sparkPoints[sparkPoints.length - 1] || 0,
                    ),
                  }}
                >
                  {formatPercentRaw(
                    sparkPoints[sparkPoints.length - 1] || 0,
                    1,
                  )}
                </span>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      {/* Trader Brief — collapsible LLM digest. Sits above positions because
          it gives the meta-context (style, sectors, watching) the per-position
          list doesn't carry. Default collapsed; one click to expand, one click
          to generate. */}
      <TraderBrief author={author} />

      {/* Positions list */}
      <section className="glass-strong overflow-hidden">
        <header
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Positions (<span className="num">{positions.length}</span>)
          </h3>
        </header>
        {positions.length === 0 ? (
          <div className="py-5 text-center text-sm text-text-muted">
            No positions in window.
          </div>
        ) : (
          <div className="flex flex-col">
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

  const { data, isLoading, isFetching } = useLeaderboard(lookback);
  // Pass the user's LOCAL calendar day — the backend defaults to the UTC day,
  // which rolls over at 5pm PT and blanks the evening review window.
  const { data: todayData } = useTradersToday(new Date().toLocaleDateString("en-CA"));
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
    <div className="flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-accent-purple" />
          <h1 className="text-lg font-semibold text-text-primary m-0">
            Trader Leaderboard
          </h1>
          <span className="num text-xs text-text-muted">{headerSub}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <TrendingUp size={13} />
          <span>Auto-refresh 60s</span>
        </div>
      </div>

      {/* Today's raw chronological activity — what each trader posted today,
          straight from extracted_calls. No state derivation, no stitching. */}
      <TradersTodayFeed />

      {/* Signals view — trending tickers, first-mention leaders, sentiment.
          Self-contained; falls back to an empty state until A/B endpoints land. */}
      <SignalsView />

      {/* Body */}
      {data && data.ok === false ? (
        <EmptyState
          title="Alerts pipeline not yet initialized"
          body="Start the fetcher service (`stock-timefm-alerts.service`) and run `scripts/parse_and_score_alerts.py` to populate the alerts DB. This page will populate on the next refresh once the tables exist."
        />
      ) : isLoading || (isFetching && !data) ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-4 space-y-2">
            <SkeletonCard height={48} />
            <SkeletonCard height={48} />
            <SkeletonCard height={48} />
            <SkeletonCard height={48} />
          </div>
          <div className="col-span-12 lg:col-span-8 space-y-3">
            <SkeletonCard height={120} />
            <SkeletonCard height={360} />
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No alerts in last 30 days"
          body="The alerts DB exists but contains no parsed trade calls in this window. Backfill via `scripts/parse_and_score_alerts.py` over historical alerts."
        />
      ) : (
        <div className="grid grid-cols-12 gap-4 items-start">
          {/* Left: leaderboard list */}
          <div
            className="col-span-12 lg:col-span-4 card overflow-hidden"
            style={{ padding: 0 }}
          >
            <div
              className="flex flex-col gap-2 px-3 pt-3 pb-2"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                  Leaderboard
                </h3>
                <span className="text-xs text-text-muted inline-flex items-center gap-1">
                  {SORT_LABELS[sortMode]}
                  <ArrowUpDown size={10} className="opacity-70" />
                  {sortDesc ? "desc" : "asc"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Segmented<SortMode>
                  options={SORT_OPTIONS}
                  value={sortMode}
                  onChange={handleSort}
                />
              </div>
            </div>
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

          {/* Right: profile */}
          <div className="col-span-12 lg:col-span-8">
            <TraderProfile
              author={activeSelected}
              leaderboardRow={selectedRow}
            />
          </div>
        </div>
      )}
    </div>
  );
}
