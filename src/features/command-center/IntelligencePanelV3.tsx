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
import { useMemo, useState } from "react";
import {
  Brain,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Newspaper,
  DollarSign,
  Target,
  MessageSquare,
  Activity,
  CalendarDays,
  Star,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { useAppStore } from "../../store/useAppStore";
import { useMarketPrice } from "../../api/forecast";
import {
  useConvergence,
  useConvergenceList,
  useTimeline,
  useCalendar,
  useDailyBrief,
  useTickerBrief,
  useGenerateTickerBrief,
  useGenerateDailyBrief,
} from "../../api/intelV3";
import type {
  ConvergenceResponse,
  ConvergenceSignals,
  ConvergenceListItem,
  TimelineEvent,
  TimelineSource,
  CalendarEvent,
  DailyBrief,
  BriefTheme,
  BriefTicker,
  Alignment,
} from "../../api/intelV3";
import { relativeAge, absoluteAge, formatPremium, changeColor } from "../../lib/utils";
import { IntelligencePanel } from "./IntelligencePanel";

/* ── Constants / helpers ─────────────────────────────────── */

type SourceKey = "news" | "iflow" | "voices" | "traders" | "forecast";

const SOURCE_ORDER: SourceKey[] = ["news", "iflow", "voices", "traders", "forecast"];
const SOURCE_LABELS: Record<SourceKey, string> = {
  news: "News",
  iflow: "iFlow",
  voices: "Voices",
  traders: "Traders",
  forecast: "Forecast",
};

function alignmentColor(a: Alignment | undefined | null): string {
  const v = (a || "").toLowerCase();
  if (v === "bullish") return "var(--accent-green)";
  if (v === "bearish") return "var(--accent-red)";
  if (v === "mixed") return "var(--accent-orange)";
  return "var(--text-muted)";
}

function alignmentArrow(a: Alignment | undefined | null): string {
  const v = (a || "").toLowerCase();
  if (v === "bullish") return "▲";
  if (v === "bearish") return "▼";
  return "·";
}

function labelColor(label: string | undefined | null): string {
  const v = (label || "").toUpperCase();
  if (v === "STRONG") return "var(--accent-green)";
  if (v === "MODERATE") return "var(--accent-blue)";
  if (v === "WEAK") return "var(--accent-orange)";
  return "var(--text-muted)";
}

function timelineRowColor(ev: TimelineEvent): string {
  if (ev.alignment_with_prior === "CONTRARIAN") return "var(--accent-orange)";
  if (typeof ev.sentiment === "number") {
    if (ev.sentiment > 0.15) return "var(--accent-green)";
    if (ev.sentiment < -0.15) return "var(--accent-red)";
  }
  return "var(--text-muted)";
}

function timelineIcon(src: TimelineSource) {
  switch (src) {
    case "news":
      return <Newspaper size={11} />;
    case "iflow":
      return <DollarSign size={11} />;
    case "trader":
      return <Target size={11} />;
    case "voice":
      return <MessageSquare size={11} />;
    default:
      return <Activity size={11} />;
  }
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "";
  const ts = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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

/** Source "strength" → number of filled dots (0-4) used in the SignalsStrip row. */
function sourceStrength(src: SourceKey, signals: ConvergenceSignals | undefined): number {
  if (!signals) return 0;
  const s = signals[src];
  if (!s) return 0;
  if (src === "forecast") {
    const f = signals.forecast;
    if (!f) return 0;
    const topN = Math.abs(f.top_n_pct ?? 0);
    if (topN >= 2) return 4;
    if (topN >= 1) return 3;
    if (topN >= 0.4) return 2;
    if (topN > 0) return 1;
    return 0;
  }
  const count = (s as { count?: number }).count ?? 0;
  if (count >= 4) return 4;
  if (count >= 2) return 3;
  if (count >= 1) return 2;
  return 0;
}

/** Direction inferred from a source's payload — drives the row's dot color. */
function sourceDirectionColor(src: SourceKey, signals: ConvergenceSignals | undefined): string {
  if (!signals) return "var(--text-muted)";
  if (src === "news") {
    const s = signals.news?.net_sentiment ?? 0;
    if (s > 0.15) return "var(--accent-green)";
    if (s < -0.15) return "var(--accent-red)";
    return "var(--text-muted)";
  }
  if (src === "iflow") {
    const side = (signals.iflow?.side || "").toUpperCase();
    if (side === "CALL") return "var(--accent-green)";
    if (side === "PUT") return "var(--accent-red)";
    return "var(--text-muted)";
  }
  if (src === "voices") {
    const v = signals.voices;
    if (!v) return "var(--text-muted)";
    const bull = v.bullish ?? 0;
    const bear = v.bearish ?? 0;
    if (bull > bear) return "var(--accent-green)";
    if (bear > bull) return "var(--accent-red)";
    return "var(--text-muted)";
  }
  if (src === "traders") {
    const t = signals.traders;
    if (!t) return "var(--text-muted)";
    if ((t.opens ?? 0) > (t.closes ?? 0)) return "var(--accent-green)";
    if ((t.closes ?? 0) > (t.opens ?? 0)) return "var(--accent-red)";
    return "var(--text-muted)";
  }
  if (src === "forecast") {
    return alignmentColor(signals.forecast?.direction);
  }
  return "var(--text-muted)";
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

function StrengthDots({ strength, color }: { strength: number; color: string }) {
  const full = Math.max(0, Math.min(4, strength));
  return (
    <span className="inline-flex gap-0.5 font-mono text-[10px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            color: i < full ? color : "var(--text-muted)",
            opacity: i < full ? 1 : 0.35,
          }}
        >
          ●
        </span>
      ))}
    </span>
  );
}

function VerdictPill({
  score,
  alignment,
  label,
}: {
  score: number;
  alignment: Alignment;
  label: string;
}) {
  const color = labelColor(label);
  const alignTxt = (alignment || "").toLowerCase();
  return (
    <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border">
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-mono font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Convergence
        </span>
        <span className="text-xs font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
          {score}/5
        </span>
        {alignTxt && (
          <span
            className="text-[10px] font-mono uppercase"
            style={{ color: alignmentColor(alignment) }}
          >
            {alignTxt}
          </span>
        )}
      </div>
      <span
        className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
        style={{
          color,
          background: `color-mix(in srgb, ${color} 12%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        }}
      >
        {label || "QUIET"}
      </span>
    </div>
  );
}

/* ── Header ──────────────────────────────────────────────── */

function PanelHeader({
  ticker,
  lastRefreshIso,
  onRefresh,
  refreshing,
}: {
  ticker: string | null;
  lastRefreshIso: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { data: marketPrice } = useMarketPrice(ticker || "");
  const ageLabel = relativeAge(lastRefreshIso);
  const ageTitle = absoluteAge(lastRefreshIso);
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Brain size={14} className="text-accent-purple shrink-0" />
        <span
          className="text-xs font-mono font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          INTEL
        </span>
        {ticker ? (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-xs font-mono font-semibold text-accent-blue">{ticker}</span>
            {marketPrice && (
              <span className="text-xs font-mono ml-1" style={{ color: "var(--text-primary)" }}>
                ${marketPrice.price.toFixed(2)}
                <span
                  className="ml-1"
                  style={{ color: changeColor(marketPrice.change_pct) }}
                >
                  {marketPrice.change_pct >= 0 ? "+" : ""}
                  {marketPrice.change_pct.toFixed(2)}%
                </span>
              </span>
            )}
          </>
        ) : (
          <>
            <span className="text-text-muted">·</span>
            <span className="text-xs font-mono uppercase" style={{ color: "var(--text-primary)" }}>
              Market Brief
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {ageLabel && (
          <span
            className="text-[10px] font-mono"
            style={{ color: "var(--text-muted)" }}
            title={ageTitle ? `Last update ${ageTitle}` : undefined}
          >
            updated {ageLabel}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1 rounded text-accent-blue hover:bg-accent-blue/10 border border-accent-blue/30 transition-colors disabled:opacity-50"
            title="Re-run today's market brief synthesis"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── TodayBlock ──────────────────────────────────────────── */

function TodayBlock({
  text,
  isLoading,
  onGenerate,
  generating,
}: {
  text: string | null;
  isLoading?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  return (
    <section className="mb-3 pb-3 border-b border-border">
      <SectionHeader label="Today" />
      {isLoading && !text ? (
        <div className="space-y-1.5 animate-pulse">
          <div className="h-3 w-full rounded bg-text-muted/15" />
          <div className="h-3 w-4/5 rounded bg-text-muted/15" />
        </div>
      ) : text ? (
        <p
          className="text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-secondary)" }}
        >
          {text}
        </p>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No synthesized read available.
        </p>
      )}
      {onGenerate && (
        <button
          onClick={onGenerate}
          disabled={generating}
          className="mt-2 text-xs px-2 py-1 rounded border border-border hover:bg-bg-card-hover transition-colors disabled:opacity-50"
          style={{ color: "var(--accent-purple)" }}
        >
          {generating ? "Generating..." : "Generate brief"}
        </button>
      )}
    </section>
  );
}

/* ── TickerBriefBlock ─────────────────────────────────────── */
// Rich per-ticker brief render: headline + narrative + watch-for bullets.
// Replaces the generic TodayBlock when a per-ticker brief is cached.

function TickerBriefBlock({
  brief,
  onRegenerate,
  regenerating,
}: {
  brief: { headline?: string; narrative?: string; watch_for?: string[];
           generated_at?: string; convergence_label?: string };
  onRegenerate: () => void;
  regenerating?: boolean;
}) {
  return (
    <section className="mb-3 pb-3 border-b border-border">
      <div className="flex items-center justify-between mb-1.5">
        <SectionHeader label="Today" />
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="text-[10px] uppercase tracking-wide text-text-muted hover:text-accent-purple transition-colors disabled:opacity-50"
          title="regenerate brief"
        >
          {regenerating ? "..." : "regen"}
        </button>
      </div>
      {brief.headline && (
        <p
          className="text-sm font-semibold leading-snug mb-1.5"
          style={{ color: "var(--text-primary)" }}
        >
          {brief.headline}
        </p>
      )}
      {brief.narrative && (
        <p
          className="text-xs leading-relaxed whitespace-pre-wrap"
          style={{ color: "var(--text-secondary)" }}
        >
          {brief.narrative}
        </p>
      )}
      {brief.watch_for && brief.watch_for.length > 0 && (
        <div className="mt-2">
          <div
            className="text-[10px] uppercase tracking-wide mb-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            Watch for
          </div>
          <ul className="text-xs space-y-0.5">
            {brief.watch_for.map((w, i) => (
              <li
                key={i}
                className="pl-3 leading-snug relative before:absolute before:left-0 before:content-['—']"
                style={{ color: "var(--text-secondary)" }}
              >
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ── SignalsStrip ────────────────────────────────────────── */

function SignalRowText({ src, signals }: { src: SourceKey; signals: ConvergenceSignals | undefined }) {
  if (!signals) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  if (src === "news") {
    const n = signals.news;
    if (!n || n.count === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
    const sent = n.net_sentiment ?? 0;
    const arrow = sent > 0.15 ? "↗" : sent < -0.15 ? "↘" : "·";
    const sign = sent >= 0 ? "+" : "";
    return (
      <span>
        {n.count} items · net sent {sign}
        {sent.toFixed(2)} {arrow}
      </span>
    );
  }
  if (src === "iflow") {
    const f = signals.iflow;
    if (!f || f.count === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
    const parts: string[] = [];
    if (f.premium_usd) parts.push(formatPremium(f.premium_usd));
    if (f.side) parts.push(String(f.side).toUpperCase());
    if (typeof f.avg_ask_pct === "number") parts.push(`${(f.avg_ask_pct * 100).toFixed(0)}%ask`);
    return <span>{parts.join(" · ") || `${f.count} entries`}</span>;
  }
  if (src === "voices") {
    const v = signals.voices;
    if (!v || v.count === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
    const who = (v.authors ?? []).slice(0, 2).join("+") || `${v.count} mentions`;
    const dir =
      (v.bullish ?? 0) > (v.bearish ?? 0)
        ? `bullish ${v.bullish}/${v.count}`
        : (v.bearish ?? 0) > (v.bullish ?? 0)
          ? `bearish ${v.bearish}/${v.count}`
          : `mixed ${v.count}`;
    return <span>{who} · {dir}</span>;
  }
  if (src === "traders") {
    const t = signals.traders;
    if (!t || t.count === 0) return <span style={{ color: "var(--text-muted)" }}>—</span>;
    const who = (t.authors ?? []).slice(0, 2).join("+") || "trader";
    const parts: string[] = [who];
    if ((t.opens ?? 0) > 0) parts.push(`${t.opens} open${t.opens === 1 ? "" : "s"}`);
    if ((t.closes ?? 0) > 0) parts.push(`${t.closes} close${t.closes === 1 ? "" : "s"}`);
    return <span>{parts.join(" · ")}</span>;
  }
  // forecast
  const f = signals.forecast;
  if (!f || typeof f.top_n_pct !== "number") {
    return <span style={{ color: "var(--text-muted)" }}>—</span>;
  }
  const sign = f.top_n_pct >= 0 ? "+" : "";
  const arrow = f.top_n_pct > 0.1 ? "↗" : f.top_n_pct < -0.1 ? "↘" : "·";
  const horizon = f.horizon ? `${f.horizon}d` : "";
  const agree = f.agreement ? ` ${f.agreement}` : "";
  return (
    <span>
      TopN {sign}
      {f.top_n_pct.toFixed(2)}% {horizon ? `(${horizon})` : ""}
      {agree} {arrow}
    </span>
  );
}

function SignalsStrip({
  convergence,
  windowHours,
  showHistoricalHint,
}: {
  convergence: ConvergenceResponse | undefined;
  windowHours: number;
  showHistoricalHint?: boolean;
}) {
  const signals = convergence?.signals;
  return (
    <section className="mb-3 pb-3 border-b border-border">
      <SectionHeader label={`Signals · last ${windowHours}h`} />
      <div className="space-y-1">
        {SOURCE_ORDER.map((src) => {
          const strength = sourceStrength(src, signals);
          const color = sourceDirectionColor(src, signals);
          const muted = strength === 0;
          return (
            <div
              key={src}
              className="grid items-center gap-2 text-xs"
              style={{ gridTemplateColumns: "64px 50px 1fr" }}
            >
              <span
                className="font-mono"
                style={{ color: muted ? "var(--text-muted)" : "var(--text-secondary)" }}
              >
                {SOURCE_LABELS[src]}
              </span>
              <StrengthDots strength={strength} color={color} />
              <span
                className="font-mono truncate"
                style={{ color: muted ? "var(--text-muted)" : "var(--text-primary)" }}
              >
                {showHistoricalHint && muted && src === "iflow" ? "(historical)" : null}
                <SignalRowText src={src} signals={signals} />
              </span>
            </div>
          );
        })}
      </div>
      {convergence && (
        <VerdictPill
          score={convergence.convergence?.score ?? 0}
          alignment={convergence.convergence?.alignment ?? "neutral"}
          label={convergence.convergence?.label ?? "QUIET"}
        />
      )}
    </section>
  );
}

/* ── ReactionTimeline ────────────────────────────────────── */

function ReactionTimeline({
  events,
  isLoading,
}: {
  events: TimelineEvent[];
  isLoading?: boolean;
}) {
  const top = events.slice(0, 8);
  return (
    <section className="mb-3 pb-3 border-b border-border">
      <SectionHeader label="Reaction Timeline" />
      {isLoading && top.length === 0 ? (
        <div className="space-y-1 animate-pulse">
          <div className="h-3 w-full rounded bg-text-muted/15" />
          <div className="h-3 w-5/6 rounded bg-text-muted/15" />
          <div className="h-3 w-4/6 rounded bg-text-muted/15" />
        </div>
      ) : top.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No events in window.
        </p>
      ) : (
        <div className="space-y-1">
          {top.map((ev, i) => {
            const color = timelineRowColor(ev);
            const alignTag = ev.alignment_with_prior;
            return (
              <div
                key={`${ev.ts}-${i}`}
                className="grid items-start gap-2 text-xs"
                style={{ gridTemplateColumns: "44px 18px 1fr auto" }}
              >
                <span className="font-mono" style={{ color: "var(--text-muted)" }}>
                  {fmtTime(ev.ts)}
                </span>
                <span className="mt-[2px]" style={{ color }}>
                  {timelineIcon(ev.source)}
                </span>
                <span className="truncate" style={{ color: "var(--text-primary)" }}>
                  {ev.headline || ev.label}
                </span>
                <span className="font-mono text-[10px]" style={{ color }}>
                  {alignTag === "ALIGNED"
                    ? "ALIGNED"
                    : alignTag === "CONTRARIAN"
                      ? "FADE"
                      : typeof ev.sentiment === "number"
                        ? `${ev.sentiment >= 0 ? "+" : ""}${ev.sentiment.toFixed(2)}`
                        : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
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
                  background: "rgba(13,17,23,0.4)",
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

/* ── ConvergenceList (market-brief state) ───────────────── */

function ConvergenceList({
  items,
  isLoading,
  onPickTicker,
}: {
  items: ConvergenceListItem[];
  isLoading?: boolean;
  onPickTicker: (t: string) => void;
}) {
  const top = items.slice(0, 6);
  return (
    <section className="mb-3 pb-3 border-b border-border">
      <SectionHeader
        label="Convergence Tickers · last 24h"
        right={
          <Sparkles size={11} style={{ color: "var(--text-muted)" }} />
        }
      />
      {isLoading && top.length === 0 ? (
        <div className="space-y-1 animate-pulse">
          <div className="h-3 w-full rounded bg-text-muted/15" />
          <div className="h-3 w-5/6 rounded bg-text-muted/15" />
        </div>
      ) : top.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No tickers with multi-source convergence in window.
        </p>
      ) : (
        <div className="space-y-1">
          {top.map((it) => {
            const color = alignmentColor(it.alignment);
            const warn = (it.label || "").toUpperCase() === "WEAK" || it.alignment === "mixed";
            const arrow = alignmentArrow(it.alignment);
            const sources = it.count_by_source || {};
            const blurb = Object.entries(sources)
              .filter(([, v]) => v > 0)
              .slice(0, 3)
              .map(([k, v]) => `${v} ${k}`)
              .join(" · ");
            return (
              <button
                key={it.ticker}
                type="button"
                onClick={() => onPickTicker(it.ticker)}
                className="w-full grid items-center gap-2 text-xs rounded px-1.5 py-1 hover:bg-bg-card-hover transition-colors text-left"
                style={{ gridTemplateColumns: "18px 60px 1fr 40px" }}
                title={`Open ${it.ticker}`}
              >
                <span style={{ color: warn ? "var(--accent-orange)" : color }}>
                  {warn ? <AlertTriangle size={11} /> : arrow}
                </span>
                <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                  {it.ticker}
                </span>
                <span className="font-mono truncate" style={{ color: "var(--text-secondary)" }}>
                  {blurb || `${it.score}/5 ${it.alignment}`}
                </span>
                <span
                  className="text-[9px] font-mono font-bold uppercase tracking-wider text-right"
                  style={{ color: labelColor(it.label) }}
                >
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── ThemesBlock (market-brief state) ───────────────────── */

function ThemesBlock({ themes }: { themes: BriefTheme[] }) {
  if (!themes || themes.length === 0) return null;
  return (
    <section className="mb-3 pb-3 border-b border-border">
      <SectionHeader label="Today's Themes" />
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
        {themes.slice(0, 8).map((t, i) => {
          const name = (t.theme as string) || "";
          if (!name) return null;
          const count = typeof t.count === "number" ? t.count : null;
          return (
            <span key={`${name}-${i}`} className="font-mono" style={{ color: "var(--text-secondary)" }}>
              {name}
              {count != null && (
                <span style={{ color: "var(--text-muted)" }}> ({count})</span>
              )}
              {i < Math.min(7, themes.length - 1) ? (
                <span className="ml-2" style={{ color: "var(--text-muted)" }}>·</span>
              ) : null}
            </span>
          );
        })}
      </div>
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

/* ── Brief-narrative extraction ──────────────────────────── */

/** Try to pull a per-ticker narrative line out of the daily brief for the
 *  TodayBlock when a ticker is active. */
function tickerNarrativeFromBrief(
  brief: DailyBrief | undefined,
  ticker: string,
): string | null {
  if (!brief || brief.exists === false) return null;
  const tk = ticker.toUpperCase();
  const list = brief.top_tickers || [];
  for (const row of list) {
    const rowTicker = (row.ticker as string | undefined)?.toUpperCase();
    if (rowTicker === tk) {
      const note = (row.narrative as string | undefined) || "";
      if (note.trim()) return note.trim();
    }
  }
  return null;
}

/** Friendly one-liner when no brief-narrative exists for this ticker. */
function convergenceOneLine(c: ConvergenceResponse | undefined): string {
  if (!c) return "";
  const v = c.convergence;
  if (!v) return "";
  const align = (v.alignment || "").toLowerCase();
  const label = (v.label || "").toUpperCase();
  if (label === "STRONG") {
    return `${v.score}/5 sources aligned ${align} — strong convergence.`;
  }
  if (label === "MODERATE") {
    return `${v.score}/5 sources lean ${align}.`;
  }
  if (label === "WEAK") {
    return `Only ${v.score}/5 sources active — weak signal.`;
  }
  return "No live signal in window.";
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

/** Subtle bottom-of-panel direction reminder — keeps TrendingUp/Down imports
 *  active and gives a single-glance summary even when the user scrolls past
 *  the verdict pill. */
function DirectionHint({
  convergence,
  visible,
}: {
  convergence: ConvergenceResponse | undefined;
  visible: boolean;
}) {
  if (!visible || !convergence) return null;
  const a = (convergence.convergence?.alignment || "").toLowerCase();
  if (a !== "bullish" && a !== "bearish") return null;
  const color = alignmentColor(a);
  const Icon = a === "bullish" ? TrendingUp : TrendingDown;
  return (
    <div
      className="flex items-center gap-1.5 text-[10px] font-mono mt-1"
      style={{ color }}
      aria-hidden
    >
      <Icon size={11} />
      <span className="uppercase tracking-wider">{a}</span>
    </div>
  );
}
