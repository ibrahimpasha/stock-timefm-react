/**
 * One trader-call event rendered as its own row inside the Flow History
 * date-grouped list. Visually distinct from `EntryRow` (which renders
 * institutional flow): left accent stripe, "TRADER" label chip, event-type
 * pill, the contract details, and the days-offset relative to the date
 * section it lives in.
 *
 * Click to expand: lazy-loads the trader's positions via
 * `useAlertsPositions(author)` (React Query — cached across rows in the
 * same date section), finds the position matching this row's contract,
 * and renders its full event timeline + optional raw Discord messages.
 *
 * Built from a `TraderMatch` carried in `entry.trader_matches`.
 */
import { useState } from "react";

import { useAlertsPositions } from "../../../api/alerts";
import {
  absoluteAge,
  changeColor,
  formatPercentRaw,
  relativeAge,
} from "../../../lib/utils";
import type { AlertPosition, AlertPositionEvent } from "../../../lib/types";
import type { TraderMatch } from "./types";
import { normExpiry } from "./utils";

const EVENT_COLORS: Record<string, string> = {
  open: "var(--accent-green)",
  add: "var(--accent-blue)",
  trim: "var(--accent-orange)",
  close: "var(--accent-red)",
  stop: "var(--accent-red)",
  status: "var(--text-muted)",
  recap: "var(--text-muted)",
};

function initials(author: string): string {
  const cleaned = author.replace(/[^A-Za-z\s]/g, "").trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0].slice(0, 2) + words[words.length - 1].slice(0, 1)).toUpperCase();
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function parseSizing(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Loose match: same ticker, same opt-type (when both set), strike within 2.5%,
    same normalized expiry (when both set). Mirrors the backend overlap rule. */
function matchPosition(
  positions: AlertPosition[],
  match: TraderMatch,
  ticker: string,
): AlertPosition | null {
  const targetStrike = match.call_strike;
  const targetOpt = (match.call_opt_type || "").toLowerCase();
  const targetExpiry = normExpiry(match.call_expiry);
  const targetTicker = ticker.toUpperCase();
  // Restrict to positions on the same ticker first.
  const sameTicker = positions.filter(
    (p) => (p.position_key.ticker || "").toUpperCase() === targetTicker,
  );
  for (const p of sameTicker) {
    const k = p.position_key;
    // strike check (skip when either side missing — be lenient like the linker)
    if (targetStrike != null && k.strike != null) {
      const diff = Math.abs(k.strike - targetStrike) / Math.max(targetStrike, 0.01);
      if (diff > 0.025) continue;
    }
    // opt-type check
    if (targetOpt && k.opt_type && targetOpt !== k.opt_type.toLowerCase()) continue;
    // expiry check — compare normalized; skip when either side missing
    const kExpiry = normExpiry(k.expiry);
    if (targetExpiry && kExpiry && targetExpiry !== kExpiry) continue;
    return p;
  }
  // Fallback: same ticker, any strike/expiry (the open-only case where the
  // trader posted strike but the position got grouped without it, etc.)
  if (sameTicker.length === 1) return sameTicker[0];
  return null;
}

export function TraderEventRow({
  match,
  ticker,
  eventCount,
}: {
  match: TraderMatch;
  ticker: string;
  /** When > 1, indicates this row collapses N events of the same position;
   *  shows a "+N events" badge in the header. */
  eventCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  // Fetch positions eagerly. React Query dedupes by queryKey, so multiple
  // TRADER rows for the same author across the date list share ONE network
  // call. The collapsed header needs position-status to show "CLOSED +50%"
  // outcomes rather than the original event's event_type.
  const { data, isFetching } = useAlertsPositions(match.author);

  const ev = (match.event_type || "status").toLowerCase();
  const evColor = EVENT_COLORS[ev] || "var(--text-muted)";
  const strike = match.call_strike;
  const opt = (match.call_opt_type || "").toUpperCase();
  const exp = match.call_expiry || "";
  const aligned = match.aligned;
  const dirColor = match.direction_known
    ? aligned
      ? "var(--accent-green)"
      : "var(--accent-red)"
    : "var(--text-muted)";

  // Resolve the matching position from the (possibly already-cached) fetch.
  let position: AlertPosition | null = null;
  if (data && "positions" in data) {
    position = matchPosition(data.positions, match, ticker);
  }

  // Status + P/L chip for the collapsed header. Shown for every status
  // (open / runner / partial / closed / stopped) so the user always sees
  // where the trade currently stands. Pct selection:
  //   - closed / stopped / partial → latest realized exit_pct (the
  //     trader's HEADLINE number, e.g. "+50% risk free"). Avoids the
  //     fraction-weighted cumulative which double-counts staggered trims.
  //   - open / runner / anything else → current_pl_pct (live unrealized
  //     delta+theta estimate from the backend).
  const outcome = (() => {
    if (!position) return null;
    const s = position.status;
    const isClosedish = s === "closed" || s === "stopped" || s === "partial";
    let headlinePct: number | null = null;
    if (isClosedish) {
      for (let i = position.events.length - 1; i >= 0; i--) {
        const e = position.events[i];
        if (
          e.event_type &&
          ["trim", "close", "stop"].includes(e.event_type) &&
          e.exit_pct != null
        ) {
          headlinePct = e.exit_pct;
          break;
        }
      }
      if (headlinePct == null) headlinePct = position.current_pl_pct;
    } else {
      headlinePct = position.current_pl_pct;
    }
    let color: string;
    let bg: string;
    if (s === "stopped") {
      color = "var(--accent-red)";
      bg = "color-mix(in srgb, var(--accent-red) 12%, transparent)";
    } else if (s === "partial") {
      color = "var(--accent-orange)";
      bg = "color-mix(in srgb, var(--accent-orange) 12%, transparent)";
    } else if (s === "runner") {
      color = "var(--accent-cyan)";
      bg = "color-mix(in srgb, var(--accent-cyan) 12%, transparent)";
    } else if (headlinePct != null && headlinePct >= 0) {
      color = "var(--accent-green)";
      bg = "color-mix(in srgb, var(--accent-green) 14%, transparent)";
    } else if (headlinePct != null) {
      color = "var(--accent-red)";
      bg = "color-mix(in srgb, var(--accent-red) 12%, transparent)";
    } else {
      // No P/L data yet — neutral chip so the status is still visible.
      color = "var(--text-muted)";
      bg = "color-mix(in srgb, var(--text-muted) 10%, transparent)";
    }
    return { label: s.toUpperCase(), pct: headlinePct, color, bg };
  })();

  return (
    <div
      style={{
        background: "color-mix(in srgb, var(--accent-purple) 6%, transparent)",
        borderLeft: "2px solid var(--accent-purple)",
        borderRadius: 3,
      }}
    >
      {/* Header row — clickable */}
      <div
        className="flex items-center gap-2 text-xs py-1.5 px-2 hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => setExpanded((s) => !s)}
        title={`${match.author} — alert ${match.alert_id} — ${match.ts}`}
      >
        <span
          className="font-mono font-bold shrink-0"
          style={{
            color: "var(--accent-purple)",
            fontSize: 10,
            letterSpacing: 0.6,
            minWidth: 50,
          }}
        >
          TRADER
        </span>

        <span
          className="font-mono font-bold shrink-0"
          style={{
            color: dirColor,
            border: `1px solid ${dirColor}`,
            padding: "1px 6px",
            borderRadius: 3,
            fontSize: 11,
          }}
        >
          {initials(match.author)}
        </span>

        <span
          className="text-text-secondary shrink-0"
          style={{ fontSize: 12, minWidth: 80 }}
        >
          {match.author}
        </span>

        <span
          className="font-mono font-bold shrink-0"
          style={{
            color: evColor,
            border: `1px solid ${evColor}`,
            padding: "1px 6px",
            borderRadius: 3,
            fontSize: 10,
            letterSpacing: 0.5,
          }}
        >
          {ev.toUpperCase()}
        </span>

        <span
          className="font-mono font-bold shrink-0 text-text-primary"
          style={{ fontSize: 12 }}
        >
          {strike != null ? `$${strike}${opt ? ` ${opt}` : ""}` : "SHARES"}
        </span>
        {exp && (
          <span
            className="font-mono text-text-muted shrink-0"
            style={{ fontSize: 11 }}
          >
            {exp}
          </span>
        )}

        {/* "+N events" badge when this row collapses multiple events from
            the same position. Tells the user that expanding will show a
            multi-step timeline rather than just one message. */}
        {eventCount && eventCount > 1 && (
          <span
            className="font-mono shrink-0"
            style={{
              color: "var(--accent-purple)",
              border: "1px solid var(--accent-purple)",
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 10,
              letterSpacing: 0.5,
              opacity: 0.85,
            }}
            title={`${eventCount} events in this position`}
          >
            +{eventCount} events
          </span>
        )}

        {/* Status + P/L chip. Renders for every status; for open/runner the
            pct is the live unrealized estimate, for closed/stopped/partial
            it's the headline realized exit. */}
        {outcome && (
          <span
            className="font-mono font-bold shrink-0 ml-auto"
            style={{
              color: outcome.color,
              border: `1px solid ${outcome.color}`,
              background: outcome.bg,
              padding: "2px 7px",
              borderRadius: 3,
              fontSize: 11,
              letterSpacing: 0.6,
            }}
            title={
              position && (position.status === "closed" || position.status === "stopped" || position.status === "partial")
                ? "realized P/L (latest trader-stated exit)"
                : "current unrealized P/L (delta+theta estimate)"
            }
          >
            {outcome.label}
            {outcome.pct != null && (
              <span style={{ marginLeft: 4 }}>
                {outcome.pct >= 0 ? "+" : ""}
                {Math.round(outcome.pct)}%
              </span>
            )}
          </span>
        )}

        <span
          className="font-mono text-text-muted shrink-0"
          style={{ fontSize: 11, marginLeft: outcome ? 0 : "auto" }}
        >
          {match.days_offset >= 0 ? "+" : ""}
          {match.days_offset}d vs flow
        </span>
        <span
          className="font-mono shrink-0"
          style={{ fontSize: 10, color: "var(--text-muted)" }}
        >
          {expanded ? "▾" : "▸"}
        </span>
      </div>

      {/* Expanded detail — fetched lazily on first click */}
      {expanded && (
        <div
          className="text-xs"
          style={{
            padding: "8px 12px 12px 56px",
            background: "color-mix(in srgb, var(--bg-card) 40%, transparent)",
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            lineHeight: 1.5,
          }}
        >
          {isFetching && !data && (
            <span className="animate-pulse text-text-muted">
              loading position...
            </span>
          )}
          {!isFetching && !position && data && (
            <span className="text-text-muted">
              Couldn't resolve a matching position (loose-match miss).
            </span>
          )}
          {position && (
            <>
              <div
                className="font-mono"
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                {position.status} · {position.events.length} event
                {position.events.length === 1 ? "" : "s"} · current pl{" "}
                {position.current_pl_pct != null ? (
                  <span style={{ color: changeColor(position.current_pl_pct) }}>
                    {formatPercentRaw(position.current_pl_pct, 2)}
                  </span>
                ) : (
                  "—"
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {position.events.map((e: AlertPositionEvent) => {
                  const eType = (e.event_type || "status").toLowerCase();
                  const c = EVENT_COLORS[eType] || "var(--text-muted)";
                  const sizing = parseSizing(e.sizing);
                  return (
                    <div
                      key={`${e.alert_id}-${e.ts}`}
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
                          color: c,
                          fontWeight: 700,
                          minWidth: 50,
                          fontSize: 12,
                          letterSpacing: 0.5,
                        }}
                      >
                        {eType.toUpperCase()}
                      </span>
                      <span
                        className="font-mono text-text-muted"
                        style={{ fontSize: 12 }}
                        title={absoluteAge(e.ts) || ""}
                      >
                        {shortDate(e.ts)}
                      </span>
                      {e.exit_pct != null && (
                        <span
                          className="font-mono"
                          style={{
                            color: changeColor(e.exit_pct),
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {e.exit_pct >= 0 ? "+" : ""}
                          {e.exit_pct}%
                        </span>
                      )}
                      {e.premium != null && (
                        <span
                          className="font-mono text-text-secondary"
                          style={{ fontSize: 12 }}
                          title="premium"
                        >
                          @{Number(e.premium).toFixed(2)}
                        </span>
                      )}
                      {e.entry_underlying != null && (
                        <span
                          className="font-mono text-text-muted"
                          style={{ fontSize: 12 }}
                          title="underlying at event"
                        >
                          und {Number(e.entry_underlying).toFixed(2)}
                        </span>
                      )}
                      {e.pl_underlying != null && (
                        <span
                          className="font-mono"
                          style={{
                            color: changeColor(e.pl_underlying),
                            fontSize: 12,
                          }}
                          title="position P/L estimate"
                        >
                          pl {formatPercentRaw(e.pl_underlying, 2)}
                        </span>
                      )}
                      {sizing.length > 0 && (
                        <span
                          className="font-mono text-text-muted"
                          style={{ fontSize: 11, letterSpacing: 0.5 }}
                        >
                          [{sizing.join(", ")}]
                        </span>
                      )}
                      {e.rationale && (
                        <span
                          style={{
                            color: "var(--text-secondary)",
                            fontStyle: "italic",
                            fontSize: 12,
                            flexBasis: "100%",
                            marginLeft: 58,
                          }}
                        >
                          {e.rationale}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {position.events.some((e) => e.content) && (
                <button
                  type="button"
                  onClick={() => setShowMessages((s) => !s)}
                  className="font-mono"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-muted)",
                    fontSize: 11,
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
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {position.events
                    .filter((e) => e.content)
                    .map((e) => (
                      <div
                        key={`msg-${e.alert_id}`}
                        style={{ display: "flex", flexDirection: "column", gap: 4 }}
                      >
                        <div
                          className="font-mono"
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            letterSpacing: 0.4,
                          }}
                        >
                          {shortDate(e.ts)} · {(e.event_type || "event").toUpperCase()}
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            background: "color-mix(in srgb, var(--bg-card-hover) 50%, transparent)",
                            padding: 8,
                            borderRadius: 4,
                            border: "1px solid var(--border)",
                            maxHeight: 180,
                            overflow: "auto",
                          }}
                        >
                          {e.content}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {position.opened_at && (
                <div
                  className="font-mono"
                  style={{ fontSize: 11, color: "var(--text-muted)" }}
                >
                  opened {relativeAge(position.opened_at)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
