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
import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";

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
  const detailsId = useId();
  const messagesId = useId();
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
    return { label: s.charAt(0).toUpperCase() + s.slice(1), pct: headlinePct, color, bg };
  })();

  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

  return (
    <div>
      {/* Header row — clickable. Purple leading dot marks a human trader event. */}
      <button
        type="button"
        className="flex min-h-11 w-full min-w-0 cursor-pointer flex-wrap items-center gap-2 px-2 py-2 text-left text-xs transition-colors hover:bg-bg-card-hover lg:min-h-7 lg:flex-nowrap"
        onClick={() => setExpanded((s) => !s)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        title={`${match.author} — alert ${match.alert_id} — ${match.ts}`}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--accent-purple)" }}
          aria-label="Trader event"
        />
        <span
          className="num shrink-0 font-semibold"
          style={{ color: dirColor }}
          title={`${match.author} (colored by direction alignment)`}
        >
          {initials(match.author)}
        </span>

        <span className="min-w-0 max-w-full truncate text-text-secondary lg:min-w-20">
          {match.author}
        </span>

        <span className="shrink-0 font-medium" style={{ color: evColor }}>
          {cap(ev)}
        </span>

        <span className="num shrink-0 font-semibold text-text-primary">
          {strike != null ? `$${strike}${opt ? ` ${opt}` : ""}` : "Shares"}
        </span>
        {exp && <span className="num shrink-0 text-text-muted">{exp}</span>}

        {/* "+N events" when this row collapses multiple events from the
            same position — expanding shows the multi-step timeline. */}
        {eventCount && eventCount > 1 && (
          <span className="shrink-0 text-text-muted" title={`${eventCount} events in this position`}>
            <span className="num">{eventCount}</span> events
          </span>
        )}

        {/* Status + P/L. For open/runner the pct is the live unrealized
            estimate, for closed/stopped/partial it's the realized exit. */}
        {outcome && (
          <span
            className="ml-auto shrink-0 text-text-muted"
            title={
              position && (position.status === "closed" || position.status === "stopped" || position.status === "partial")
                ? "realized P/L (latest trader-stated exit)"
                : "current unrealized P/L (delta+theta estimate)"
            }
          >
            {outcome.label}
            {outcome.pct != null && (
              <span className="num ml-1 font-semibold" style={{ color: outcome.color }}>
                {outcome.pct >= 0 ? "+" : ""}
                {Math.round(outcome.pct)}%
              </span>
            )}
          </span>
        )}

        <span
          className="num shrink-0 text-text-muted"
          style={{ marginLeft: outcome ? 0 : "auto" }}
          title="Days between the trader call and the flow print"
        >
          {match.days_offset >= 0 ? "+" : ""}
          {match.days_offset}d
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={`shrink-0 text-text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {/* Expanded detail — fetched lazily on first click */}
      {expanded && (
        <div
          id={detailsId}
          className="text-xs"
          style={{
            padding: "4px 12px 12px 28px",
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            lineHeight: 1.5,
          }}
        >
          {isFetching && !data && (
            <span className="animate-pulse text-text-muted">
              Loading position…
            </span>
          )}
          {!isFetching && !position && data && (
            <span className="text-text-muted">
              Couldn't resolve a matching position (loose-match miss).
            </span>
          )}
          {position && (
            <>
              <div className="text-xs text-text-muted">
                {cap(position.status)} · <span className="num">{position.events.length}</span> event
                {position.events.length === 1 ? "" : "s"} · current P/L{" "}
                {position.current_pl_pct != null ? (
                  <span className="num font-semibold" style={{ color: changeColor(position.current_pl_pct) }}>
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
                        paddingBottom: 6,
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <span className="text-xs font-medium" style={{ color: c, minWidth: 50 }}>
                        {cap(eType)}
                      </span>
                      <span
                        className="num text-text-muted"
                        style={{ fontSize: 12 }}
                        title={absoluteAge(e.ts) || ""}
                      >
                        {shortDate(e.ts)}
                      </span>
                      {e.exit_pct != null && (
                        <span
                          className="num"
                          style={{
                            color: changeColor(e.exit_pct),
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {e.exit_pct >= 0 ? "+" : ""}
                          {e.exit_pct}%
                        </span>
                      )}
                      {e.premium != null && (
                        <span
                          className="num text-text-secondary"
                          style={{ fontSize: 12 }}
                          title="premium"
                        >
                          @{Number(e.premium).toFixed(2)}
                        </span>
                      )}
                      {e.entry_underlying != null && (
                        <span
                          className="num text-text-muted"
                          style={{ fontSize: 12 }}
                          title="underlying at event"
                        >
                          und {Number(e.entry_underlying).toFixed(2)}
                        </span>
                      )}
                      {e.pl_underlying != null && (
                        <span
                          className="num"
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
                        <span className="num text-text-muted" style={{ fontSize: 12 }}>
                          [{sizing.join(", ")}]
                        </span>
                      )}
                      {e.rationale && (
                        <span
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: 13,
                            lineHeight: 1.6,
                            maxWidth: "72ch",
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
                  aria-expanded={showMessages}
                  aria-controls={messagesId}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text-secondary)",
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 999,
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
                <div id={messagesId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {position.events
                    .filter((e) => e.content)
                    .map((e) => (
                      <div
                        key={`msg-${e.alert_id}`}
                        style={{ display: "flex", flexDirection: "column", gap: 4 }}
                      >
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          <span className="num">{shortDate(e.ts)}</span> · {cap((e.event_type || "event").toLowerCase())}
                        </div>
                        <div
                          style={{
                            whiteSpace: "pre-wrap",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            padding: "4px 0 4px 10px",
                            lineHeight: 1.6,
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
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Opened {relativeAge(position.opened_at)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
