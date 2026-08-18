/**
 * SignalsView — Trending / Leaders / Sentiment panel that sits above the
 * existing trader leaderboard on `/traders`.
 *
 * Three tabs, all driven by the new `/api/alerts/*` endpoints landing from
 * Agents A (text analysis) and B (LLM extractor). All endpoints can return
 * `{ ok: false, reason: 'alerts_db_not_ready' }` until populated — each tab
 * renders a clean empty state when that happens.
 *
 * Glass remodel: the shell is a `GlassPanel`, the three tabs and every
 * window/lookback selector are `Segmented` controls, badges are `Chip`s and
 * tables follow the spec treatment (muted sticky header, hover rows, `num`
 * on all metrics). Behavior and data flow are unchanged.
 */
import { useMemo, useState } from "react";
import { TrendingUp, Flame, Award, BarChart3, X, ShieldCheck } from "lucide-react";

import {
  useTrending,
  useFirstMentionLeaderboard,
  useSentimentTrajectory,
  useAlertsByTicker,
  useAdminAnalysis,
  type AdminCall,
} from "../../api/alerts";
import { useAppStore } from "../../store/useAppStore";
import { Sparkline, RangeBar } from "../../components/CCPrimitives";
import { GlassPanel, Segmented, Chip, type ChipTone } from "../../components/Glass";
import { catalystTagColor } from "../../lib/constants";
import {
  relativeAge,
  absoluteAge,
  changeColor,
  formatPercentRaw,
} from "../../lib/utils";
import type {
  TrendingTicker,
  FirstMentionRow,
  SentimentPoint,
  AlertCallRow,
  AlertsByTickerOk,
} from "../../lib/types";

/* ── Local helpers ───────────────────────────────────────── */

type SignalsTab = "trending" | "leaders" | "sentiment" | "admin";

const WINDOW_OPTIONS: { hours: number; label: string }[] = [
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 24 * 7, label: "7d" },
];

/** Chip tone for a numeric sentiment score in [-1, 1]. */
function sentimentTone(s: number | null | undefined): ChipTone {
  if (s == null) return "neutral";
  if (s >= 0.15) return "green";
  if (s <= -0.15) return "red";
  return "neutral";
}

function sentimentLabel(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s >= 0.15) return "BULL";
  if (s <= -0.15) return "BEAR";
  return "NEUTRAL";
}

/** Map the catalyst color vars from `catalystTagColor` onto Chip tones. */
const VAR_TO_TONE: Record<string, ChipTone> = {
  "var(--accent-green)": "green",
  "var(--accent-red)": "red",
  "var(--accent-blue)": "blue",
  "var(--accent-purple)": "purple",
  "var(--accent-orange)": "orange",
  "var(--accent-yellow)": "yellow",
  "var(--accent-cyan)": "cyan",
};

function catalystTone(tag: string): ChipTone {
  return VAR_TO_TONE[catalystTagColor(tag)] ?? "neutral";
}

/** Shared spec table header cell: muted, sticky, glass-strong backdrop. */
function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-text-muted whitespace-nowrap"
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
      {children}
    </th>
  );
}

const TD_BASE = "px-2.5 py-2";
const TD_BORDER = { borderBottom: "1px solid var(--border)" } as const;

/* ── Shared empty / loading bits ─────────────────────────── */

function NotReady({ reason }: { reason: string }) {
  return (
    <div className="py-6 px-4 text-center text-sm text-text-muted">
      Pipeline not ready — backend returned <code>{reason}</code>; this panel
      refreshes automatically once annotations land.
    </div>
  );
}

function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse h-9"
          style={{
            background: "var(--bg-card-hover)",
            borderRadius: "var(--radius-control)",
          }}
        />
      ))}
    </div>
  );
}

/* ── Catalyst chip strip ─────────────────────────────────── */

export function CatalystChips({
  catalysts,
  max = 4,
}: {
  catalysts: string[];
  max?: number;
}) {
  if (!catalysts || catalysts.length === 0) return null;
  const shown = catalysts.slice(0, max);
  const extra = catalysts.length - shown.length;
  return (
    <span className="inline-flex flex-wrap gap-1 items-center">
      {shown.map((c) => (
        <Chip key={c} tone={catalystTone(c)} className="uppercase">
          {c}
        </Chip>
      ))}
      {extra > 0 && (
        <span className="num text-xs text-text-muted">+{extra}</span>
      )}
    </span>
  );
}

/* ── Conviction badge ────────────────────────────────────── */

export function ConvictionBadge({
  conviction,
}: {
  conviction: string | null | undefined;
}) {
  if (!conviction) return null;
  const u = conviction.toUpperCase();
  const tone: ChipTone =
    u === "HIGH"
      ? "green"
      : u === "MEDIUM" || u === "MED"
        ? "orange"
        : u === "LOTTO" || u === "LOW"
          ? "red"
          : "neutral";
  return <Chip tone={tone}>{u}</Chip>;
}

/* ── Trending tab ────────────────────────────────────────── */

function TrendingTab({
  windowHours,
  onWindow,
  onTickerClick,
}: {
  windowHours: number;
  onWindow: (h: number) => void;
  onTickerClick: (t: string) => void;
}) {
  const { data, isLoading, isFetching, isError } = useTrending(
    windowHours,
    20,
  );

  const rows: TrendingTicker[] = useMemo(() => {
    if (!data || data.ok === false) return [];
    return data.rows;
  }, [data]);

  const maxScore = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.trending_score || 0), 0) || 1,
    [rows],
  );

  return (
    <div>
      {/* Window selector */}
      <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Window
        </span>
        <Segmented
          options={WINDOW_OPTIONS.map((o) => ({
            value: String(o.hours),
            label: o.label,
          }))}
          value={String(windowHours)}
          onChange={(v) => onWindow(Number(v))}
        />
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-text-muted">
          <TrendingUp size={12} />
          auto-refresh 2m
        </span>
      </div>

      {/* Body */}
      {isError ? (
        <NotReady reason="endpoint_unavailable" />
      ) : data && data.ok === false ? (
        <NotReady reason={data.reason} />
      ) : isLoading || (isFetching && !data) ? (
        <LoadingRows rows={6} />
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-muted">
          No mentions in this window.
        </div>
      ) : (
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Ticker</Th>
                <Th align="right">Mentions</Th>
                <Th align="right">Authors</Th>
                <Th align="right">Score</Th>
                <Th>Sentiment</Th>
                <Th>Catalysts</Th>
                <Th>First by</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const scorePct = Math.round(
                  ((r.trending_score || 0) / maxScore) * 100,
                );
                return (
                  <tr
                    key={r.ticker}
                    className="hover:bg-bg-card-hover transition-colors"
                  >
                    <td className={TD_BASE} style={TD_BORDER}>
                      <button
                        type="button"
                        onClick={() => onTickerClick(r.ticker)}
                        className="num text-sm font-bold text-accent-blue cursor-pointer"
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                        }}
                      >
                        {r.ticker}
                      </button>
                    </td>
                    <td
                      className={`${TD_BASE} num text-right text-text-secondary`}
                      style={TD_BORDER}
                    >
                      {r.n_mentions}
                    </td>
                    <td
                      className={`${TD_BASE} num text-right text-text-secondary`}
                      style={TD_BORDER}
                    >
                      {r.n_unique_authors}
                    </td>
                    <td
                      className={`${TD_BASE} min-w-24`}
                      style={TD_BORDER}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="num text-xs text-text-secondary min-w-7 text-right">
                          {(r.trending_score || 0).toFixed(1)}
                        </span>
                        <div className="flex-1 min-w-10">
                          <RangeBar
                            low={0}
                            high={100}
                            last={scorePct}
                            width="100%"
                          />
                        </div>
                      </div>
                    </td>
                    <td className={TD_BASE} style={TD_BORDER}>
                      <Chip tone={sentimentTone(r.sentiment_avg)}>
                        {sentimentLabel(r.sentiment_avg)}
                        {r.sentiment_avg != null && (
                          <span className="num opacity-80">
                            {r.sentiment_avg.toFixed(2)}
                          </span>
                        )}
                      </Chip>
                    </td>
                    <td className={TD_BASE} style={TD_BORDER}>
                      <CatalystChips catalysts={r.catalysts_top} max={3} />
                    </td>
                    <td className={TD_BASE} style={TD_BORDER}>
                      <div
                        className="num text-xs text-text-primary max-w-32 truncate"
                        title={r.first_mention_author || ""}
                      >
                        {r.first_mention_author || "—"}
                      </div>
                      {r.first_mention_ts && (
                        <div
                          className="num text-xs text-text-muted"
                          title={absoluteAge(r.first_mention_ts) || ""}
                        >
                          {relativeAge(r.first_mention_ts)}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Ticker drawer (Trending tab) ────────────────────────── */

function TickerDrawer({
  ticker,
  onClose,
}: {
  ticker: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useAlertsByTicker(ticker, 30);

  let body: React.ReactNode;
  if (isLoading) {
    body = <LoadingRows rows={3} />;
  } else if (!data || data.ok === false) {
    body = (
      <NotReady
        reason={data && data.ok === false ? data.reason : "no_data"}
      />
    );
  } else {
    const ok = data as AlertsByTickerOk;
    if (ok.calls.length === 0) {
      body = (
        <div className="py-4 text-center text-sm text-text-muted">
          No recent calls on {ticker}.
        </div>
      );
    } else {
      body = (
        <div className="max-h-[360px] overflow-auto">
          {ok.calls.map((c: AlertCallRow) => (
            <div
              key={c.call_id ?? c.alert_id}
              className="grid items-center gap-2 px-3 py-2 text-sm hover:bg-bg-card-hover transition-colors"
              style={{
                gridTemplateColumns: "140px 1fr auto",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                className="num text-text-primary truncate"
                title={c.author || ""}
              >
                {c.author || "—"}
              </div>
              <div className="text-text-secondary truncate">
                {c.channel_name || ""}
                <span
                  className="num ml-1.5 text-xs text-text-muted"
                  title={absoluteAge(c.ts) || ""}
                >
                  {relativeAge(c.ts)}
                </span>
              </div>
              <div className="num text-right">
                {c.est_pl_pct != null || c.realized_pct != null ? (
                  <span
                    className={c.is_realized ? "font-bold" : "italic"}
                    style={{
                      color: changeColor(
                        c.realized_pct ?? c.est_pl_pct ?? 0,
                      ),
                    }}
                  >
                    {formatPercentRaw(
                      c.realized_pct ?? c.est_pl_pct ?? 0,
                      1,
                    )}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <div className="glass-strong mt-2.5 overflow-hidden">
      <header
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          {ticker} · mention history
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          className="inline-flex items-center text-text-muted hover:text-text-primary transition-colors cursor-pointer p-0.5"
          style={{ background: "transparent", border: "none" }}
        >
          <X size={14} />
        </button>
      </header>
      {body}
    </div>
  );
}

/* ── Leaders tab ─────────────────────────────────────────── */

function LeadersTab() {
  const [days, setDays] = useState<number>(14);
  const { data, isLoading, isFetching, isError } =
    useFirstMentionLeaderboard(days);

  const rows: FirstMentionRow[] = useMemo(() => {
    if (!data || data.ok === false) return [];
    return data.rows;
  }, [data]);

  const maxFollowers = useMemo(
    () =>
      rows.reduce(
        (m, r) => Math.max(m, r.n_followers_within_24h_avg ?? 0),
        0,
      ) || 1,
    [rows],
  );

  return (
    <div>
      <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Lookback
        </span>
        <Segmented
          options={[7, 14, 30].map((d) => ({
            value: String(d),
            label: `${d}d`,
          }))}
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
        />
        <span className="ml-auto text-xs text-text-muted">
          first-callers whose picks were followed by 2+ others within 24h
        </span>
      </div>

      {isError ? (
        <NotReady reason="endpoint_unavailable" />
      ) : data && data.ok === false ? (
        <NotReady reason={data.reason} />
      ) : isLoading || (isFetching && !data) ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-muted">
          No first-mention activity in window.
        </div>
      ) : (
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Author</Th>
                <Th align="right">First calls</Th>
                <Th>Avg followers / 24h</Th>
                <Th>Leading tickers</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const followers = r.n_followers_within_24h_avg ?? 0;
                const influencing = followers > 1;
                return (
                  <tr
                    key={r.author}
                    className="hover:bg-bg-card-hover transition-colors"
                    style={{
                      background: influencing
                        ? "color-mix(in srgb, var(--accent-purple) 6%, transparent)"
                        : undefined,
                    }}
                  >
                    <td className={TD_BASE} style={TD_BORDER}>
                      <span
                        className={`num text-sm text-text-primary ${
                          influencing ? "font-bold" : "font-medium"
                        }`}
                        title={r.author}
                      >
                        {r.author}
                        {influencing && (
                          <span
                            className="ml-1.5 text-xs"
                            style={{ color: "var(--accent-purple)" }}
                            title="Influencing: followed by 2+ traders within 24h"
                          >
                            ●
                          </span>
                        )}
                      </span>
                    </td>
                    <td
                      className={`${TD_BASE} num text-right text-text-secondary`}
                      style={TD_BORDER}
                    >
                      {r.n_first_mentions}
                    </td>
                    <td
                      className={`${TD_BASE} min-w-36`}
                      style={TD_BORDER}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="num text-xs min-w-8 text-right"
                          style={{
                            color: influencing
                              ? "var(--accent-purple)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {followers.toFixed(1)}
                        </span>
                        <div className="flex-1 min-w-10">
                          <RangeBar
                            low={0}
                            high={maxFollowers}
                            last={followers}
                            width="100%"
                          />
                        </div>
                      </div>
                    </td>
                    <td className={TD_BASE} style={TD_BORDER}>
                      <span className="inline-flex flex-wrap gap-1">
                        {(r.leading_tickers || []).slice(0, 6).map((t) => (
                          <Chip key={t} tone="blue">
                            {t}
                          </Chip>
                        ))}
                        {(r.leading_tickers || []).length > 6 && (
                          <span className="num text-xs text-text-muted">
                            +{(r.leading_tickers || []).length - 6}
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Sentiment tab ───────────────────────────────────────── */

function SentimentTab({ defaultTicker }: { defaultTicker: string }) {
  const [tickerOverride, setTickerOverride] = useState<string | null>(null);
  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const ticker = tickerOverride ?? defaultTicker;
  const draft = draftOverride ?? defaultTicker;

  const { data, isLoading, isFetching, isError } = useSentimentTrajectory(
    ticker,
    14,
  );

  const points: SentimentPoint[] = useMemo(() => {
    if (!data || data.ok === false) return [];
    return data.points;
  }, [data]);

  const sentSeries = useMemo(
    () => points.map((p) => p.sentiment_avg ?? 0),
    [points],
  );

  const maxBar = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.bull_count + p.bear_count), 0) || 1,
    [points],
  );

  const lastSent =
    points.length > 0 ? points[points.length - 1].sentiment_avg ?? 0 : 0;

  function applyTicker() {
    const t = draft.trim().toUpperCase();
    if (t) {
      setTickerOverride(t);
      setDraftOverride(t);
    }
  }

  return (
    <div>
      {/* Ticker selector */}
      <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Ticker
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraftOverride(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyTicker();
          }}
          className="num text-sm uppercase w-24 px-2 py-1 text-text-primary"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-control)",
          }}
        />
        <button
          type="button"
          onClick={applyTicker}
          className="text-xs font-medium px-3 py-1 cursor-pointer transition-colors"
          style={{
            color: "var(--accent-blue)",
            background:
              "color-mix(in srgb, var(--accent-blue) 10%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent)",
            borderRadius: "var(--radius-chip)",
          }}
        >
          Load
        </button>
        <span className="ml-auto text-xs text-text-muted">
          14-day daily sentiment + bull/bear split
        </span>
      </div>

      {isError ? (
        <NotReady reason="endpoint_unavailable" />
      ) : data && data.ok === false ? (
        <NotReady reason={data.reason} />
      ) : isLoading || (isFetching && !data) ? (
        <LoadingRows rows={4} />
      ) : points.length === 0 ? (
        <div className="py-6 text-center text-sm text-text-muted">
          No mentions for {ticker} in last 14 days.
        </div>
      ) : (
        <div className="p-3">
          {/* Sparkline header */}
          <div className="flex items-center gap-4 mb-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1">
                {ticker} · sentiment trajectory
              </div>
              <Sparkline
                points={sentSeries}
                width={240}
                height={40}
                color={
                  lastSent >= 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)"
                }
                fill
              />
              <div
                className="num text-sm mt-1 font-semibold"
                style={{ color: changeColor(lastSent) }}
              >
                last: {lastSent.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Stacked bull/bear bars */}
          <div
            className="grid items-end gap-1 h-24 mb-2"
            style={{
              gridTemplateColumns: `repeat(${points.length}, 1fr)`,
            }}
          >
            {points.map((p) => {
              const total = p.bull_count + p.bear_count;
              const totalH = (total / maxBar) * 100;
              const bullH = total > 0 ? (p.bull_count / total) * totalH : 0;
              const bearH = total > 0 ? (p.bear_count / total) * totalH : 0;
              return (
                <div
                  key={p.date}
                  title={`${p.date} · bull ${p.bull_count} · bear ${p.bear_count}`}
                  className="flex flex-col justify-end h-full"
                >
                  <div
                    style={{
                      height: `${bearH}%`,
                      background: "var(--accent-red)",
                      opacity: 0.85,
                      borderRadius: "2px 2px 0 0",
                    }}
                  />
                  <div
                    style={{
                      height: `${bullH}%`,
                      background: "var(--accent-green)",
                      opacity: 0.85,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Date axis labels (sparse) */}
          <div
            className="num grid gap-1 text-xs text-text-muted mb-3"
            style={{
              gridTemplateColumns: `repeat(${points.length}, 1fr)`,
            }}
          >
            {points.map((p, i) => (
              <div key={p.date} className="text-center" title={p.date}>
                {i === 0 ||
                i === points.length - 1 ||
                i === Math.floor(points.length / 2)
                  ? p.date.slice(5)
                  : ""}
              </div>
            ))}
          </div>

          {/* Per-day catalyst strip */}
          <div
            className="pt-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-1.5">
              Daily catalysts
            </div>
            <div className="max-h-40 overflow-auto">
              {points
                .filter(
                  (p) => p.top_catalysts && p.top_catalysts.length > 0,
                )
                .reverse()
                .map((p) => (
                  <div
                    key={p.date}
                    className="grid items-center gap-2 py-1"
                    style={{
                      gridTemplateColumns: "80px 1fr",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span className="num text-xs text-text-secondary">
                      {p.date}
                    </span>
                    <CatalystChips
                      catalysts={p.top_catalysts}
                      max={8}
                    />
                  </div>
                ))}
              {points.every(
                (p) => !p.top_catalysts || p.top_catalysts.length === 0,
              ) && (
                <div className="p-2 text-sm text-text-muted">
                  No catalysts tagged in this window.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Admin analysis tab ──────────────────────────────────── */

const DIR_TONE: Record<AdminCall["direction"], ChipTone> = {
  bull: "green", bear: "red", neutral: "neutral", macro: "blue",
};

function AdminTab({ onTickerClick }: { onTickerClick: (t: string) => void }) {
  const { data, isLoading } = useAdminAnalysis();
  if (isLoading && !data)
    return <div className="p-3 text-sm text-text-muted animate-pulse">loading admin analysis…</div>;
  if (!data?.authors?.length)
    return (
      <div className="p-3 text-sm text-text-muted">
        No admin-analysis digest generated yet.
      </div>
    );
  return (
    <div className="p-2 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-text-muted uppercase tracking-[0.08em] font-semibold">
          Most discussed
        </span>
        {(data.top_tickers ?? []).slice(0, 10).map((t) => (
          <button key={t.ticker} onClick={() => onTickerClick(t.ticker)}>
            <Chip tone={t.bull > t.bear ? "green" : t.bear > t.bull ? "red" : "neutral"}>
              <span className="num">{t.ticker}</span>
              <span className="text-text-muted ml-1">{t.n}</span>
            </Chip>
          </button>
        ))}
        <span className="ml-auto text-text-muted">
          #admin-analysis · last {data.window_days ?? 14}d
          {data.generated_at ? ` · ${relativeAge(data.generated_at)}` : ""}
        </span>
      </div>
      {data.authors.map((a) => (
        <div key={a.author}>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-text-primary">{a.author}</span>
            <span className="text-xs text-text-muted">{a.n_calls} posts</span>
          </div>
          <div className="text-xs text-text-muted mb-1.5">{a.style}</div>
          <div className="space-y-1">
            {a.calls.map((c) => (
              <div
                key={c.msg_id}
                className="flex items-start gap-2 text-xs rounded-md px-2 py-1.5"
                style={{ background: "color-mix(in srgb, var(--bg-card) 60%, transparent)" }}
              >
                <span className="num text-text-muted w-14 shrink-0">{c.ts.slice(5, 10)}</span>
                <Chip tone={DIR_TONE[c.direction] ?? "neutral"}>{c.direction.toUpperCase()}</Chip>
                <span className="flex flex-wrap gap-1 shrink-0">
                  {c.tickers.slice(0, 4).map((t) => (
                    <button
                      key={t}
                      onClick={() => onTickerClick(t)}
                      className="num font-semibold text-accent-blue hover:underline"
                    >
                      {t}
                    </button>
                  ))}
                </span>
                <span className="text-text-secondary min-w-0">
                  {c.thesis}
                  {c.levels && (
                    <span className="text-text-muted"> · {c.levels}</span>
                  )}
                  {c.from_image && (
                    <span className="text-text-muted"> · chart</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── SignalsView shell ───────────────────────────────────── */

export function SignalsView() {
  const [tab, setTab] = useState<SignalsTab>("trending");
  const [windowHours, setWindowHours] = useState<number>(24);
  const [drawerTicker, setDrawerTicker] = useState<string | null>(null);

  const setActiveTicker = useAppStore((s) => s.setActiveTicker);

  // Pull current trending list once at the panel level so the Sentiment tab
  // can default to the hottest ticker without re-querying.
  const { data: trendingData } = useTrending(windowHours, 5);
  const topTrending =
    trendingData && trendingData.ok && trendingData.rows.length > 0
      ? trendingData.rows[0].ticker
      : "";

  function handleTickerClick(t: string) {
    setActiveTicker(t);
    setDrawerTicker(t);
  }

  return (
    <GlassPanel
      title="Signals"
      actions={
        <>
          <span className="text-xs text-text-muted max-md:hidden">
            mentions · catalysts · first-callers
          </span>
          <Segmented<SignalsTab>
            options={[
              {
                value: "trending",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Flame size={12} />
                    Trending
                  </span>
                ),
              },
              {
                value: "leaders",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Award size={12} />
                    Leaders
                  </span>
                ),
              },
              {
                value: "sentiment",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <BarChart3 size={12} />
                    Sentiment
                  </span>
                ),
              },
              {
                value: "admin",
                label: (
                  <span className="inline-flex items-center gap-1">
                    <ShieldCheck size={12} />
                    Admin
                  </span>
                ),
              },
            ]}
            value={tab}
            onChange={setTab}
          />
        </>
      }
    >
      {/* Tab body */}
      <div>
        {tab === "trending" && (
          <>
            <TrendingTab
              windowHours={windowHours}
              onWindow={setWindowHours}
              onTickerClick={handleTickerClick}
            />
            {drawerTicker && (
              <TickerDrawer
                ticker={drawerTicker}
                onClose={() => setDrawerTicker(null)}
              />
            )}
          </>
        )}
        {tab === "leaders" && <LeadersTab />}
        {tab === "sentiment" && (
          <SentimentTab defaultTicker={topTrending || "NVDA"} />
        )}
        {tab === "admin" && <AdminTab onTickerClick={handleTickerClick} />}
      </div>
    </GlassPanel>
  );
}
