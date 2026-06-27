/**
 * One row in the "Positions" list on the Trader Leaderboard page.
 *
 * A POSITION = all messages from one trader keyed on
 * (ticker, strike, opt_type, expiry). Each follow-up trim/add/close lives in
 * `position.events` chronologically. Collapsed view is a one-liner with the
 * entry, status chip, n-events badge, and P/L; click to expand into a vertical
 * event timeline.
 *
 * Visually consistent with `TraderCallRow`: same `text-sm py-2 px-3` row idiom,
 * same DTE chip from `iflow/utils.ts::dteTag`, same CSS-var colors. The
 * difference is that THIS row aggregates events instead of representing one.
 */
import { useMemo, useState } from "react";

import { dteTag } from "../flow-analyzer/iflow/utils";
import { Tag } from "../../components/CCPrimitives";
import {
  absoluteAge,
  changeColor,
  formatPercentRaw,
  relativeAge,
} from "../../lib/utils";
import type { AlertPosition, AlertPositionEvent } from "../../lib/types";

/* ── Helpers ──────────────────────────────────────────────── */

export interface PositionKeyParts {
  ticker: string | null;
  strike: number | null;
  opt_type: string | null;
  expiry: string | null;
}

/** Stable string key for `(ticker, strike, opt_type, expiry)`. */
export function positionKeyString(p: PositionKeyParts): string {
  return [
    p.ticker ?? "",
    p.strike != null ? String(p.strike) : "",
    p.opt_type ?? "",
    p.expiry ?? "",
  ].join("|");
}

/** Map a position status to a chip {label, color, bg}. */
function statusChip(status: string): {
  label: string;
  color: string;
  bg: string;
} {
  const s = (status || "").toLowerCase();
  if (s === "open")
    return {
      label: "OPEN",
      color: "var(--accent-green)",
      bg: "color-mix(in srgb, var(--accent-green) 12%, transparent)",
    };
  if (s === "partial")
    return {
      label: "PARTIAL",
      color: "var(--accent-orange)",
      bg: "color-mix(in srgb, var(--accent-orange) 12%, transparent)",
    };
  if (s === "closed")
    return {
      label: "CLOSED",
      color: "var(--accent-red)",
      bg: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
    };
  if (s === "stopped")
    return {
      label: "STOPPED",
      color: "var(--accent-red)",
      bg: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
    };
  if (s === "runner")
    return {
      label: "RUNNER",
      color: "var(--accent-cyan)",
      bg: "color-mix(in srgb, var(--accent-cyan) 12%, transparent)",
    };
  return {
    label: (status || "—").toUpperCase(),
    color: "var(--text-muted)",
    bg: "color-mix(in srgb, var(--text-muted) 10%, transparent)",
  };
}

/** Per-event-type pill in the expanded timeline. */
function eventTypeChip(t: string | null | undefined): {
  label: string;
  color: string;
} {
  const e = (t || "").toLowerCase();
  if (e === "open")
    return { label: "OPEN", color: "var(--accent-green)" };
  if (e === "add")
    return { label: "ADD", color: "var(--accent-blue)" };
  if (e === "trim")
    return { label: "TRIM", color: "var(--accent-orange)" };
  if (e === "close")
    return { label: "CLOSE", color: "var(--accent-red)" };
  if (e === "stop")
    return { label: "STOP", color: "var(--accent-red)" };
  if (e === "status")
    return { label: "STATUS", color: "var(--text-secondary)" };
  if (e === "recap")
    return { label: "RECAP", color: "var(--text-secondary)" };
  return { label: (t || "EVENT").toUpperCase(), color: "var(--text-muted)" };
}

/** First open/add event = where the trader entered. */
function firstEntryEvent(
  events: AlertPositionEvent[],
): AlertPositionEvent | null {
  for (const e of events) {
    const t = (e.event_type || "").toLowerCase();
    if (t === "open" || t === "add") return e;
  }
  return events[0] ?? null;
}

/**
 * Days-to-expiry from an MM/DD or MM/DD/YY or YYYY-MM-DD string.
 * Mirrors the same parser used by TraderCallRow so the DTE chip is
 * computed identically across the two views.
 */
function computeDte(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const e = String(expiry).trim();
  let exp: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    const [y, m, d] = e.split("-").map(Number);
    exp = new Date(y, m - 1, d);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(e)) {
    const [m, d, y] = e.split("/").map(Number);
    const yyyy = y < 100 ? 2000 + y : y;
    exp = new Date(yyyy, m - 1, d);
  } else if (/^\d{1,2}\/\d{1,2}$/.test(e)) {
    const [m, d] = e.split("/").map(Number);
    const today = new Date();
    let yyyy = today.getFullYear();
    let candidate = new Date(yyyy, m - 1, d);
    const diffDays =
      (candidate.getTime() - today.getTime()) / 86400000;
    if (diffDays < -30) {
      yyyy += 1;
      candidate = new Date(yyyy, m - 1, d);
    }
    exp = candidate;
  }
  if (!exp || Number.isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

/** Render an ISO ts as `M/D` (no zero pad, no year) for the inline opened-on tag. */
function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Safe-parse a sizing JSON string into a string[]. */
function parseSizing(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  } catch {
    /* fall through */
  }
  return [];
}

/* ── Component ────────────────────────────────────────────── */

interface TraderPositionRowProps {
  position: AlertPosition;
  expanded: boolean;
  activeTicker?: string;
  onToggle: (key: string) => void;
  onTickerClick?: (ticker: string) => void;
}

export function TraderPositionRow({
  position,
  expanded,
  activeTicker,
  onToggle,
  onTickerClick,
}: TraderPositionRowProps) {
  const [showMessages, setShowMessages] = useState(false);

  const pk = position.position_key;
  const key = positionKeyString(pk);
  const status = statusChip(position.status);

  const entry = useMemo(() => firstEntryEvent(position.events), [position.events]);
  const lastEvent = position.events[position.events.length - 1] ?? null;

  // How many events on this position happened today (local timezone)?
  const todayPrefix = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const todayEventCount = useMemo(
    () =>
      position.events.filter((ev) => (ev.ts || "").startsWith(todayPrefix)).length,
    [position.events, todayPrefix],
  );
  const todayEvents = useMemo(
    () => position.events.filter((ev) => (ev.ts || "").startsWith(todayPrefix)),
    [position.events, todayPrefix],
  );
  const lastTodayEvent = todayEvents[todayEvents.length - 1] ?? null;

  const dte = useMemo(() => computeDte(pk.expiry), [pk.expiry]);
  const dl = dteTag(dte);

  const realized = position.cumulative_exit_pct;
  const unrealized = position.current_pl_pct;
  const isClosed =
    position.status === "closed" || position.status === "stopped";
  const hasRealized = realized != null;

  // Headline P/L: realized when closed/partial, else unrealized.
  const pnlValue: number | null = (() => {
    if (isClosed) return realized ?? unrealized ?? null;
    if (position.status === "partial" && hasRealized) return realized;
    return unrealized ?? realized ?? null;
  })();
  const pnlColor =
    pnlValue != null ? changeColor(pnlValue) : "var(--text-muted)";
  const pnlLabel =
    pnlValue != null ? formatPercentRaw(pnlValue, 1) : "—";
  const pnlTitle = isClosed
    ? "Realized cumulative exit"
    : position.status === "partial"
      ? "Realized so far (position partially trimmed)"
      : "Current unrealized P/L";

  const ticker = pk.ticker;
  const tickerHi = ticker && ticker === activeTicker;

  const strike = pk.strike;
  const optType = (pk.opt_type || "").toUpperCase();
  const hasStrike = strike != null;

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Main row — clickable */}
      <div
        className="text-sm py-2 px-3 hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => onToggle(key)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Latest-activity date — leftmost so the eye sees recency at a glance.
            Falls back to opened date when there are no subsequent events. The
            tooltip carries the full open→last context so we don't lose history. */}
        {(() => {
          const openTs =
            position.opened_at ||
            (position.events[0] ? position.events[0].ts : null);
          const latestTs = lastEvent?.ts || openTs;
          if (!latestTs) return null;
          const isToday = (latestTs || "").startsWith(todayPrefix);
          const sameAsOpen = !openTs || shortDate(openTs) === shortDate(latestTs);
          const title = sameAsOpen
            ? `entered ${absoluteAge(latestTs) || ""} (${relativeAge(latestTs)})`
            : `last activity ${absoluteAge(latestTs) || ""} (${relativeAge(latestTs)}) · opened ${shortDate(openTs)} (${relativeAge(openTs)})`;
          return (
            <span
              className="font-mono shrink-0"
              style={{
                fontSize: 15,
                color: isToday ? "var(--accent-orange)" : "var(--text-primary)",
                fontWeight: isToday ? 700 : 600,
                minWidth: 48,
              }}
              title={title}
            >
              {shortDate(latestTs)}
            </span>
          );
        })()}

        {/* Status chip */}
        <span
          className="font-mono font-bold shrink-0"
          style={{
            color: status.color,
            background: status.bg,
            padding: "2px 7px",
            borderRadius: 3,
            fontSize: 12,
            letterSpacing: 0.7,
            border: `1px solid ${status.color}`,
            minWidth: 60,
            textAlign: "center",
          }}
          title={`status: ${status.label.toLowerCase()}`}
        >
          {status.label}
        </span>

        {/* Ticker */}
        {ticker ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTickerClick?.(ticker);
            }}
            className="font-mono font-bold shrink-0"
            style={{
              fontSize: 15,
              color: tickerHi
                ? "var(--accent-blue)"
                : "var(--text-primary)",
              background: tickerHi
                ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                : "transparent",
              border: "none",
              padding: tickerHi ? "1px 6px" : 0,
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {ticker}
          </button>
        ) : (
          <span
            className="font-mono shrink-0"
            style={{ fontSize: 15, color: "var(--text-muted)" }}
          >
            —
          </span>
        )}

        {/* Strike + opt type, or SHARES fallback */}
        <span
          className="font-mono font-bold shrink-0"
          style={{ color: "var(--text-primary)" }}
        >
          {hasStrike ? (
            <>
              ${strike}
              {optType ? ` ${optType}` : ""}
            </>
          ) : (
            "SHARES"
          )}
        </span>

        {/* Expiry */}
        {pk.expiry && (
          <span
            className="font-mono text-text-muted shrink-0"
            style={{ fontSize: 14 }}
          >
            {pk.expiry}
          </span>
        )}

        {/* DTE chip */}
        {dl && (
          <span
            className="font-mono shrink-0"
            style={{
              color: dl.color,
              background: dl.bg,
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 12,
              letterSpacing: 0.6,
              fontWeight: 600,
            }}
          >
            {dl.text}
            <span style={{ marginLeft: 4, opacity: 0.85 }}>
              {dte != null ? `${dte}d` : ""}
            </span>
          </span>
        )}


        {/* Entry premium */}
        {entry?.premium != null && (
          <span
            className="font-mono text-text-secondary shrink-0"
            style={{ fontSize: 14 }}
            title="Entry premium (first open/add)"
          >
            @{Number(entry.premium).toFixed(2)}
          </span>
        )}

        {/* Entry underlying */}
        {entry?.entry_underlying != null && (
          <span
            className="font-mono text-text-muted shrink-0"
            style={{ fontSize: 14 }}
            title="Underlying at entry"
          >
            und {Number(entry.entry_underlying).toFixed(2)}
          </span>
        )}

        {/* n_events badge — only when >1, otherwise noisy. */}
        {position.n_events > 1 && (
          <Tag
            color="var(--accent-purple)"
            border="var(--accent-purple)"
            bg="rgba(0,0,0,0)"
          >
            +{position.n_events} events
          </Tag>
        )}

        {/* "Today" pulse — visible when any events landed today (local TZ).
            Tells the user the position was active TODAY without expanding. */}
        {todayEventCount > 0 && (
          <Tag
            color="var(--accent-orange)"
            border="var(--accent-orange)"
            bg="color-mix(in srgb, var(--accent-orange) 10%, transparent)"
          >
            <span title={
              lastTodayEvent
                ? `${todayEventCount} event${todayEventCount === 1 ? "" : "s"} today, latest at ${new Date(lastTodayEvent.ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`
                : `${todayEventCount} events today`
            }>
              {todayEventCount} TODAY
            </span>
          </Tag>
        )}

        {/* P/L block — right aligned. When partial+closed we render two
            numbers (realized in headline color; unrealized struck through). */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "baseline",
            gap: 6,
          }}
        >
          {/* Strikethrough unrealized when fully closed — the live mark is no longer meaningful. */}
          {isClosed && unrealized != null && hasRealized && (
            <span
              className="font-mono"
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                textDecoration: "line-through",
                opacity: 0.65,
              }}
              title="Last unrealized mark before close"
            >
              {formatPercentRaw(unrealized, 1)}
            </span>
          )}
          <span
            className="font-mono font-bold shrink-0"
            style={{
              color: pnlColor,
              minWidth: 56,
              textAlign: "right",
              fontSize: 15,
            }}
            title={pnlTitle}
          >
            {pnlLabel}
          </span>
        </div>
      </div>

      {/* Expanded — event timeline + optional raw messages */}
      {expanded && (
        <div
          className="text-xs"
          style={{
            padding: "8px 12px 12px 56px",
            background: "color-mix(in srgb, var(--bg-card) 50%, transparent)",
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted)",
              fontWeight: 600,
            }}
          >
            Timeline ({position.events.length})
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {position.events.map((ev) => {
              const chip = eventTypeChip(ev.event_type);
              const sizing = parseSizing(ev.sizing);
              return (
                <div
                  key={`${ev.alert_id}-${ev.ts}`}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: 8,
                    paddingBottom: 4,
                    borderBottom: "1px dotted var(--border)",
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      color: chip.color,
                      fontWeight: 700,
                      minWidth: 50,
                      fontSize: 13,
                      letterSpacing: 0.5,
                    }}
                  >
                    {chip.label}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                    title={absoluteAge(ev.ts) || ""}
                  >
                    {shortDate(ev.ts)}
                  </span>

                  {ev.exit_pct != null && (
                    <span
                      className="font-mono"
                      style={{
                        color: changeColor(ev.exit_pct),
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {ev.exit_pct >= 0 ? "+" : ""}
                      {ev.exit_pct}%
                    </span>
                  )}

                  {ev.premium != null && (
                    <span
                      className="font-mono"
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: 13,
                      }}
                      title="premium"
                    >
                      @{Number(ev.premium).toFixed(2)}
                    </span>
                  )}

                  {ev.entry_underlying != null && (
                    <span
                      className="font-mono"
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 13,
                      }}
                      title="underlying at event"
                    >
                      und {Number(ev.entry_underlying).toFixed(2)}
                    </span>
                  )}

                  {ev.pl_underlying != null && (
                    <span
                      className="font-mono"
                      style={{
                        color: changeColor(ev.pl_underlying),
                        fontSize: 13,
                      }}
                      title="underlying P/L since entry"
                    >
                      pl {formatPercentRaw(ev.pl_underlying, 2)}
                    </span>
                  )}

                  {sizing.length > 0 && (
                    <span
                      className="font-mono"
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 12,
                        letterSpacing: 0.5,
                      }}
                    >
                      [{sizing.join(", ")}]
                    </span>
                  )}

                  {ev.rationale && (
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontStyle: "italic",
                        fontSize: 14,
                        flexBasis: "100%",
                        marginLeft: 58,
                      }}
                    >
                      {ev.rationale}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Toggle the raw discord message of every event. Kept opt-in so the
              timeline stays scannable. */}
          {position.events.some((e) => e.content) && (
            <button
              type="button"
              onClick={() => setShowMessages((s) => !s)}
              className="font-mono"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                fontSize: 12,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 3,
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              {showMessages
                ? "Hide messages"
                : `Show messages (${position.events.filter((e) => e.content).length})`}
            </button>
          )}

          {showMessages && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              {position.events
                .filter((e) => e.content)
                .map((ev) => (
                  <div
                    key={`msg-${ev.alert_id}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      className="font-mono"
                      style={{
                        fontSize: 12,
                        color: "var(--text-muted)",
                        letterSpacing: 0.4,
                      }}
                    >
                      {shortDate(ev.ts)} ·{" "}
                      {(ev.event_type || "event").toUpperCase()}
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: 14,
                        color: "var(--text-secondary)",
                        background: "color-mix(in srgb, var(--bg-card-hover) 50%, transparent)",
                        padding: 8,
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                        maxHeight: 220,
                        overflow: "auto",
                      }}
                    >
                      {ev.content}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Footer: opened/last-update timestamps */}
          <div
            className="font-mono"
            style={{ fontSize: 13, color: "var(--text-muted)" }}
          >
            {position.opened_at && (
              <span title={absoluteAge(position.opened_at) || ""}>
                opened {relativeAge(position.opened_at)}
              </span>
            )}
            {lastEvent && (
              <span
                style={{ marginLeft: 8 }}
                title={absoluteAge(lastEvent.ts) || ""}
              >
                · last {relativeAge(lastEvent.ts)}
              </span>
            )}
            {hasRealized && (
              <span style={{ marginLeft: 8 }}>
                · realized {formatPercentRaw(realized!, 1)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TraderPositionRow;
