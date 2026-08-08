/**
 * One row in the "Positions" list on the Trader Leaderboard page.
 *
 * A POSITION = all messages from one trader keyed on
 * (ticker, strike, opt_type, expiry). Each follow-up trim/add/close lives in
 * `position.events` chronologically. Collapsed view is a one-liner with the
 * entry, status chip, n-events badge, and P/L; click to expand into a vertical
 * event timeline.
 *
 * Glass remodel: status/outcome + event-type pills are `Chip` primitives
 * (green closed-profit, red stopped/closed-loss, yellow partial), all numeric
 * data carries the `num` class, and the expanded timeline reads as a quiet
 * sub-layer of the row. Behavior and data flow are unchanged.
 */
import { useId, useMemo, useState } from "react";

import { dteTag } from "../flow-analyzer/iflow/utils";
import { Chip, type ChipTone } from "../../components/Glass";
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

/**
 * Map a position status to a Chip {label, tone}.
 * Outcome tones: CLOSED = green when the realized P/L is a profit, red when a
 * loss; STOPPED = red; PARTIAL = yellow. OPEN reads blue (live/interactive),
 * RUNNER cyan.
 */
function statusChip(
  status: string,
  realizedPct: number | null,
): { label: string; tone: ChipTone } {
  const s = (status || "").toLowerCase();
  if (s === "open") return { label: "OPEN", tone: "blue" };
  if (s === "partial") return { label: "PARTIAL", tone: "yellow" };
  if (s === "closed")
    return {
      label: "CLOSED",
      tone: realizedPct != null && realizedPct > 0 ? "green" : "red",
    };
  if (s === "stopped") return { label: "STOPPED", tone: "red" };
  if (s === "runner") return { label: "RUNNER", tone: "cyan" };
  return { label: (status || "—").toUpperCase(), tone: "neutral" };
}

/** Per-event-type Chip tone in the expanded timeline. */
function eventTypeChip(t: string | null | undefined): {
  label: string;
  tone: ChipTone;
} {
  const e = (t || "").toLowerCase();
  if (e === "open") return { label: "OPEN", tone: "green" };
  if (e === "add") return { label: "ADD", tone: "blue" };
  if (e === "trim") return { label: "TRIM", tone: "orange" };
  if (e === "close") return { label: "CLOSE", tone: "red" };
  if (e === "stop") return { label: "STOP", tone: "red" };
  if (e === "status") return { label: "STATUS", tone: "neutral" };
  if (e === "recap") return { label: "RECAP", tone: "neutral" };
  return { label: (t || "EVENT").toUpperCase(), tone: "neutral" };
}

/** DTE bucket → Chip tone (mirrors the iflow color language). */
function dteTone(text: string): ChipTone {
  if (text === "LOTTO") return "orange";
  if (text === "SWING") return "blue";
  if (text === "LEAP") return "cyan";
  return "neutral";
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
  const detailsId = useId();
  const messagesId = useId();

  const pk = position.position_key;
  const key = positionKeyString(pk);

  const entry = useMemo(() => firstEntryEvent(position.events), [position.events]);
  const lastEvent = position.events[position.events.length - 1] ?? null;

  // How many events on this position happened today (local timezone)?
  // Event ts strings are UTC ISO ("...T20:02:25+00:00") — parse and compare
  // local calendar days; a raw string-prefix match against the local date
  // mislabels evening events in both directions.
  const todayEvents = useMemo(
    () =>
      position.events.filter(
        (ev) =>
          !!ev.ts &&
          new Date(ev.ts).toDateString() === new Date().toDateString(),
      ),
    [position.events],
  );
  const todayEventCount = todayEvents.length;
  const lastTodayEvent = todayEvents[todayEvents.length - 1] ?? null;

  const dte = useMemo(() => computeDte(pk.expiry), [pk.expiry]);
  const dl = dteTag(dte);

  // Max stated exit = the play's real run; sum double-counts trims.
  const realized = position.max_exit_pct ?? position.cumulative_exit_pct;
  const unrealized = position.current_pl_pct;
  const isClosed =
    position.status === "closed" || position.status === "stopped";
  const hasRealized = realized != null;

  const status = statusChip(position.status, realized ?? unrealized ?? null);

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
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Main row — clickable */}
      <div
        className="text-sm py-2 px-3 hover:bg-bg-card-hover transition-colors cursor-pointer flex items-center gap-2.5 flex-wrap"
        onClick={() => onToggle(key)}
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
          const isToday =
            new Date(latestTs).toDateString() === new Date().toDateString();
          const sameAsOpen = !openTs || shortDate(openTs) === shortDate(latestTs);
          const title = sameAsOpen
            ? `entered ${absoluteAge(latestTs) || ""} (${relativeAge(latestTs)})`
            : `last activity ${absoluteAge(latestTs) || ""} (${relativeAge(latestTs)}) · opened ${shortDate(openTs)} (${relativeAge(openTs)})`;
          return (
            <span
              className={`num shrink-0 text-sm min-w-12 ${
                isToday ? "font-bold" : "font-semibold"
              }`}
              style={{
                color: isToday
                  ? "var(--accent-orange)"
                  : "var(--text-primary)",
              }}
              title={title}
            >
              {shortDate(latestTs)}
            </span>
          );
        })()}

        {/* Status / outcome chip (carries cumulative P/L context via tone) */}
        <Chip
          tone={status.tone}
          className="shrink-0 min-w-16 justify-center"
          title={`status: ${status.label.toLowerCase()}`}
        >
          {status.label}
        </Chip>

        {/* Ticker */}
        {ticker ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTickerClick?.(ticker);
            }}
            className="num font-bold shrink-0 text-sm cursor-pointer rounded-[var(--radius-control)]"
            style={{
              color: tickerHi
                ? "var(--accent-blue)"
                : "var(--text-primary)",
              background: tickerHi
                ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                : "transparent",
              border: "none",
              padding: tickerHi ? "1px 6px" : 0,
            }}
          >
            {ticker}
          </button>
        ) : (
          <span className="num shrink-0 text-sm text-text-muted">—</span>
        )}

        {/* Strike + opt type, or SHARES fallback */}
        <span className="num font-bold shrink-0 text-sm text-text-primary">
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
          <span className="num text-text-muted shrink-0 text-xs">
            {pk.expiry}
          </span>
        )}

        {/* DTE chip */}
        {dl && (
          <Chip tone={dteTone(dl.text)} className="shrink-0">
            {dl.text}
            <span className="num opacity-85">
              {dte != null ? `${dte}d` : ""}
            </span>
          </Chip>
        )}

        {/* Entry premium */}
        {entry?.premium != null && (
          <span
            className="num text-text-secondary shrink-0 text-xs"
            title="Entry premium (first open/add)"
          >
            @{Number(entry.premium).toFixed(2)}
          </span>
        )}

        {/* Entry underlying */}
        {entry?.entry_underlying != null && (
          <span
            className="num text-text-muted shrink-0 text-xs"
            title="Underlying at entry"
          >
            und {Number(entry.entry_underlying).toFixed(2)}
          </span>
        )}

        {/* n_events badge — only when >1, otherwise noisy. */}
        {position.n_events > 1 && (
          <Chip tone="purple" className="shrink-0">
            <span className="num">+{position.n_events}</span> events
          </Chip>
        )}

        {/* "Today" pulse — visible when any events landed today (local TZ).
            Tells the user the position was active TODAY without expanding. */}
        {todayEventCount > 0 && (
          <Chip
            tone="orange"
            className="shrink-0"
            title={
              lastTodayEvent
                ? `${todayEventCount} event${todayEventCount === 1 ? "" : "s"} today, latest at ${new Date(lastTodayEvent.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : `${todayEventCount} events today`
            }
          >
            <span className="num">{todayEventCount}</span> TODAY
          </Chip>
        )}

        {/* P/L block — right aligned. When partial+closed we render two
            numbers (realized in headline color; unrealized struck through). */}
        <div className="ml-auto flex items-baseline gap-1.5">
          {/* Strikethrough unrealized when fully closed — the live mark is no longer meaningful. */}
          {isClosed && unrealized != null && hasRealized && (
            <span
              className="num text-xs line-through opacity-65 text-text-muted"
              title="Last unrealized mark before close"
            >
              {formatPercentRaw(unrealized, 1)}
            </span>
          )}
          <span
            className="num font-bold shrink-0 text-sm min-w-14 text-right"
            style={{ color: pnlColor }}
            title={pnlTitle}
          >
            {pnlLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(key);
          }}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${ticker ?? "trade"} position details`}
          className="min-h-6 min-w-6 shrink-0 rounded text-text-muted hover:text-text-primary"
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </button>
      </div>

      {/* Expanded — event timeline + optional raw messages */}
      {expanded && (
        <div
          id={detailsId}
          className="text-xs py-2 pr-3 pb-3 pl-14 text-text-secondary flex flex-col gap-2 leading-relaxed"
          style={{
            background: "color-mix(in srgb, var(--bg-card) 50%, transparent)",
          }}
        >
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
            Timeline (<span className="num">{position.events.length}</span>)
          </div>

          <div className="flex flex-col gap-1.5">
            {position.events.map((ev) => {
              const chip = eventTypeChip(ev.event_type);
              const sizing = parseSizing(ev.sizing);
              return (
                <div
                  key={`${ev.alert_id}-${ev.ts}`}
                  className="flex flex-wrap items-center gap-2 pb-1"
                  style={{ borderBottom: "1px dotted var(--border)" }}
                >
                  <Chip tone={chip.tone} className="shrink-0 min-w-14 justify-center">
                    {chip.label}
                  </Chip>
                  <span
                    className="num text-xs text-text-muted"
                    title={absoluteAge(ev.ts) || ""}
                  >
                    {shortDate(ev.ts)}
                  </span>

                  {ev.exit_pct != null && (
                    <span
                      className="num font-bold text-sm"
                      style={{ color: changeColor(ev.exit_pct) }}
                    >
                      {ev.exit_pct >= 0 ? "+" : ""}
                      {ev.exit_pct}%
                    </span>
                  )}

                  {ev.premium != null && (
                    <span
                      className="num text-xs text-text-secondary"
                      title="premium"
                    >
                      @{Number(ev.premium).toFixed(2)}
                    </span>
                  )}

                  {ev.entry_underlying != null && (
                    <span
                      className="num text-xs text-text-muted"
                      title="underlying at event"
                    >
                      und {Number(ev.entry_underlying).toFixed(2)}
                    </span>
                  )}

                  {ev.pl_underlying != null && (
                    <span
                      className="num text-xs"
                      style={{ color: changeColor(ev.pl_underlying) }}
                      title="underlying P/L since entry"
                    >
                      pl {formatPercentRaw(ev.pl_underlying, 2)}
                    </span>
                  )}

                  {sizing.length > 0 && (
                    <span className="num text-xs tracking-wide text-text-muted">
                      [{sizing.join(", ")}]
                    </span>
                  )}

                  {ev.rationale && (
                    <span className="text-sm italic text-text-secondary basis-full ml-16">
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
              aria-expanded={showMessages}
              aria-controls={messagesId}
              className="self-start text-xs font-medium uppercase tracking-wide text-text-muted cursor-pointer px-2 py-1 transition-colors hover:text-text-primary"
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
              }}
            >
              {showMessages
                ? "Hide messages"
                : `Show messages (${position.events.filter((e) => e.content).length})`}
            </button>
          )}

          {showMessages && (
            <div id={messagesId} className="flex flex-col gap-1.5">
              {position.events
                .filter((e) => e.content)
                .map((ev) => (
                  <div
                    key={`msg-${ev.alert_id}`}
                    className="flex flex-col gap-1"
                  >
                    <div className="num text-xs text-text-muted">
                      {shortDate(ev.ts)} ·{" "}
                      {(ev.event_type || "event").toUpperCase()}
                    </div>
                    <div
                      className="whitespace-pre-wrap text-sm text-text-secondary p-2 max-h-56 overflow-auto"
                      style={{
                        background:
                          "color-mix(in srgb, var(--bg-card-hover) 50%, transparent)",
                        borderRadius: "var(--radius-control)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {ev.content}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Footer: opened/last-update timestamps */}
          <div className="num text-xs text-text-muted">
            {position.opened_at && (
              <span title={absoluteAge(position.opened_at) || ""}>
                opened {relativeAge(position.opened_at)}
              </span>
            )}
            {lastEvent && (
              <span className="ml-2" title={absoluteAge(lastEvent.ts) || ""}>
                · last {relativeAge(lastEvent.ts)}
              </span>
            )}
            {hasRealized && (
              <span className="ml-2">
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
