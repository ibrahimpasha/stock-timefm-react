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
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Star,
} from "lucide-react";

import { useAppStore } from "../../store/useAppStore";
import {
  useCalendar,
} from "../../api/intelV3";
import type {
  CalendarEvent,
} from "../../api/intelV3";
import { IntelligencePanel } from "./IntelligencePanel";

/* ── Constants / helpers ─────────────────────────────────── */

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
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
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
    <div className="flex items-center justify-between mb-2">
      <span
        className="text-[10px] font-mono font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
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
  // Dedup before slicing so the user sees 8 distinct events, not 8 copies
  // of the same macro pulled from multiple intel rows.
  const top = dedupCalendarEvents(events).slice(0, 12);

  // Lightweight color hint per category — macro = blue, ticker = purple,
  // geopolitical = red. Helps glanceability when several categories mix.
  const categoryColor = (cat?: string): string => {
    const c = (cat || "").toLowerCase();
    if (c === "ticker") return "var(--accent-purple, #c084fc)";
    if (c === "geopolitical") return "var(--accent-red)";
    if (c === "earnings") return "var(--accent-orange)";
    return "var(--accent-blue)";
  };
  const urgencyTone = (days: number | null): string => {
    if (days == null) return "var(--text-muted)";
    if (days <= 1) return "var(--accent-red)";
    if (days <= 3) return "var(--accent-orange)";
    if (days <= 7) return "var(--accent-blue)";
    return "var(--text-muted)";
  };

  return (
    <section className="mb-3 pb-3 border-b border-border">
      <SectionHeader
        label={scopedTicker ? `Next 14d · ${scopedTicker}` : "Next 14d"}
        right={
          <CalendarDays size={11} style={{ color: "var(--text-muted)" }} />
        }
      />
      {isLoading && top.length === 0 ? (
        <div className="space-y-1 animate-pulse">
          <div className="h-3 w-full rounded bg-text-muted/15" />
          <div className="h-3 w-5/6 rounded bg-text-muted/15" />
        </div>
      ) : top.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No catalysts in window.
        </p>
      ) : (
        <div className="space-y-1.5">
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
              <div
                key={`${ev.date}-${i}`}
                className="rounded px-2 py-1.5"
                style={{
                  background: "color-mix(in srgb, var(--bg-card) 40%, transparent)",
                  borderLeft: `2px solid ${categoryColor(ev.category)}`,
                }}
              >
                <div className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: "78px 1fr auto auto" }}>
                  <span
                    className="font-mono"
                    style={{ color: "var(--text-primary)" }}
                    title={fmtCalendarDateFull(ev.date)}
                  >
                    {fmtCalendarDate(ev.date)}
                  </span>
                  <span className="truncate font-semibold" style={{ color: "var(--text-primary)" }}>
                    {ev.label}
                    {ev.session && (
                      <span
                        className="font-normal opacity-70"
                        title={
                          ev.session === "bmo"
                            ? "Before market open (pre-market)"
                            : "After market close (after-hours)"
                        }
                      >
                        {" · "}
                        {ev.session === "bmo" ? "BMO" : "AMC"}
                      </span>
                    )}
                  </span>
                  <span
                    className="font-mono text-[10px] uppercase whitespace-nowrap"
                    style={{ color: urgencyTone(dn) }}
                    title={fmtCalendarDateFull(ev.date)}
                  >
                    {inLabel}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-wider px-1 py-px rounded"
                    style={{
                      color: categoryColor(ev.category),
                      background: `${categoryColor(ev.category)}14`,
                    }}
                    title={ev.source ? `Source: ${ev.source}` : undefined}
                  >
                    {ev.category || ev.source || ""}
                  </span>
                  {isTickerRow && (
                    <span style={{ color: "var(--accent-orange)" }}>
                      <Star size={11} fill="currentColor" />
                    </span>
                  )}
                </div>
                {explainer && (
                  <div
                    className="text-[10.5px] leading-snug mt-0.5 pl-[80px] truncate"
                    style={{ color: "var(--text-muted)" }}
                    title={explainer}
                  >
                    {explainer}
                  </div>
                )}
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
    <section className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-wider py-1 hover:bg-bg-card-hover rounded transition-colors"
        style={{ color: "var(--text-secondary)" }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Intel Detail (8 categories)
        <span
          className="ml-auto text-[10px] font-normal normal-case"
          style={{ color: "var(--text-muted)" }}
        >
          {open ? "hide" : "click to expand"}
        </span>
      </button>
      {open && (
        <div className="mt-2">
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
  const calendarTickerQ = useCalendar(14, ticker || undefined);
  const calendarAllQ = useCalendar(14);

  return (
    <div className="card" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
      {ticker ? (
        <ForwardCalendar
          events={calendarTickerQ.data?.events ?? []}
          scopedTicker={ticker}
          isLoading={calendarTickerQ.isLoading && !calendarTickerQ.data}
        />
      ) : (
        <ForwardCalendar
          events={calendarAllQ.data?.events ?? []}
          scopedTicker={null}
          isLoading={calendarAllQ.isLoading && !calendarAllQ.data}
        />
      )}

      {ticker && <IntelDetailCollapsible ticker={ticker} />}
    </div>
  );
}
