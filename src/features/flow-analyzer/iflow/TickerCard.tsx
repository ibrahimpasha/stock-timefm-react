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

  const sideColor = net ? "var(--accent-green)" : "var(--accent-red)";

  return (
    <div
      title={highlightTitle}
      className="card card-interactive relative flex min-h-[5.5rem] min-w-0 flex-col overflow-hidden px-3 py-2.5 text-left"
      style={{
        borderColor: selected ? "var(--accent-blue)" : undefined,
        background: selected ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)" : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => toggleWatchlist(t.ticker)}
        className="absolute left-1 top-1 z-10 min-h-11 min-w-11 rounded transition-colors hover:bg-bg-card-hover lg:left-2 lg:top-2 lg:min-h-6 lg:min-w-6"
        title={watched ? "Remove from watchlist" : "Add to watchlist"}
        aria-label={watched ? `Remove ${t.ticker} from watchlist` : `Add ${t.ticker} to watchlist`}
        aria-pressed={watched}
      >
        <Star
          size={12}
          className="mx-auto"
          aria-hidden="true"
          style={{
            color: watched ? "var(--accent-orange)" : "var(--text-muted)",
            fill: watched ? "var(--accent-orange)" : "none",
            opacity: watched ? 1 : 0.5,
          }}
        />
      </button>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        aria-pressed={selected}
        aria-label={`Select ${t.ticker}, ${net ? "bullish" : "bearish"}, ${t.total_entries} entries`}
        className="flex min-h-11 w-full min-w-0 flex-1 flex-col gap-1.5 text-left lg:min-h-6"
      >
        <div className="flex items-baseline justify-between gap-2 pl-5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="num truncate text-sm font-semibold text-text-primary">{t.ticker}</span>
            {lit && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--accent-green)" }}
                aria-label={highlightTitle || "highlighted"}
              />
            )}
          </span>
          <span className="num text-xs text-text-muted" title={`${t.total_entries} entries`}>
            {t.total_entries}
          </span>
        </div>
        <BullBearBar bull={t.bullish} total={t.bullish + t.bearish} height={4} showLabels={false} />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1" style={{ color: sideColor }}>
            {net ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {net ? "Bullish" : "Bearish"}
          </span>
          <span className="num text-text-secondary">{t.net_premium}</span>
        </div>
        {(showReturn || hasAccum || esc || intel?.exitSignals || (voicesIntel && voicesIntel.mentions > 0)) && (
          <div className="mt-auto flex items-center justify-between gap-2 text-xs text-text-muted">
            <span className="flex min-w-0 items-center gap-2">
              {showReturn ? (
                <span
                  className="num"
                  title="Premium-weighted P/L across this ticker's flow entries across all available history (delta-estimated). Ranking uses %P/L × entry count — frequency multiplies score, so a ticker with many strong entries outranks single-shot outliers."
                >
                  P/L{" "}
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
                  {retEntries !== undefined && retEntries > 0 && <span> · n={retEntries}</span>}
                </span>
              ) : hasAccum ? (
                <span className="truncate" title={accum.replace(/_/g, " ")}>
                  {accum.replace(/_/g, " ").toLowerCase()}
                </span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {voicesIntel && voicesIntel.mentions > 0 && (
                <span
                  className="num inline-flex items-center gap-0.5"
                  style={{
                    color:
                      voicesIntel.bullish > voicesIntel.bearish
                        ? "var(--accent-green)"
                        : voicesIntel.bearish > voicesIntel.bullish
                        ? "var(--accent-red)"
                        : "var(--text-muted)",
                  }}
                  title={`Tracked voices: ${voicesIntel.mentions} mention${voicesIntel.mentions === 1 ? "" : "s"} in last 7d (${voicesIntel.bullish}↑ ${voicesIntel.bearish}↓)`}
                >
                  <Mic2 size={11} />
                  {voicesIntel.mentions}
                </span>
              )}
              {esc && (
                <span title="Strikes escalating">
                  <TrendingUp size={11} style={{ color: "var(--accent-green)" }} />
                </span>
              )}
              {intel?.exitSignals ? (
                <span className="num" style={{ color: "var(--accent-orange)" }} title="Exit signals">
                  {intel.exitSignals}x
                </span>
              ) : null}
            </span>
          </div>
        )}
      </div>
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
    return <span className="text-xs text-text-muted">No earnings date</span>;
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
      className="num text-xs"
      style={{ color }}
      title={`Next earnings: ${fmt}${sessLabel ? ` · ${sessTitle}` : ""}`}
    >
      Earnings {rel} · {fmt}
      {sessLabel && <span className="text-text-muted"> · {sessLabel}</span>}
    </span>
  );
}
