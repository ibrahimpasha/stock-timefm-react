import { useMemo, useState } from "react";
import { Users, TrendingUp, ArrowUpDown } from "lucide-react";

import { useAppStore } from "../store/useAppStore";
import { useLeaderboard, useAlertsPositions, useTradersToday } from "../api/alerts";
import { Panel, Sparkline, RangeBar } from "../components/CCPrimitives";
import {
  classNames,
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
  win_rate: "Win %",
  mean_pl_pct: "Mean P/L",
  latest: "Latest",
  author: "Author",
};

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
    <div
      className="flex items-center justify-center"
      style={{ minHeight: 320 }}
    >
      <div
        style={{
          maxWidth: 520,
          padding: 24,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          textAlign: "center",
        }}
      >
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 8,
          }}
        >
          Alerts feed
        </div>
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 8,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
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
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
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

  const Header = ({ mode, label, align = "left" }: {
    mode: SortMode;
    label: string;
    align?: "left" | "right";
  }) => {
    const active = sortMode === mode;
    return (
      <th
        onClick={() => onSort(mode)}
        style={{
          padding: "6px 10px",
          textAlign: align,
          cursor: "pointer",
          userSelect: "none",
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: active ? "var(--accent-blue)" : "var(--text-muted)",
          fontWeight: 600,
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          borderBottom: "1px solid var(--border)",
          background: "rgba(22,27,34,0.4)",
          position: "sticky",
          top: 0,
          zIndex: 1,
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          {active && (
            <ArrowUpDown size={10} style={{ opacity: 0.7 }} />
          )}
        </span>
      </th>
    );
  };

  return (
    <div style={{ overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr>
            <Header mode="author" label="Trader" />
            <Header mode="n_calls" label="N" align="right" />
            <Header mode="today" label="Today" align="right" />
            <Header mode="win_rate" label="Win" align="right" />
            <Header mode="mean_pl_pct" label="Mean" align="right" />
            <Header mode="latest" label="Last" align="right" />
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
                style={{
                  cursor: "pointer",
                  background: isSel ? "rgba(88,166,255,0.10)" : "transparent",
                  borderLeft: isSel
                    ? "2px solid var(--accent-blue)"
                    : "2px solid transparent",
                }}
              >
                <td
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                  }}
                >
                  <div
                    className="font-mono"
                    style={{
                      color: "var(--text-primary)",
                      fontWeight: isSel ? 700 : 600,
                      fontSize: 14,
                      maxWidth: 160,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={r.author}
                  >
                    {r.author}
                  </div>
                  {r.top_ticker && (
                    <div
                      className="font-mono"
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      top: {r.top_ticker}
                    </div>
                  )}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    color: "var(--text-secondary)",
                    fontSize: 14,
                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                  }}
                >
                  {r.n_calls}
                  {r.n_realized > 0 && (
                    <span
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                        marginLeft: 4,
                      }}
                      title={`${r.n_realized} realized (closed)`}
                    >
                      /{r.n_realized}
                    </span>
                  )}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontSize: 14,
                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                    color:
                      (todayMap[r.author] || 0) > 0
                        ? "var(--accent-orange)"
                        : "var(--text-muted)",
                    fontWeight: (todayMap[r.author] || 0) > 0 ? 600 : 400,
                  }}
                  title="Events extracted today (open/add/trim/close/stop/status/recap)"
                >
                  {todayMap[r.author] || 0}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                    minWidth: 90,
                  }}
                >
                  {winPct != null ? (
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 13,
                          color: changeColor(winPct - 50),
                          minWidth: 36,
                          textAlign: "right",
                          fontWeight: 600,
                        }}
                      >
                        {winPct.toFixed(0)}%
                      </span>
                      <div style={{ flex: 1, minWidth: 40 }}>
                        <RangeBar low={0} high={100} last={winPct} width="100%" />
                      </div>
                    </div>
                  ) : (
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 13,
                        color: "var(--text-muted)",
                      }}
                    >
                      —
                    </span>
                  )}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 600,
                    color:
                      r.mean_pl_pct != null
                        ? changeColor(r.mean_pl_pct)
                        : "var(--text-muted)",
                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                  }}
                >
                  {r.mean_pl_pct != null
                    ? formatPercentRaw(r.mean_pl_pct, 1)
                    : "—"}
                </td>
                <td
                  className="font-mono"
                  style={{
                    padding: "8px 10px",
                    textAlign: "right",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    borderBottom: "1px solid rgba(48,54,61,0.5)",
                    whiteSpace: "nowrap",
                  }}
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
    <div className="space-y-3" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Header card */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              className="font-mono text-xs uppercase"
              style={{
                letterSpacing: 1.4,
                color: "var(--text-muted)",
                marginBottom: 4,
              }}
            >
              Trader
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={author}
            >
              {author}
            </div>
            {leaderboardRow?.top_ticker && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                top ticker:{" "}
                <button
                  type="button"
                  onClick={() => setActiveTicker(leaderboardRow.top_ticker!)}
                  className="font-mono"
                  style={{
                    color: "var(--accent-blue)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {leaderboardRow.top_ticker}
                </button>
              </div>
            )}
          </div>

          {/* Cumulative P/L sparkline */}
          {sparkPoints.length >= 2 && (
            <div style={{ textAlign: "right" }}>
              <div
                className="font-mono text-xs uppercase"
                style={{
                  letterSpacing: 1.4,
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
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
                className="font-mono"
                style={{
                  fontSize: 16,
                  marginTop: 2,
                  fontWeight: 700,
                  color: changeColor(sparkPoints[sparkPoints.length - 1]),
                }}
              >
                {formatPercentRaw(sparkPoints[sparkPoints.length - 1], 1)}
              </div>
            </div>
          )}
        </div>

        {/* Metric strip — 5 columns, big numbers (derived from positions) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 12,
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid var(--border)",
          }}
        >
          <Metric label="Positions" value={String(nPositions)} />
          <Metric
            label="Realized"
            value={String(nRealized)}
            sub={
              nPositions ? `${nRealized}/${nPositions}` : undefined
            }
          />
          <Metric
            label="Win"
            value={winPct}
            valueColor={
              winRate != null
                ? changeColor(winRate * 100 - 50)
                : undefined
            }
          />
          <Metric
            label="Mean P/L"
            value={meanPlStr}
            valueColor={meanPlColor}
          />
          <Metric
            label="Cumulative P/L"
            value={
              sparkPoints.length >= 1
                ? formatPercentRaw(
                    sparkPoints[sparkPoints.length - 1] || 0,
                    1,
                  )
                : "—"
            }
            valueColor={
              sparkPoints.length >= 1
                ? changeColor(sparkPoints[sparkPoints.length - 1] || 0)
                : undefined
            }
          />
        </div>
      </div>

      {/* Trader Brief — collapsible LLM digest. Sits above positions because
          it gives the meta-context (style, sectors, watching) the per-position
          list doesn't carry. Default collapsed; one click to expand, one click
          to generate. */}
      <TraderBrief author={author} />

      {/* Positions list */}
      <Panel
        title={`Positions (${positions.length})`}
        accent="var(--accent-purple)"
        padding={0}
      >
        {positions.length === 0 ? (
          <div
            className="text-base"
            style={{
              padding: 20,
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            No positions in window.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
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
      </Panel>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div
        className="font-mono text-xs uppercase"
        style={{
          letterSpacing: 1.4,
          color: "var(--text-muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="font-mono"
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: valueColor || "var(--text-primary)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 4,
          }}
        >
          {sub}
        </div>
      )}
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
  const { data: todayData } = useTradersToday();
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
    <div className="space-y-4" style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Users size={22} className="text-accent-purple" />
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Trader Leaderboard
          </h1>
          <span
            className="font-mono"
            style={{ fontSize: 12, color: "var(--text-muted)" }}
          >
            {headerSub}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
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
          {/* Left: leaderboard table */}
          <div
            className={classNames("col-span-12 lg:col-span-4")}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                }}
              >
                Leaderboard
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                }}
              >
                sort: {SORT_LABELS[sortMode]} {sortDesc ? "↓" : "↑"}
              </span>
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
