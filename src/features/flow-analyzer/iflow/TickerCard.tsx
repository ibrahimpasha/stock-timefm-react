import { TrendingUp, TrendingDown, Mic2, Star } from "lucide-react";
import { BullBearBar } from "../../../components/BullBearBar";
import { useAppStore } from "../../../store/useAppStore";
import type { TrackedTicker } from "../../../lib/types";
import type { TickerIntel } from "./types";

export interface VoicesCardIntel {
  mentions: number;
  bullish: number;
  bearish: number;
}

/**
 * Compact card shown inside the ticker grid (left column of IFlowTracker).
 *
 * Props:
 *   - intel        — optional escalation/accumulation badges
 *   - retPct       — optional avg flow-P/L %, shown when "Highest Returns" sort
 *   - retEntries   — number of scored entries used to compute retPct
 *   - voicesIntel  — recent mentions from tracked X voices (Serenity, …); when
 *                    present, renders a small mic badge in the header row.
 */
export function TickerCard({
  t,
  selected,
  onClick,
  intel,
  retPct,
  retEntries,
  voicesIntel,
  highlightOn,
  highlightTitle,
}: {
  t: TrackedTicker;
  selected: boolean;
  onClick: () => void;
  intel?: TickerIntel;
  retPct?: number | null;
  retEntries?: number;
  voicesIntel?: VoicesCardIntel;
  /** When provided, drives the green border instead of `esc` — lets the grid's
   *  Highlight selector re-point the border at play / ML / accumulation. */
  highlightOn?: boolean;
  highlightTitle?: string;
}) {
  const net = t.bullish > t.bearish;
  const esc = intel?.escalating;
  // The Highlight selector (when active) owns the border; fall back to the
  // escalating tint for callers that don't pass a highlight.
  const lit = highlightOn ?? esc;
  const accum = intel?.accumLabel || "";
  const hasAccum = accum.includes("STRONG") || accum.includes("ACCUM");
  const showReturn = retPct !== undefined;
  const watched = useAppStore((s) => s.watchlist.includes(t.ticker));
  const toggleWatchlist = useAppStore((s) => s.toggleWatchlist);

  return (
    <div
      onClick={onClick}
      title={highlightTitle}
      className="card text-left transition-all py-2 px-3 cursor-pointer relative"
      style={{
        borderColor: selected ? "var(--accent-blue)" : lit ? "color-mix(in srgb, var(--accent-green) 55%, transparent)" : undefined,
        background: selected ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)" : lit ? "color-mix(in srgb, var(--accent-green) 6%, transparent)" : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(t.ticker);
            }}
            className="p-0.5 -ml-0.5 rounded hover:bg-bg-card-hover transition-colors"
            title={watched ? "Remove from watchlist" : "Add to watchlist"}
          >
            <Star
              size={12}
              style={{
                color: watched ? "var(--accent-orange)" : "var(--text-muted)",
                fill: watched ? "var(--accent-orange)" : "none",
                opacity: watched ? 1 : 0.55,
              }}
            />
          </button>
          <span className="font-mono font-bold text-sm text-text-primary">{t.ticker}</span>
        </div>
        <div className="flex items-center gap-1">
          {voicesIntel && voicesIntel.mentions > 0 && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-mono font-semibold"
              style={{
                background: "color-mix(in srgb, var(--accent-purple) 12%, transparent)",
                color:
                  voicesIntel.bullish > voicesIntel.bearish
                    ? "var(--accent-green)"
                    : voicesIntel.bearish > voicesIntel.bullish
                    ? "var(--accent-red)"
                    : "var(--accent-purple)",
                border: "1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)",
              }}
              title={`Tracked voices: ${voicesIntel.mentions} mention${voicesIntel.mentions === 1 ? "" : "s"} in last 7d (${voicesIntel.bullish}↑ ${voicesIntel.bearish}↓)`}
            >
              <Mic2 size={9} />
              {voicesIntel.mentions}
            </span>
          )}
          {esc && <TrendingUp size={10} style={{ color: "var(--accent-green)" }} />}
          {intel?.exitSignals ? (
            <span className="text-[9px] font-mono" style={{ color: "var(--accent-orange)" }}>
              {intel.exitSignals}x
            </span>
          ) : null}
          <span className="text-xs font-mono text-text-muted">{t.total_entries}</span>
        </div>
      </div>
      <BullBearBar bull={t.bullish} total={t.bullish + t.bearish} height={6} showLabels={false} />
      <div className="flex items-center justify-between mt-1 text-xs">
        <span
          className="flex items-center gap-0.5"
          style={{ color: net ? "var(--accent-green)" : "var(--accent-red)" }}
        >
          {net ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {net ? "Bullish" : "Bearish"}
        </span>
        <span className="text-text-muted font-mono">{t.net_premium}</span>
      </div>
      {showReturn && (
        <div
          className="mt-1 text-[10px] font-mono flex items-center justify-between"
          title="Premium-weighted P/L across this ticker's flow entries across all available history (delta-estimated). Ranking uses %P/L × entry count — frequency multiplies score, so a ticker with many strong entries outranks single-shot outliers."
        >
          <span className="text-text-muted">
            Flow P/L
            {retEntries !== undefined && retEntries > 0 && (
              <span className="ml-1 text-text-muted opacity-70">n={retEntries}</span>
            )}
          </span>
          <span
            style={{
              color:
                retPct === null
                  ? "var(--text-muted)"
                  : retPct >= 0
                  ? "var(--accent-green)"
                  : "var(--accent-red)",
            }}
          >
            {retPct === null ? "—" : `${retPct >= 0 ? "+" : ""}${retPct.toFixed(1)}%`}
          </span>
        </div>
      )}
      {hasAccum && (
        <div
          className="mt-1 text-[9px] font-mono"
          style={{
            color: accum.includes("BULL")
              ? "var(--accent-green)"
              : accum.includes("BEAR")
              ? "var(--accent-red)"
              : "var(--text-muted)",
          }}
        >
          {accum.replace(/_/g, " ")}
        </div>
      )}
    </div>
  );
}

/**
 * Small earnings-date pill shown under the ticker hero card. Colors track
 * urgency: <=7d orange, <=30d blue, beyond muted.
 */
export function EarningsBadge({
  isoDate,
  session,
}: {
  isoDate: string | null;
  session?: string | null;
}) {
  if (!isoDate) {
    return <span className="text-text-muted italic">No earnings date</span>;
  }
  // Parse the date part as a LOCAL calendar date. `new Date("2026-06-18")`
  // parses as UTC midnight, which renders as the PREVIOUS day in negative-UTC
  // zones (PT, UTC-7) — that's why ACN's 6/18 earnings showed as "Jun 17".
  // Match the single source (ticker_earnings) and the forward calendar, which
  // both treat the date as a local calendar day.
  const [yy, mm, dd] = isoDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(yy, (mm || 1) - 1, dd || 1);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const days = Math.round((dt.getTime() - todayMidnight.getTime()) / 86_400_000);
  const fmt = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const rel = days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? "today" : `in ${days}d`;
  const color =
    days < 0
      ? "var(--text-muted)"
      : days <= 7
      ? "var(--accent-orange)"
      : days <= 30
      ? "var(--accent-blue)"
      : "var(--text-secondary)";
  const bg =
    days < 0
      ? "transparent"
      : days <= 7
      ? "color-mix(in srgb, var(--accent-orange) 12%, transparent)"
      : days <= 30
      ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
      : "var(--border)";
  // Trading session: 'bmo' = before market open (pre-market), 'amc' = after
  // market close (after-hours). Drives a small label + tooltip.
  const sessLabel = session === "bmo" ? "BMO" : session === "amc" ? "AMC" : null;
  const sessTitle =
    session === "bmo"
      ? "Before market open (pre-market)"
      : session === "amc"
      ? "After market close (after-hours)"
      : "";
  return (
    <span
      className="font-mono px-2 py-0.5 rounded text-xs"
      style={{ color, background: bg, border: `1px solid ${color}33` }}
      title={`Next earnings: ${fmt}${sessLabel ? ` · ${sessTitle}` : ""}`}
    >
      EPS {rel} · {fmt}
      {sessLabel && <span className="opacity-75"> · {sessLabel}</span>}
    </span>
  );
}
