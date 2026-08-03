/**
 * One row in the "Recent calls" list on the Trader Leaderboard page.
 *
 * Visually mirrors `flow-analyzer/iflow/EntryRow.tsx` (the row look the user
 * wants), but tuned for trader-alert data: direction badge, sizing chip,
 * strike + opt type, expiry, DTE chip, premium, entry underlying, P/L badge,
 * conviction chip. Click to toggle a detail block with the full Discord
 * message + LLM rationale + compact computation tags.
 *
 * Glass remodel: every ad-hoc badge is a `Chip` primitive, numerals carry the
 * `num` class. Outcome chips follow the shared tone rules — CLOSED green on
 * profit / red on loss, STOPPED red, TRIMMED yellow. Behavior unchanged.
 *
 * Reuses the `dteTag` helper from `iflow/utils.ts` so the DTE pill bucket
 * stays consistent across both views.
 */
import { useId, useMemo } from "react";

import { dteTag } from "../flow-analyzer/iflow/utils";
import { Chip, type ChipTone } from "../../components/Glass";
import {
  absoluteAge,
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
 * Summarize a call's linked exit events into a single visible outcome chip.
 * Priority: close > stop > trim. The chip's pct (when present) is the latest
 * exit_pct the trader stated for that event type.
 * Tones: CLOSED green on profit / red on loss, STOPPED red, TRIMMED yellow.
 */
function deriveExitStatus(
  exits: AlertCallRow["exits"],
): { label: string; tone: ChipTone; pct: number | null; title: string } | null {
  if (!exits || exits.length === 0) return null;
  const sorted = [...exits].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  const closes = sorted.filter((e) => e.event_type === "close");
  const stops = sorted.filter((e) => e.event_type === "stop");
  const trims = sorted.filter((e) => e.event_type === "trim");
  if (closes.length > 0) {
    const pct = closes.find((e) => e.exit_pct != null)?.exit_pct ?? null;
    return {
      label: "CLOSED",
      tone: pct != null && pct > 0 ? "green" : "red",
      pct,
      title: closes[0].rationale || "Position fully closed",
    };
  }
  if (stops.length > 0) {
    const pct = stops.find((e) => e.exit_pct != null)?.exit_pct ?? null;
    return {
      label: "STOPPED",
      tone: "red",
      pct,
      title: stops[0].rationale || "Stopped out",
    };
  }
  if (trims.length > 0) {
    const pct = trims.find((e) => e.exit_pct != null)?.exit_pct ?? null;
    return {
      label: "TRIMMED",
      tone: "yellow",
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

/** Pick a Chip tone for a sizing tag (matches Discord trader vocabulary). */
function sizingTone(tag: string): ChipTone {
  const t = tag.trim().toLowerCase();
  if (t === "lotto") return "purple";
  if (t === "starter" || t === "add") return "blue";
  if (t === "trim") return "orange";
  if (t === "close") return "red";
  if (t === "swing" || t === "scalp") return "cyan";
  if (t === "leap" || t === "hedge") return "neutral";
  return "neutral";
}

/** Pick a Chip tone for a conviction tag. */
function convictionTone(c: string | null | undefined): ChipTone | null {
  if (!c) return null;
  const u = c.toUpperCase();
  if (u === "HIGH") return "green";
  if (u === "MEDIUM" || u === "MED") return "orange";
  if (u === "LOTTO" || u === "LOW") return "red";
  return "neutral";
}

function convictionLabel(c: string | null | undefined): string | null {
  if (!c) return null;
  const u = c.toUpperCase();
  if (u === "MEDIUM") return "MED";
  return u;
}

/** DTE bucket → Chip tone (mirrors the iflow color language). */
function dteTone(text: string): ChipTone {
  if (text === "LOTTO") return "orange";
  if (text === "SWING") return "blue";
  if (text === "LEAP") return "cyan";
  return "neutral";
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
  const detailsId = useId();
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

  const convTone = convictionTone(call.conviction);
  const convLabel = convictionLabel(call.conviction);

  const sizing = Array.isArray(call.sizing) ? call.sizing : [];
  const tickerHi = call.ticker && call.ticker === activeTicker;

  const exitStatus = useMemo(() => deriveExitStatus(call.exits), [call.exits]);

  const strike = call.strike;
  const optType = (call.opt_type || "").toUpperCase();
  const hasStrike = strike != null;

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Main row — clickable */}
      <div
        className="text-sm py-2 px-3 hover:bg-bg-card-hover transition-colors cursor-pointer flex items-center gap-2.5 flex-wrap"
        onClick={() => onToggle(call.alert_id)}
      >
        {/* Direction badge */}
        <span
          className="num font-semibold shrink-0 text-xs w-11"
          style={{ color: dir.color }}
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
            className="num font-bold shrink-0 text-sm cursor-pointer rounded-[var(--radius-control)]"
            style={{
              color: tickerHi ? "var(--accent-blue)" : "var(--text-primary)",
              background: tickerHi
                ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                : "transparent",
              border: "none",
              padding: tickerHi ? "1px 6px" : 0,
            }}
          >
            {call.ticker}
          </button>
        ) : (
          <span className="num shrink-0 text-sm text-text-muted">—</span>
        )}

        {/* Sizing chips */}
        {sizing.length > 0 &&
          sizing.map((s) => (
            <Chip key={s} tone={sizingTone(s)} className="shrink-0 uppercase">
              {s}
            </Chip>
          ))}

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
        {call.expiry && (
          <span className="num text-text-muted shrink-0 text-xs">
            {call.expiry}
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

        {/* Premium */}
        {call.premium != null && (
          <span
            className="num text-text-secondary shrink-0 text-xs"
            title="Entry premium"
          >
            @{Number(call.premium).toFixed(2)}
          </span>
        )}

        {/* Entry underlying */}
        {call.entry_underlying != null && (
          <span
            className="num text-text-muted shrink-0 text-xs"
            title="Underlying at fill"
          >
            und {Number(call.entry_underlying).toFixed(2)}
          </span>
        )}

        {/* Outcome chip (CLOSED / TRIMMED / STOPPED) with stated exit pct */}
        {exitStatus && (
          <Chip
            tone={exitStatus.tone}
            className="shrink-0 ml-auto font-semibold"
            title={exitStatus.title}
          >
            {exitStatus.label}
            {exitStatus.pct != null && (
              <span className="num">
                {exitStatus.pct >= 0 ? "+" : ""}
                {exitStatus.pct}%
              </span>
            )}
          </Chip>
        )}

        {/* P/L badge — right aligned (estimated, unrealized) */}
        <span
          className={`num font-bold shrink-0 text-sm min-w-14 text-right ${
            exitStatus ? "" : "ml-auto"
          } ${exitStatus?.label === "CLOSED" ? "opacity-40 line-through" : ""}`}
          style={{ color: pnlColor }}
          title={pnlTitle}
        >
          {pnlLabel}
        </span>

        {/* Conviction chip */}
        {convLabel && convTone && (
          <Chip tone={convTone} className="shrink-0">
            {convLabel}
          </Chip>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(call.alert_id);
          }}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${call.ticker ?? "trade"} call details`}
          className="min-h-6 min-w-6 shrink-0 rounded text-text-muted hover:text-text-primary"
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </button>
      </div>

      {/* Expanded detail block — mirrors EntryRow's detail panel idiom */}
      {expanded && (
        <div
          id={detailsId}
          className="text-xs py-2 pr-3 pb-2.5 pl-14 text-text-secondary flex flex-col gap-1.5 leading-relaxed"
          style={{
            background: "color-mix(in srgb, var(--bg-card) 50%, transparent)",
          }}
        >
          {call.rationale && (
            <div className="italic text-xs text-text-muted">
              {call.rationale}
            </div>
          )}

          {call.content && (
            <div
              className="whitespace-pre-wrap text-xs text-text-secondary p-2 max-h-56 overflow-auto"
              style={{
                background:
                  "color-mix(in srgb, var(--bg-card-hover) 50%, transparent)",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--border)",
              }}
            >
              {call.content}
            </div>
          )}

          {call.exits && call.exits.length > 0 && (
            <div
              className="flex flex-col gap-1 pt-1"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                Exits (<span className="num">{call.exits.length}</span>)
              </div>
              {call.exits.map((ex) => (
                <div
                  key={ex.alert_id}
                  className="num text-xs flex gap-2 items-baseline"
                >
                  <span
                    className="font-bold uppercase min-w-11"
                    style={{
                      color:
                        ex.event_type === "close"
                          ? "var(--accent-red)"
                          : ex.event_type === "trim"
                            ? "var(--accent-orange)"
                            : "var(--accent-red)",
                    }}
                  >
                    {ex.event_type}
                  </span>
                  <span className="text-text-muted">{ex.ts.slice(5, 10)}</span>
                  {ex.exit_pct != null && (
                    <span
                      className="font-bold"
                      style={{
                        color:
                          ex.exit_pct >= 0
                            ? "var(--accent-green)"
                            : "var(--accent-red)",
                      }}
                    >
                      {ex.exit_pct >= 0 ? "+" : ""}
                      {ex.exit_pct}%
                    </span>
                  )}
                  {ex.rationale && (
                    <span className="italic text-text-secondary font-sans">
                      — {ex.rationale}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compact computation tags — modeled after EntryRow's "Entry / Now / DTE / Est" line */}
          <div className="num text-xs text-text-muted">
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
            className="num text-xs text-text-muted"
            title={absoluteAge(call.ts) || ""}
          >
            {absoluteAge(call.ts) || ""}
            <span className="ml-2">· {relativeAge(call.ts)}</span>
            {call.channel_name && (
              <span className="ml-2">· #{call.channel_name}</span>
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
