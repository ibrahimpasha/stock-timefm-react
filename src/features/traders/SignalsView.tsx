/**
 * SignalsView — Trending / Leaders / Sentiment panel that sits above the
 * existing trader leaderboard on `/traders`.
 *
 * Three tabs, all driven by the new `/api/alerts/*` endpoints landing from
 * Agents A (text analysis) and B (LLM extractor). All endpoints can return
 * `{ ok: false, reason: 'alerts_db_not_ready' }` until populated — each tab
 * renders a clean empty state when that happens.
 */
import { useEffect, useMemo, useState } from "react";
import { TrendingUp, Flame, Award, BarChart3, X } from "lucide-react";

import {
  useTrending,
  useFirstMentionLeaderboard,
  useSentimentTrajectory,
  useAlertsByTicker,
} from "../../api/alerts";
import { useAppStore } from "../../store/useAppStore";
import { Panel, Sparkline, RangeBar, Tag } from "../../components/CCPrimitives";
import {
  DIRECTION_COLORS,
  catalystTagColor,
} from "../../lib/constants";
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

type SignalsTab = "trending" | "leaders" | "sentiment";

const TAB_LABELS: Record<SignalsTab, string> = {
  trending: "Trending",
  leaders: "Leaders",
  sentiment: "Sentiment",
};

const TAB_ICONS: Record<SignalsTab, React.ComponentType<{ size?: number }>> = {
  trending: Flame,
  leaders: Award,
  sentiment: BarChart3,
};

const WINDOW_OPTIONS: { hours: number; label: string }[] = [
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" },
  { hours: 24 * 7, label: "7d" },
];

/** Pick a chip color for a numeric sentiment score in [-1, 1]. */
function sentimentColor(s: number | null | undefined): string {
  if (s == null) return DIRECTION_COLORS.NEUTRAL;
  if (s >= 0.15) return DIRECTION_COLORS.BULL;
  if (s <= -0.15) return DIRECTION_COLORS.BEAR;
  return DIRECTION_COLORS.NEUTRAL;
}

function sentimentLabel(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s >= 0.15) return "BULL";
  if (s <= -0.15) return "BEAR";
  return "NEUTRAL";
}

/* ── Shared empty / loading bits ─────────────────────────── */

function NotReady({ reason }: { reason: string }) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 14,
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          marginBottom: 6,
          color: "var(--text-secondary)",
        }}
      >
        Pipeline not ready
      </div>
      <div>
        Backend returned <code>{reason}</code>. The annotation pipeline still
        needs to populate <code>alert_annotations</code> /{" "}
        <code>ticker_mentions</code> / <code>llm_trade_calls</code>. This panel
        will refresh automatically once data lands.
      </div>
    </div>
  );
}

function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" style={{ padding: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            height: 38,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
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
    <span
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 4,
        alignItems: "center",
      }}
    >
      {shown.map((c) => {
        const color = catalystTagColor(c);
        return (
          <Tag key={c} color={color} border={color} bg="rgba(0,0,0,0)">
            {c}
          </Tag>
        );
      })}
      {extra > 0 && (
        <span
          className="font-mono"
          style={{ fontSize: 10, color: "var(--text-muted)" }}
        >
          +{extra}
        </span>
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
  const color =
    u === "HIGH"
      ? "var(--accent-green)"
      : u === "MEDIUM" || u === "MED"
        ? "var(--accent-orange)"
        : u === "LOTTO" || u === "LOW"
          ? "var(--accent-red)"
          : "var(--text-secondary)";
  return (
    <Tag color={color} border={color} bg="rgba(0,0,0,0)">
      {u}
    </Tag>
  );
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg-card-hover) 40%, transparent)",
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          Window
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {WINDOW_OPTIONS.map((o) => {
            const active = o.hours === windowHours;
            return (
              <button
                key={o.hours}
                type="button"
                onClick={() => onWindow(o.hours)}
                className="font-mono"
                style={{
                  padding: "4px 10px",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active
                    ? "var(--accent-blue)"
                    : "var(--text-secondary)",
                  background: active
                    ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                    : "transparent",
                  border: active
                    ? "1px solid var(--accent-blue)"
                    : "1px solid var(--border)",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--text-muted)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
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
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No mentions in this window.
        </div>
      ) : (
        <div style={{ overflow: "auto", maxHeight: 360 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                {[
                  "Ticker",
                  "Mentions",
                  "Authors",
                  "Score",
                  "Sentiment",
                  "Catalysts",
                  "First by",
                ].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      padding: "6px 10px",
                      textAlign: i >= 1 && i <= 3 ? "right" : "left",
                      fontSize: 11,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      fontFamily:
                        "var(--font-mono, ui-monospace, monospace)",
                      borderBottom: "1px solid var(--border)",
                      background: "color-mix(in srgb, var(--bg-card-hover) 40%, transparent)",
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const scorePct = Math.round(
                  ((r.trending_score || 0) / maxScore) * 100,
                );
                return (
                  <tr key={r.ticker}>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onTickerClick(r.ticker)}
                        className="font-mono"
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--accent-blue)",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                      >
                        {r.ticker}
                      </button>
                    </td>
                    <td
                      className="font-mono"
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {r.n_mentions}
                    </td>
                    <td
                      className="font-mono"
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {r.n_unique_authors}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                        minWidth: 90,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            minWidth: 28,
                            textAlign: "right",
                          }}
                        >
                          {(r.trending_score || 0).toFixed(1)}
                        </span>
                        <div style={{ flex: 1, minWidth: 40 }}>
                          <RangeBar
                            low={0}
                            high={100}
                            last={scorePct}
                            width="100%"
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <Tag
                        color={sentimentColor(r.sentiment_avg)}
                        border={sentimentColor(r.sentiment_avg)}
                        bg="rgba(0,0,0,0)"
                      >
                        {sentimentLabel(r.sentiment_avg)}
                        {r.sentiment_avg != null && (
                          <span
                            style={{ marginLeft: 4, opacity: 0.8 }}
                          >
                            {r.sentiment_avg.toFixed(2)}
                          </span>
                        )}
                      </Tag>
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <CatalystChips catalysts={r.catalysts_top} max={3} />
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                        fontSize: 11,
                      }}
                    >
                      <div
                        className="font-mono"
                        style={{
                          color: "var(--text-primary)",
                          maxWidth: 120,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={r.first_mention_author || ""}
                      >
                        {r.first_mention_author || "—"}
                      </div>
                      {r.first_mention_ts && (
                        <div
                          className="font-mono"
                          style={{
                            fontSize: 10,
                            color: "var(--text-muted)",
                          }}
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
        <div
          style={{
            padding: 16,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No recent calls on {ticker}.
        </div>
      );
    } else {
      body = (
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          {ok.calls.map((c: AlertCallRow) => (
            <div
              key={c.call_id ?? c.alert_id}
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr auto",
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <div
                className="font-mono"
                style={{
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={c.author || ""}
              >
                {c.author || "—"}
              </div>
              <div
                style={{
                  color: "var(--text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.channel_name || ""}
                <span
                  className="font-mono"
                  style={{
                    marginLeft: 6,
                    color: "var(--text-muted)",
                    fontSize: 10,
                  }}
                  title={absoluteAge(c.ts) || ""}
                >
                  {relativeAge(c.ts)}
                </span>
              </div>
              <div className="font-mono" style={{ textAlign: "right" }}>
                {c.est_pl_pct != null || c.realized_pct != null ? (
                  <span
                    style={{
                      color: changeColor(
                        c.realized_pct ?? c.est_pl_pct ?? 0,
                      ),
                      fontWeight: c.is_realized ? 700 : 500,
                      fontStyle: c.is_realized ? "normal" : "italic",
                    }}
                  >
                    {formatPercentRaw(
                      c.realized_pct ?? c.est_pl_pct ?? 0,
                      1,
                    )}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg-card-hover) 60%, transparent)",
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--text-primary)",
            fontWeight: 600,
          }}
        >
          {ticker} · mention history
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drawer"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 2,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <X size={14} />
        </button>
      </div>
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg-card-hover) 40%, transparent)",
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          Lookback
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 14, 30].map((d) => {
            const active = d === days;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className="font-mono"
                style={{
                  padding: "4px 10px",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active
                    ? "var(--accent-blue)"
                    : "var(--text-secondary)",
                  background: active
                    ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                    : "transparent",
                  border: active
                    ? "1px solid var(--accent-blue)"
                    : "1px solid var(--border)",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {d}d
              </button>
            );
          })}
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          first-callers whose picks were followed by ≥2 others within 24h
        </span>
      </div>

      {isError ? (
        <NotReady reason="endpoint_unavailable" />
      ) : data && data.ok === false ? (
        <NotReady reason={data.reason} />
      ) : isLoading || (isFetching && !data) ? (
        <LoadingRows rows={5} />
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No first-mention activity in window.
        </div>
      ) : (
        <div style={{ overflow: "auto", maxHeight: 360 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                {["Author", "First calls", "Avg followers / 24h", "Leading tickers"].map(
                  (h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 10px",
                        textAlign: i === 1 ? "right" : "left",
                        fontSize: 11,
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        fontWeight: 600,
                        fontFamily:
                          "var(--font-mono, ui-monospace, monospace)",
                        borderBottom: "1px solid var(--border)",
                        background: "color-mix(in srgb, var(--bg-card-hover) 40%, transparent)",
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const followers = r.n_followers_within_24h_avg ?? 0;
                const influencing = followers > 1;
                return (
                  <tr
                    key={r.author}
                    style={{
                      background: influencing
                        ? "color-mix(in srgb, var(--accent-purple) 6%, transparent)"
                        : "transparent",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div
                        className="font-mono"
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: influencing ? 700 : 500,
                          fontSize: 14,
                        }}
                        title={r.author}
                      >
                        {r.author}
                        {influencing && (
                          <span
                            style={{
                              marginLeft: 6,
                              color: "var(--accent-purple)",
                              fontSize: 10,
                            }}
                          >
                            ●
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className="font-mono"
                      style={{
                        padding: "8px 10px",
                        textAlign: "right",
                        color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {r.n_first_mentions}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                        minWidth: 140,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 11,
                            color: influencing
                              ? "var(--accent-purple)"
                              : "var(--text-secondary)",
                            minWidth: 32,
                            textAlign: "right",
                          }}
                        >
                          {followers.toFixed(1)}
                        </span>
                        <div style={{ flex: 1, minWidth: 40 }}>
                          <RangeBar
                            low={0}
                            high={maxFollowers}
                            last={followers}
                            width="100%"
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          flexWrap: "wrap",
                          gap: 4,
                        }}
                      >
                        {(r.leading_tickers || []).slice(0, 6).map((t) => (
                          <Tag
                            key={t}
                            color="var(--accent-blue)"
                            border="var(--accent-blue)"
                            bg="rgba(0,0,0,0)"
                          >
                            {t}
                          </Tag>
                        ))}
                        {(r.leading_tickers || []).length > 6 && (
                          <span
                            className="font-mono"
                            style={{
                              fontSize: 10,
                              color: "var(--text-muted)",
                            }}
                          >
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
  const [ticker, setTicker] = useState<string>(defaultTicker);
  const [draft, setDraft] = useState<string>(defaultTicker);

  // Keep the input in sync when caller's default changes (e.g., new trending
  // top ticker arrived while user hadn't typed anything yet).
  useEffect(() => {
    setTicker(defaultTicker);
    setDraft(defaultTicker);
  }, [defaultTicker]);

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
    if (t) setTicker(t);
  }

  return (
    <div>
      {/* Ticker selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg-card-hover) 40%, transparent)",
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          Ticker
        </span>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyTicker();
          }}
          className="font-mono"
          style={{
            background: "var(--bg-primary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            fontSize: 14,
            padding: "4px 8px",
            borderRadius: 3,
            width: 100,
            textTransform: "uppercase",
          }}
        />
        <button
          type="button"
          onClick={applyTicker}
          className="font-mono"
          style={{
            padding: "4px 12px",
            fontSize: 13,
            color: "var(--accent-blue)",
            background: "color-mix(in srgb, var(--accent-blue) 10%, transparent)",
            border: "1px solid var(--accent-blue)",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Load
        </button>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
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
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No mentions for {ticker} in last 14 days.
        </div>
      ) : (
        <div style={{ padding: 12 }}>
          {/* Sparkline header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 12,
            }}
          >
            <div>
              <div
                className="font-mono"
                style={{
                  fontSize: 12,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
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
                className="font-mono"
                style={{
                  fontSize: 13,
                  marginTop: 4,
                  color: changeColor(lastSent),
                  fontWeight: 600,
                }}
              >
                last: {lastSent.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Stacked bull/bear bars */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${points.length}, 1fr)`,
              gap: 4,
              alignItems: "end",
              height: 100,
              marginBottom: 8,
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
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    height: "100%",
                  }}
                >
                  <div
                    style={{
                      height: `${bearH}%`,
                      background: "var(--accent-red)",
                      opacity: 0.85,
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
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${points.length}, 1fr)`,
              gap: 4,
              fontSize: 9,
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              marginBottom: 12,
            }}
          >
            {points.map((p, i) => (
              <div
                key={p.date}
                style={{ textAlign: "center" }}
                title={p.date}
              >
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
            style={{
              borderTop: "1px solid var(--border)",
              paddingTop: 8,
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: 12,
                letterSpacing: 1.2,
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Daily catalysts
            </div>
            <div style={{ maxHeight: 160, overflow: "auto" }}>
              {points
                .filter(
                  (p) => p.top_catalysts && p.top_catalysts.length > 0,
                )
                .reverse()
                .map((p) => (
                  <div
                    key={p.date}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr",
                      gap: 8,
                      padding: "5px 0",
                      borderBottom: "1px solid var(--border)",
                      alignItems: "center",
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
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
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 13,
                    padding: 8,
                  }}
                >
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

  const tabs: SignalsTab[] = ["trending", "leaders", "sentiment"];

  return (
    <Panel
      title="Signals"
      accent="var(--accent-orange)"
      padding={0}
      right={
        <span
          className="font-mono"
          style={{ fontSize: 13, color: "var(--text-secondary)" }}
        >
          mentions · catalysts · first-callers
        </span>
      }
    >
      {/* Tab bar */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {tabs.map((t) => {
          const Icon = TAB_ICONS[t];
          const active = tab === t;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t)}
              className="font-mono"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                letterSpacing: 1,
                textTransform: "uppercase",
                fontWeight: active ? 700 : 500,
                color: active
                  ? "var(--accent-orange)"
                  : "var(--text-secondary)",
                background: active
                  ? "color-mix(in srgb, var(--accent-orange) 8%, transparent)"
                  : "transparent",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--accent-orange)"
                  : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              <Icon size={14} />
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

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
              <div style={{ padding: "0 10px 10px 10px" }}>
                <TickerDrawer
                  ticker={drawerTicker}
                  onClose={() => setDrawerTicker(null)}
                />
              </div>
            )}
          </>
        )}
        {tab === "leaders" && <LeadersTab />}
        {tab === "sentiment" && (
          <SentimentTab defaultTicker={topTrending || "NVDA"} />
        )}
      </div>
    </Panel>
  );
}
