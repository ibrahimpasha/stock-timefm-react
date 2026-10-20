/**
 * IntelligencePanelV3 — convergence-first intelligence panel.
 *
 * Three render states driven by the active ticker + its 24h convergence score:
 *   - No ticker             → MARKET BRIEF state (daily brief + cross-ticker
 *                              convergence list + macro calendar)
 *   - Ticker, score >= 2    → TICKER ACTIVE state (today read + 5-source
 *                              signals strip + verdict pill + reaction
 *                              timeline + 14d ticker-scoped calendar)
 *   - Ticker, score <  2    → LOW-SIGNAL state (terse fallback row,
 *                              historical hints)
 *
 * The legacy 8-category IntelligencePanel is mounted inside a collapsible
 * at the bottom for callers who still want the full prose view.
 */
import { useEffect, useState } from "react";
import { QueryNotice } from "../../components/QueryNotice";
import {
  ChevronDown,
  ChevronRight,
  Star,
} from "lucide-react";

import { useAppStore } from "../../store/useAppStore";
import { useTickerEarningsBatch } from "../flow-analyzer/iflow/hooks";
import {
  useCalendar,
} from "../../api/intelV3";
import type {
  CalendarEvent,
} from "../../api/intelV3";
import { IntelligencePanel } from "./IntelligencePanel";

/* ── Constants / helpers ─────────────────────────────────── */

let todayStartMs = (() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
})();

function fmtCalendarDate(iso: string | undefined): string {
  if (!iso) return "";
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  const d = new Date(y, m - 1, day);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${weekday} ${m}/${day}`;
}

/** Days until a YYYY-MM-DD date. Returns 0 for today, positive for future,
 *  negative for past. Used to render a tight `in 5d` countdown next to the
 *  date for urgency. */
function daysUntil(iso: string | undefined): number | null {
  if (!iso) return null;
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return null;
  const target = new Date(y, m - 1, day);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - todayStartMs) / 86_400_000);
  return diff;
}

/** Long-form date with year — used as the tooltip on the short formatted date. */
function fmtCalendarDateFull(iso: string | undefined): string {
  if (!iso) return "";
  const [y, m, day] = iso.split("-").map(Number);
  if (!y || !m || !day) return iso;
  const d = new Date(y, m - 1, day);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** One-line "what does this event mean" lookup keyed by canonical event label.
 *  Used in the calendar row tooltip + inline explainer. */
const EVENT_EXPLAINER: Record<string, string> = {
  CPI: "Consumer Price Index — headline US inflation print. Hot reads pressure growth multiples and re-price the Fed path.",
  PCE: "Personal Consumption Expenditures — the Fed's preferred inflation gauge. Released monthly by the BEA.",
  PPI: "Producer Price Index — wholesale-level inflation. Often leads CPI by a month.",
  FOMC: "Federal Open Market Committee — rate decision + dot plot. The single largest scheduled volatility event.",
  NFP: "Non-Farm Payrolls — US labor report. Beats lift yields and the dollar; misses tend to compress them.",
  JOLTS: "Job Openings & Labor Turnover — labor-market tightness gauge ahead of NFP.",
  OPEC: "OPEC+ meeting — output decisions move crude prices and energy equities.",
  EIA: "EIA crude inventory report — weekly oil supply data point.",
  GDP: "GDP release — quarterly growth print. Sets the macro tape for the week.",
  Retail: "Retail Sales — US consumer-spending pulse.",
};

function explainerFor(label: string): string {
  if (!label) return "";
  const up = label.toUpperCase();
  for (const key of Object.keys(EVENT_EXPLAINER)) {
    if (up.includes(key)) return EVENT_EXPLAINER[key];
  }
  if (/earnings/i.test(label)) return "Quarterly earnings release — the largest scheduled volatility event for this ticker.";
  if (/ex[-\s]?div/i.test(label)) return "Ex-dividend date — holders of record receive the dividend.";
  return "";
}

/** Collapse duplicate events (same date + same label, case-insensitive). The
 *  backend currently emits multiple identical macros from different sources
 *  (e.g. PCE on 6/6 from two intel rows). Pick the highest-weight version. */
function dedupCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Map<string, CalendarEvent>();
  const weight = (w?: number | string) => {
    if (typeof w === "number") return w;
    if (w === "high") return 3;
    if (w === "medium") return 2;
    if (w === "low") return 1;
    return 0;
  };
  for (const ev of events) {
    const key = `${ev.date}__${(ev.label || "").toLowerCase().trim()}`;
    const prev = seen.get(key);
    if (!prev || weight(ev.weight) > weight(prev.weight)) {
      seen.set(key, ev);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/* ── Atomic UI bits ──────────────────────────────────────── */

function SectionHeader({
  label,
  right,
}: {
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <h3 className="section-title">{label}</h3>
      {right ? <p className="section-sub">{right}</p> : null}
    </div>
  );
}

/* ── ForwardCalendar ─────────────────────────────────────── */

function ForwardCalendar({
  events,
  scopedTicker,
  isLoading,
}: {
  events: CalendarEvent[];
  scopedTicker: string | null;
  isLoading?: boolean;
}) {
  const [, setCalendarDay] = useState(0);
  useEffect(() => {
    const refreshDay = () => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const next = now.getTime();
      if (next !== todayStartMs) {
        todayStartMs = next;
        setCalendarDay((value) => value + 1);
      }
    };
    const timer = window.setInterval(refreshDay, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  // Dedup before slicing so the user sees 8 distinct events, not 8 copies
  // of the same macro pulled from multiple intel rows.
  const top = dedupCalendarEvents(events).slice(0, 12);

  // Next-earnings fallback: even when nothing lands inside the 14d window,
  // the scoped ticker's next earnings date is always worth showing.
  const earningsQ = useTickerEarningsBatch(scopedTicker ? [scopedTicker] : []);
  const nextEarnings = scopedTicker
    ? earningsQ.data?.[scopedTicker.toUpperCase()] ?? null
    : null;

  // Leading-dot color per category — macro = blue, ticker = purple,
  // geopolitical = red, earnings = orange.
  const categoryColor = (cat?: string): string => {
    const c = (cat || "").toLowerCase();
    if (c === "ticker") return "var(--accent-purple)";
    if (c === "geopolitical") return "var(--accent-red)";
    if (c === "earnings") return "var(--accent-orange)";
    return "var(--accent-blue)";
  };
  // Only today/tomorrow earn a warning tint; everything else stays muted.
  const urgencyTone = (days: number | null): string =>
    days != null && days <= 1 ? "var(--accent-orange)" : "var(--text-muted)";

  return (
    <section aria-label="Upcoming catalysts">
      <SectionHeader
        label="Upcoming catalysts"
        right={
          <>
            Next <span className="num">14</span> days{scopedTicker ? <> · <span className="num">{scopedTicker}</span></> : null}
          </>
        }
      />
      {isLoading && top.length === 0 ? (
        <div className="space-y-1 animate-pulse">
          <div className="h-3 w-full rounded bg-text-muted/15" />
          <div className="h-3 w-5/6 rounded bg-text-muted/15" />
        </div>
      ) : top.length === 0 ? (
        nextEarnings ? (
          <p className="text-sm text-text-muted">
            No catalysts in window. Next earnings{" "}
            <span className="num text-text-primary">
              {nextEarnings.slice(0, 10)}
            </span>
            {(() => {
              const d = daysUntil(nextEarnings.slice(0, 10));
              return d != null && d > 0 ? ` (in ${d}d)` : "";
            })()}
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            No catalysts in window.
          </p>
        )
      ) : (
        <div className="divide-y divide-border">
          {top.map((ev, i) => {
            const isTickerRow =
              !!scopedTicker && ev.ticker && ev.ticker.toUpperCase() === scopedTicker.toUpperCase();
            const dn = daysUntil(ev.date);
            const explainer = explainerFor(ev.label);
            const inLabel =
              dn == null
                ? ""
                : dn === 0
                  ? "today"
                  : dn === 1
                    ? "tomorrow"
                    : dn < 0
                      ? `${Math.abs(dn)}d ago`
                      : `in ${dn}d`;
            return (
              <div key={`${ev.date}-${i}`} className="data-row flex gap-3 px-2 py-2.5">
                <span
                  aria-hidden
                  className="mt-[8px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: categoryColor(ev.category) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-text-primary">
                      {ev.label}
                      {ev.session && (
                        <span
                          className="font-normal text-text-muted"
                          title={
                            ev.session === "bmo"
                              ? "Before market open (pre-market)"
                              : "After market close (after-hours)"
                          }
                        >
                          {" · "}
                          {ev.session === "bmo" ? "before open" : "after close"}
                        </span>
                      )}
                      {isTickerRow && (
                        <Star size={12} fill="currentColor" className="ml-1.5 inline align-[-1px] text-text-secondary" aria-label="this ticker" />
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-text-muted" title={ev.source ? `Source: ${ev.source}` : undefined}>
                      {ev.category || ev.source || ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 text-xs text-text-muted">
                    <span className="num" title={fmtCalendarDateFull(ev.date)}>{fmtCalendarDate(ev.date)}</span>
                    {inLabel && <span className="num font-medium" style={{ color: urgencyTone(dn) }}>{inLabel}</span>}
                    {explainer && (
                      <span className="min-w-0 flex-1 truncate" title={explainer}>
                        {explainer}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── IntelDetailCollapsible — embeds the legacy 8-cat panel ── */

function IntelDetailCollapsible({ ticker }: { ticker: string | null }) {
  // Default expanded — the Intelligence brief is now the headline value
  // (Perplexity bias chip + reasoning + clean ## sections). Hiding it
  // behind a click was wasted friction.
  const [open, setOpen] = useState(true);
  return (
    <section aria-label="Intel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="section-title flex items-center gap-1.5 text-left transition-opacity hover:opacity-90"
          >
            Intel
            {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
          </button>
          <p className="section-sub">Web-search research brief{open ? "" : " · 8 categories"}</p>
        </div>
      </div>
      {open && (
        <div className="mt-4">
          <IntelligencePanel thesis={null} ticker={ticker || undefined} />
        </div>
      )}
    </section>
  );
}

/* ── Main panel ──────────────────────────────────────────── */

export default function IntelligencePanelV3() {
  const ticker = useAppStore((s) => s.activeTicker);
  // Stripped to the essentials per 2026-05-24 user request: just the
  // ForwardCalendar (deterministic earnings/macro dates) and the
  // IntelDetailCollapsible (bias chip + reasoning + 8-cat brief).
  // Removed: PanelHeader, TodayBlock/TickerBriefBlock, SignalsStrip,
  // ReactionTimeline, ConvergenceList, ThemesBlock, DirectionHint —
  // all were mostly empty/quiet noise on typical tickers.
  // One hook covers both scopes: with no ticker the qs param is omitted and the
  // backend returns the all-tickers calendar. A second unconditional
  // useCalendar(14) here used to poll every 60s with its result discarded.
  const calendarQ = useCalendar(14, ticker || undefined);

  return (
    <div className="flex flex-col gap-9">
      <QueryNotice queries={[calendarQ]} label="Catalyst calendar" />
      {!(calendarQ.isError || calendarQ.fetchStatus === "paused") || calendarQ.data ? <ForwardCalendar
        events={calendarQ.data?.events ?? []}
        scopedTicker={ticker || null}
        isLoading={calendarQ.isLoading && !calendarQ.data}
      /> : null}

      {ticker && <IntelDetailCollapsible ticker={ticker} />}
    </div>
  );
}
