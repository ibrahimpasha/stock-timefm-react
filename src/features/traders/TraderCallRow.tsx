/**
 * One row in the "Recent calls" list on the Trader Leaderboard page.
 *
 * Visually mirrors `flow-analyzer/iflow/EntryRow.tsx` (the row look the user
 * wants), but tuned for trader-alert data: direction badge, sizing chip,
 * strike + opt type, expiry, DTE chip, premium, entry underlying, P/L badge,
 * conviction chip. Click to toggle a detail block with the full Discord
 * message + LLM rationale + compact computation tags.
 *
 * Reuses the `dteTag` helper from `iflow/utils.ts` so the DTE pill color
 * scheme stays consistent across both views.
 */
import { useMemo } from "react";

import { dteTag } from "../flow-analyzer/iflow/utils";
import { Tag } from "../../components/CCPrimitives";
import { catalystTagColor } from "../../lib/constants";
import {
  absoluteAge,
  changeColor,
  formatPercentRaw,
  relativeAge,
} from "../../lib/utils";
import type { AlertCallRow } from "../../lib/types";

/* ── Helpers ──────────────────────────────────────────────── */

/** Compute the realized-or-estimated P/L pct for one call row. */
function rowPct(c: AlertCallRow): number | null {
  if (c.is_realized && c.realized_pct != null) return c.realized_pct;
  if (c.est_pl_pct != null) return c.est_pl_pct;
  return null;
}

/**
 * Summarize a call's linked exit events into a single visible status chip.
 * Priority: close > stop > trim. The chip's pct (when present) is the latest
 * exit_pct the trader stated for that event type.
 */
function deriveExitStatus(
  exits: AlertCallRow["exits"],
): { label: string; color: string; bg: string; pct: number | null; title: string } | null {
  if (!exits || exits.length === 0) return null;
  const sorted = [...exits].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const closes = sorted.filter((e) => e.event_type === "close");
  const stops = sorted.filter((e) => e.event_type === "stop");
  const trims = sorted.filter((e) => e.event_type === "trim");
  if (closes.length > 0) {
    const pct = closes.find((e) => e.exit_pct != null)?.exit_pct ?? null;
    return {
      label: "CLOSED",
      color: "var(--accent-red)",
      bg: "rgba(248,81,73,0.10)",
      pct,
      title: closes[0].rationale || "Position fully closed",
    };
  }
  if (stops.length > 0) {
    const pct = stops.find((e) => e.exit_pct != null)?.exit_pct ?? null;
    return {
      label: "STOPPED",
      color: "var(--accent-red)",
      bg: "rgba(248,81,73,0.10)",
      pct,
      title: stops[0].rationale || "Stopped out",
    };
  }
  if (trims.length > 0) {
    const pct = trims.find((e) => e.exit_pct != null)?.exit_pct ?? null;
    return {
      label: "TRIMMED",
      color: "var(--accent-orange)",
      bg: "rgba(255,165,0,0.10)",
      pct,
      title: `${trims.length} trim event${trims.length > 1 ? "s" : ""}`,
    };
  }
  return null;
}

/** Map a direction string to the {label, color} pair shown on the left side. */
function directionBadge(direction: string | null | undefined): {
  label: string;
  color: string;
} {
  const d = (direction || "").toLowerCase();
  if (d === "bullish") return { label: "BULL", color: "var(--accent-green)" };
  if (d === "bearish") return { label: "BEAR", color: "var(--accent-red)" };
  return { label: "NEUT", color: "var(--text-muted)" };
}

/** Pick a chip color for a sizing tag (matches Discord trader vocabulary). */
function sizingColor(tag: string): string {
  const t = tag.trim().toLowerCase();
  if (t === "lotto") return "var(--accent-purple)";
  if (t === "starter" || t === "add") return "var(--accent-blue)";
  if (t === "trim") return "var(--accent-orange)";
  if (t === "close") return "var(--accent-red)";
  if (t === "swing" || t === "scalp") return "var(--accent-cyan)";
  if (t === "leap" || t === "hedge") return "var(--text-secondary)";
  return catalystTagColor(t);
}

/** Pick a chip color for a conviction tag. */
function convictionColor(c: string | null | undefined): string | null {
  if (!c) return null;
  const u = c.toUpperCase();
  if (u === "HIGH") return "var(--accent-green)";
  if (u === "MEDIUM" || u === "MED") return "var(--accent-orange)";
  if (u === "LOTTO" || u === "LOW") return "var(--accent-red)";
  return "var(--text-secondary)";
}

function convictionLabel(c: string | null | undefined): string | null {
  if (!c) return null;
  const u = c.toUpperCase();
  if (u === "MEDIUM") return "MED";
  return u;
}

/**
 * Days-to-expiry from an MM/DD or MM/DD/YY or YYYY-MM-DD string.
 * MM/DD with no year picks the next future occurrence relative to today.
 * Returns null when parsing fails so the DTE chip just hides.
 */
function computeDte(expiry: string | null | undefined): number | null {
  if (!expiry) return null;
  const e = String(expiry).trim();
  let exp: Date | null = null;
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    const [y, m, d] = e.split("-").map(Number);
    exp = new Date(y, m - 1, d);
  }
  // MM/DD/YY or MM/DD/YYYY
  else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(e)) {
    const [m, d, y] = e.split("/").map(Number);
    const yyyy = y < 100 ? 2000 + y : y;
    exp = new Date(yyyy, m - 1, d);
  }
  // MM/DD — infer the next-occurrence year
  else if (/^\d{1,2}\/\d{1,2}$/.test(e)) {
    const [m, d] = e.split("/").map(Number);
    const today = new Date();
    let yyyy = today.getFullYear();
    let candidate = new Date(yyyy, m - 1, d);
    // If the date already passed by more than 30d, roll into next year.
    const diffDays = (candidate.getTime() - today.getTime()) / 86400000;
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

/* ── Component ────────────────────────────────────────────── */

interface TraderCallRowProps {
  call: AlertCallRow;
  expanded: boolean;
  activeTicker?: string;
  onToggle: (alertId: number) => void;
  onTickerClick?: (ticker: string) => void;
}

export function TraderCallRow({
  call,
  expanded,
  activeTicker,
  onToggle,
  onTickerClick,
}: TraderCallRowProps) {
  const dir = directionBadge(call.direction);
  const pct = rowPct(call);
  const isRealized = Boolean(call.is_realized);
  const pnlColor =
    pct != null
      ? pct >= 0
        ? "var(--accent-green)"
        : "var(--accent-red)"
      : "var(--text-muted)";
  const pnlLabel = pct != null ? formatPercentRaw(pct, 1) : "—";
  const pnlTitle = isRealized ? "Realized" : "Estimated (delta+theta)";

  const dte = useMemo(() => computeDte(call.expiry), [call.expiry]);
  const dl = dteTag(dte);

  const convColor = convictionColor(call.conviction);
  const convLabel = convictionLabel(call.conviction);

  const sizing = Array.isArray(call.sizing) ? call.sizing : [];
  const tickerHi = call.ticker && call.ticker === activeTicker;

  const exitStatus = useMemo(() => deriveExitStatus(call.exits), [call.exits]);

  const strike = call.strike;
  const optType = (call.opt_type || "").toUpperCase();
  const hasStrike = strike != null;

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(48,54,61,0.5)",
      }}
    >
      {/* Main row — clickable */}
      <div
        className="text-sm py-2 px-3 hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => onToggle(call.alert_id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Direction badge */}
        <span
          className="font-mono font-semibold shrink-0"
          style={{ color: dir.color, width: 44, fontSize: 12 }}
        >
          {dir.label}
        </span>

        {/* Ticker (clickable, optional) */}
        {call.ticker ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTickerClick?.(call.ticker!);
            }}
            className="font-mono font-bold shrink-0"
            style={{
              fontSize: 13,
              color: tickerHi ? "var(--accent-blue)" : "var(--text-primary)",
              background: tickerHi ? "rgba(88,166,255,0.10)" : "transparent",
              border: "none",
              padding: tickerHi ? "1px 6px" : 0,
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {call.ticker}
          </button>
        ) : (
          <span
            className="font-mono shrink-0"
            style={{ fontSize: 13, color: "var(--text-muted)" }}
          >
            —
          </span>
        )}

        {/* Sizing chips */}
        {sizing.length > 0 &&
          sizing.map((s) => {
            const sc = sizingColor(s);
            return (
              <Tag key={s} color={sc} border={sc} bg="rgba(0,0,0,0)">
                {s}
              </Tag>
            );
          })}

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
        {call.expiry && (
          <span
            className="font-mono text-text-muted shrink-0"
            style={{ fontSize: 12 }}
          >
            {call.expiry}
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
              fontSize: 10,
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

        {/* Premium */}
        {call.premium != null && (
          <span
            className="font-mono text-text-secondary shrink-0"
            style={{ fontSize: 12 }}
            title="Entry premium"
          >
            @{Number(call.premium).toFixed(2)}
          </span>
        )}

        {/* Entry underlying */}
        {call.entry_underlying != null && (
          <span
            className="font-mono text-text-muted shrink-0"
            style={{ fontSize: 12 }}
            title="Underlying at fill"
          >
            und {Number(call.entry_underlying).toFixed(2)}
          </span>
        )}

        {/* Exit-status badge (CLOSED / TRIMMED / STOPPED) */}
        {exitStatus && (
          <span
            className="font-mono font-bold shrink-0"
            style={{
              color: exitStatus.color,
              background: exitStatus.bg,
              padding: "2px 7px",
              borderRadius: 3,
              fontSize: 11,
              letterSpacing: 0.6,
              border: `1px solid ${exitStatus.color}`,
              marginLeft: "auto",
            }}
            title={exitStatus.title}
          >
            {exitStatus.label}
            {exitStatus.pct != null && (
              <span style={{ marginLeft: 4 }}>
                {exitStatus.pct >= 0 ? "+" : ""}
                {exitStatus.pct}%
              </span>
            )}
          </span>
        )}

        {/* P/L badge — right aligned (estimated, unrealized) */}
        <span
          className="font-mono font-bold shrink-0"
          style={{
            color: pnlColor,
            minWidth: 56,
            textAlign: "right",
            marginLeft: exitStatus ? 0 : "auto",
            fontSize: 13,
            opacity: exitStatus?.label === "CLOSED" ? 0.4 : 1,
            textDecoration:
              exitStatus?.label === "CLOSED" ? "line-through" : "none",
          }}
          title={pnlTitle}
        >
          {pnlLabel}
        </span>

        {/* Conviction chip */}
        {convLabel && convColor && (
          <Tag color={convColor} border={convColor} bg="rgba(0,0,0,0)">
            {convLabel}
          </Tag>
        )}
      </div>

      {/* Expanded detail block — mirrors EntryRow's detail panel idiom */}
      {expanded && (
        <div
          className="text-xs"
          style={{
            padding: "8px 12px 10px 56px",
            background: "rgba(13,17,23,0.5)",
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            lineHeight: 1.5,
          }}
        >
          {call.rationale && (
            <div
              style={{
                fontStyle: "italic",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              {call.rationale}
            </div>
          )}

          {call.content && (
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 12,
                color: "var(--text-secondary)",
                background: "rgba(22,27,34,0.5)",
                padding: 8,
                borderRadius: 4,
                border: "1px solid var(--border)",
                maxHeight: 220,
                overflow: "auto",
              }}
            >
              {call.content}
            </div>
          )}

          {call.exits && call.exits.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingTop: 4,
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                }}
              >
                Exits ({call.exits.length})
              </div>
              {call.exits.map((ex) => (
                <div
                  key={ex.alert_id}
                  className="font-mono"
                  style={{
                    fontSize: 12,
                    display: "flex",
                    gap: 8,
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      color:
                        ex.event_type === "close"
                          ? "var(--accent-red)"
                          : ex.event_type === "trim"
                            ? "var(--accent-orange)"
                            : "var(--accent-red)",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      minWidth: 44,
                    }}
                  >
                    {ex.event_type}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    {ex.ts.slice(5, 10)}
                  </span>
                  {ex.exit_pct != null && (
                    <span
                      style={{
                        color:
                          ex.exit_pct >= 0
                            ? "var(--accent-green)"
                            : "var(--accent-red)",
                        fontWeight: 700,
                      }}
                    >
                      {ex.exit_pct >= 0 ? "+" : ""}
                      {ex.exit_pct}%
                    </span>
                  )}
                  {ex.rationale && (
                    <span
                      style={{
                        color: "var(--text-secondary)",
                        fontStyle: "italic",
                      }}
                    >
                      — {ex.rationale}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compact computation tags — modeled after EntryRow's "Entry / Now / DTE / Est" line */}
          <div
            className="font-mono"
            style={{ fontSize: 11, color: "var(--text-muted)" }}
          >
            {call.entry_underlying != null
              ? `Entry $${Number(call.entry_underlying).toFixed(2)}`
              : "Entry —"}
            {call.current_underlying != null
              ? ` / Now $${Number(call.current_underlying).toFixed(2)}`
              : " / Now —"}
            {dte != null ? ` / DTE ${dte}d` : ""}
            {pct != null
              ? ` / ${isRealized ? "Realized" : "Est"} ${formatPercentRaw(pct, 1)}`
              : ""}
            {call.premium != null
              ? ` / Premium $${Number(call.premium).toFixed(2)}`
              : ""}
          </div>

          <div
            className="font-mono"
            style={{ fontSize: 11, color: "var(--text-muted)" }}
            title={absoluteAge(call.ts) || ""}
          >
            {absoluteAge(call.ts) || ""}
            <span style={{ marginLeft: 8 }}>· {relativeAge(call.ts)}</span>
            {call.channel_name && (
              <span style={{ marginLeft: 8 }}>· #{call.channel_name}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TraderCallRow;

/** Re-exported so the parent page can compute the same value when needed. */
export { rowPct };
