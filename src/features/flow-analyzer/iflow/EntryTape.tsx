/**
 * EntryTape — chronological feed of every iFlow entry on the selected date,
 * one row per entry, newest first. Built as the answer to "just show me
 * everything that came in today" without the per-ticker aggregation the
 * grid view does. Used as an alternate view mode inside IFlowTracker.
 *
 * Each row is dense by design:
 *   HH:MM:SS · TICKER · [BULL/BEAR] · "call buying" · $135 CALL 12/18 · LEAP ·
 *   2.7× vol/OI · 78% ask · +4.4% moneyness · $231K premium
 *
 * Filters that come from IFlowTracker (bias / DTE / search / tradersOnly)
 * are applied here too — passed in as props so the parent stays the single
 * source of truth for filter UI.
 */
import { useMemo } from "react";
import { QueryNotice } from "../../../components/QueryNotice";
import { useMultiDateEntries, useTickerPricesBatch } from "./hooks";
import { estimateOptionPnl } from "./estimator";
import type { BiasFilter, DteFilter } from "./types";
import { dteTag, parsePremium } from "./utils";
import { formatPremium } from "../../../lib/utils";
import { daysFromToday } from "../../../lib/dateOnly";
import { optionIntent, type OptionDirection } from "../../../lib/optionContract";
import { useTickerMeta, type TickerMeta } from "../../../api/tickerMeta";
import { useTickerTechnicals, type TickerTechnical } from "../../../api/tickerTechnicals";
import { useTickerGex, type TickerGex } from "../../../api/tickerGex";
import { wallTilt } from "../../gex/GexWall";
import { useDashboardFilters } from "../../../store/useDashboardFilters";
import { ChevronUp, ChevronDown, Activity, Sparkles } from "lucide-react";
import { Tile } from "../../../components/Cockpit";

/** Subset of the backend's INDEX_ETFS blacklist — must match
 *  src/notable_score.py::INDEX_ETFS so the frontend Kian filter agrees
 *  with the backend's `structural` component. Update both in lockstep. */
const KIAN_ETF_BLACKLIST = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "IVV",
  "VIX", "VXX", "UVXY", "SVXY",
  "TLT", "IEF", "SHY", "HYG", "LQD",
  "GLD", "SLV", "USO", "UNG",
  "XLF", "XLK", "XLE", "XLV", "XLI", "XLB", "XLP", "XLY", "XLU", "XLRE",
  "EEM", "EFA", "EZU", "FXI",
  "ARKK", "ARKW", "ARKF",
  "TQQQ", "SQQQ", "SOXL", "SOXS", "TSLL", "NVDL", "NVDS", "AMDL", "AMDS",
  "TZA", "FNGU", "FNGD", "BOIL", "KOLD", "QLD",
]);

/** Replication of @kiantrades' "Notable Flow" tweet selection logic
 *  (reverse-engineered from his posts — see CLAUDE.md "Notable Flow
 *  Scoring" section for the comparison vs the algorithmic score).
 *  Pure rule-based pass/fail, not a score. */
function passesKianFilter(entry: {
  ticker: string;
  type?: string;
  premium: number;
  ask_pct: number | null;
  dte: number | null;
}): boolean {
  // Premium floor — most of his picks are >$500K, smallest ~$261K.
  if (!entry.premium || entry.premium < 300_000) return false;
  // ETF / leveraged blacklist
  if (KIAN_ETF_BLACKLIST.has(entry.ticker.toUpperCase())) return false;
  // DTE band — 7d minimum (no 0-DTE lottery), 400d max (no rare LEAPs)
  if (entry.dte == null || entry.dte < 7 || entry.dte > 400) return false;
  // Directional clarity — 3 patterns he calls out:
  //   1. Call buying (CALL + ask% >= 55)
  //   2. Put STO / vol selling (PUT + ask% < 40) — bullish
  //   3. OTM put buying (PUT + ask% >= 60) — bearish hedge
  const type = (entry.type || "").toUpperCase();
  const ask = entry.ask_pct ?? 50;
  if (type.includes("CALL")) return ask >= 55;
  if (type.includes("PUT")) return ask < 40 || ask >= 60;
  return false;
}

/** The Flowseidon "kian" rule filter and the deep-OTM outlier filter are mutually
 *  exclusive; clicking either clears the other. */
type FilterMode = "none" | "kian" | "outliers";

/** % the strike sits out-of-the-money — positive = OTM for BOTH calls and
 *  puts, negative = in-the-money. The deeper OTM, the more convex / lottery-
 *  like the bet (a 40C on a $13 stock = +208%). Null when we can't price it.
 *  Single source for the row-level moneyness AND the outlier filter/count. */
function entryMoneyness(e: Record<string, unknown>): number | null {
  const underlying = Number(e.underlying_price ?? 0);
  const strike = Number(e.strike ?? 0);
  if (!(underlying > 0) || !(strike > 0)) return null;
  let m = ((strike - underlying) / underlying) * 100;
  if (normalizeOptType(e.type ?? e.option_type) === "PUT") m = -m;
  return m;
}

/** Normalize the LLM-parsed type field. Our entries sometimes carry "C"
 *  / "P" / "CALL" / "PUT" — same contract, different label. Collapse to
 *  CALL/PUT so dedup + aggregation by `(ticker, type, strike, expiry)`
 *  actually catches the splits (e.g. SHLS has 2 prints of CALL $15 7/17:
 *  one labeled "CALL" $1.28M, one labeled "C" $667K. Cumulative $1.95M).
 *  Anything we can't classify falls through unchanged. */
function normalizeOptType(t: unknown): string {
  const s = String(t || "").toUpperCase().trim();
  if (s.includes("CALL") || s === "C") return "CALL";
  if (s.includes("PUT") || s === "P") return "PUT";
  return s;
}

/** Sortable column keys. `time` is always lex-sorted on the raw timestamp
 *  string; everything else extracts the obvious comparable value (numeric
 *  where it makes sense, alphabetic otherwise). Headers expose all of
 *  these — clicking a column toggles direction; clicking another column
 *  switches to it with that column's default direction. */
type SortKey =
  | "time" | "ticker" | "side" | "action" | "contract"
  | "dte" | "ern" | "voi" | "ask" | "atm" | "premium" | "pnl"
  | "setup";
type SortDir = "asc" | "desc";

/** Default direction when first clicking a column. Numeric / time columns
 *  default to DESC ("biggest first"); text columns default to ASC. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  time: "desc", ticker: "asc", side: "asc", action: "asc", contract: "asc",
  dte: "desc", ern: "asc", voi: "desc", ask: "desc", atm: "desc", premium: "desc",
  pnl: "desc", setup: "desc",
};

function SortHeaderButton({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  className,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  className: string;
  onSort: (key: SortKey) => void;
}) {
  const active = activeSortKey === sortKey;
  const Arrow = sortDir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`${className} flex shrink-0 items-center gap-0.5 select-none cursor-pointer whitespace-nowrap hover:text-text-primary transition-colors`}
      style={{ color: active ? "var(--accent)" : undefined }}
      title={`Sort by ${label}`}
    >
      <span>{label}</span>
      {active && <Arrow size={11} strokeWidth={2.5} />}
    </button>
  );
}

const _clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** SETUP — does the *underlying's* fundamental/technical picture AGREE with
 *  the direction THIS options bet is making? Unlike a score that grades the
 *  option-contract quality, direction-agnostic), this is a per-ticker DIRECTIONAL
 *  agreement score, aligned to the entry's Bull/Bear side:
 *
 *    100 = analyst target + chart pattern + technical trend all back this
 *          trade's direction (a tailwind);  50 = neutral / no data;
 *      0 = the underlying setup fights the trade (a Double Top under a bullish
 *          call, etc. — a headwind).
 *
 *  Weights: technical .40, chart pattern .35, analyst target .25 (target is
 *  lighter — it lags and has partial coverage). Heuristic CONTEXT, not an
 *  empirically-calibrated predictor — read it as a convergence flag. */
function setupScore(
  side: OptionDirection | undefined,
  m: TickerMeta | undefined,
  t: TickerTechnical | undefined,
  g?: TickerGex | undefined,
): { score: number | null; tech: number | null; pat: number | null; tgt: number | null; gex: number | null; bull: number } {
  if (!side || side === "Unknown") return { score: null, tech: null, pat: null, tgt: null, gex: null, bull: 0 };
  const comps: { v: number; w: number }[] = [];
  let tech: number | null = null;
  let pat: number | null = null;
  let tgt: number | null = null;
  let gex: number | null = null;
  if (t && typeof t.tech_score === "number") {
    tech = _clamp(t.tech_score / 100, -1, 1);
    comps.push({ v: tech, w: 0.35 });
  }
  if (t && t.pattern && t.pattern_strength) {
    pat = t.pattern_dir === "bull" ? t.pattern_strength / 100
      : t.pattern_dir === "bear" ? -t.pattern_strength / 100 : 0;
    comps.push({ v: pat, w: 0.3 });
  }
  if (m && typeof m.target_pct === "number") {
    tgt = _clamp(m.target_pct / 25, -1, 1); // ±25% upside saturates
    comps.push({ v: tgt, w: 0.15 });
  }
  // Dealer structure (2026-08-07, from the PRISM audit): where does spot sit
  // between the put wall (dealer support below) and the call wall (resistance
  // above)? Near the put wall with room above = bullish structure (+1);
  // pressed into the call wall = bearish (-1). Neutral when walls are
  // missing/degenerate or spot is outside them.
  const tilt = wallTilt(g);
  if (tilt != null) {
    gex = tilt;
    comps.push({ v: gex, w: 0.2 });
  }
  if (!comps.length) return { score: null, tech, pat, tgt, gex, bull: 0 };
  const wsum = comps.reduce((s, c) => s + c.w, 0);
  const bull = comps.reduce((s, c) => s + c.v * c.w, 0) / wsum; // -1..+1 net bullishness
  const dir = side === "Bear" ? -1 : 1;
  const score = Math.round(50 + 50 * _clamp(bull * dir, -1, 1)); // 0..100 alignment with the trade
  return { score, tech, pat, tgt, gex, bull };
}

/** SETUP color — green = strong tailwind, red = fighting the tape. */
function setupTextColor(score: number | null): string {
  if (score == null) return "var(--text-muted)";
  if (score >= 70) return "var(--accent-green)";
  if (score >= 55) return "var(--accent-orange)";
  if (score >= 45) return "var(--text-secondary)";
  return "var(--accent-red)"; // underlying setup contradicts the trade
}

/** Neutral filter pill; active = interaction accent (amber). */
function pillStyle(active: boolean) {
  return active
    ? {
        color: "var(--accent-ink)",
        background: "var(--accent)",
        border: "1px solid var(--accent)",
      }
    : { color: "var(--text-secondary)", background: "transparent", border: "1px solid var(--border)" };
}

interface Props {
  /** One or more dates to fetch entries for. Entries from all dates are
   *  merged into a single chronological feed (newest first by default).
   *  Single-element arrays still work — same behavior as before. */
  dates: string[];
  bias: BiasFilter;
  dte: DteFilter;
  search: string;
  tradersOnly: boolean;
  authorTickerSet?: Set<string>;
  /** Tickers belonging to the active theme; null = no theme filter.
   *  Resolved in IFlowTracker so the Tape doesn't need the taxonomy itself. */
  categoryTickers?: Set<string> | null;
  selectedTicker: string | null;
  onSelectTicker: (ticker: string) => void;
  /** Earnings-window filter (1w/2w/1m/2m) — mirrors the Grid behavior.
   *  null/undefined earningsMap or window "all" = no filtering. */
  earningsWindow?: string;
  earningsMap?: Record<string, string | null> | null;
  earningsMaxDays?: number | null;
}

/** Map (CALL/PUT) × (ask% inferred direction) to a 2-word action label.
 *  High ask% (≥55) = lifting offer (buying). Low ask% (<40) = hitting bid
 *  (selling). Mirrors the backend's _corrected_side classifier so the chip
 *  reads the same way across the dashboard. */

/** Preserve the year for every contract, including current-year expiries. */
function fmtExpiry(raw: string): string {
  return raw;
}

/** Time-only string from the entry's UTC arrival timestamp. */
/** Parse the backend's `'YYYY-MM-DD HH:MM:SS UTC'` string and render it as
 *  HH:MM in America/Los_Angeles (handles PST/PDT via Intl).
 *  `image_downloaded_at` is the canonical source — it's universal across
 *  every entry, unlike `_discord_time_utc` / `flow_time` which are sparse. */
function fmtTime(raw: string | undefined): string {
  if (!raw) return "";
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Los_Angeles",
  }).format(d);
}

/** Use the same side-correction logic the backend summary applies, so a
 *  put-selling entry doesn't render as "Bear" just because the LLM tagged
 *  it that way before ask% was factored in. */
/** Index/broad-market ETFs — excluded from the dissent screen (a SPY put on
 *  a euphoric day is a routine hedge, not informed single-name dissent). */
const INDEX_ETFS = new Set([
  "SPY", "QQQ", "IWM", "DIA", "SPX", "SPXW", "NDX", "VIX", "TLT", "HYG",
]);
/** Inverse/vol ETFs — a CALL here is a market-BEAR bet; inverted in the lean. */
const BEAR_ETFS = new Set(["SQQQ", "SPXS", "SPXU", "QID", "PSQ", "SH", "UVXY"]);

function correctedSide(entry: Record<string, unknown>): OptionDirection {
  return optionIntent(entry).side;
}

interface EntryRow {
  msgId: string;
  ts: string;
  timeLabel: string;
  ticker: string;
  side: OptionDirection;
  action: string;
  contractLabel: string;
  /** Numeric strike value — separated from `contractLabel` so the
   *  contract column sorts by strike rather than alphabetically (which
   *  would make "$1000 CALL" sort before "$200 CALL"). */
  strike: number;
  dte: number | null;
  /** Raw DTE for the P/L estimator — keeps 0DTE (display `dte` nulls it). */
  pnlDte: number | null;
  dteCategory: { text: string; color: string; bg: string } | null;
  voiRatio: number | null;
  askPct: number | null;
  moneyness: number | null;
  /** Numeric premium in dollars (parsed once) — used for sort. The
   *  display still goes through `formatPremium(premium)`. */
  premium: number;
  // Fields needed for the P/L computation. Held on the row (rather than
  // recomputed during render) so sorting by `pnl` is O(1) per compare.
  optType: string;
  optFill: number;
  underlyingFill: number;
  flowDate: string;
  /** Number of underlying prints aggregated into this row. 1 for normal
   *  per-print rows; >1 only in Kian mode when same-contract entries
   *  were merged. Drives the "×N" badge on the contract cell. */
  printCount: number;
}

export function EntryTape({
  dates,
  bias,
  dte,
  search,
  tradersOnly,
  authorTickerSet,
  categoryTickers,
  selectedTicker,
  onSelectTicker,
  earningsWindow,
  earningsMap,
  earningsMaxDays,
}: Props) {
  // Fan out N parallel per-date queries (one per selected date). React
  // Query dedupes by (date, includeNotable), so re-renders don't re-fetch.
  const dateQueries = useMultiDateEntries(dates);
  const isLoading = dateQueries.length > 0 && dateQueries.some((q) => q.isLoading);
  // Per-ticker reference data for the SETUP column (analyst target + TA + pattern).
  const { data: tickerMeta } = useTickerMeta();
  const { data: tickerTech } = useTickerTechnicals();
  const { data: tickerGex } = useTickerGex();
  // Merge all entries across the selected dates into a single flat list.
  // Per-entry msg_id stays unique across dates because Discord snowflakes
  // are globally unique.
  const entries = useMemo<Record<string, unknown>[]>(() => {
    const out: Record<string, unknown>[] = [];
    for (const q of dateQueries) {
      const arr = (q.data?.entries as Record<string, unknown>[] | undefined) ?? [];
      for (const e of arr) out.push(e);
    }
    return out;
  }, [dateQueries]);

  // Filter modes:
  //   none    — show everything
  //   kian    — boolean rule-based filter matching @kiantrades' Twitter logic
  //             (premium ≥ $300K, not ETF, DTE 7-400, directional clarity).
  //             ALSO aggregates same-contract entries (sum premium across
  //             prints) so the row count matches what he posts on Twitter
  //             — his $805K BWA 75C is our $233K + $572K + ... summed.
  //   outliers — deep-OTM convexity bets.
  // They are MUTUALLY EXCLUSIVE.
  // Filter + sort state lives in the shared Zustand store so it survives
  // tab/view switches (this component unmounts on Tape↔Grid toggle and the
  // whole tab unmounts on tab switch; local useState would reset on remount).
  const { filterMode, sortKey, sortDir, outlierMin } = useDashboardFilters((s) => s.tape);
  const patchTape = useDashboardFilters((s) => s.patchTape);
  // Kian-mode contract aggregation. Groups entries by
  // (ticker, normalized type, strike, expiry) — collapses C/CALL and
  // P/PUT label inconsistency — sums premium, keeps the strongest ask%
  // Day lean + dissent detection — from the FULL loaded tape (pre-filter),
  // so toggling Bias/DTE chips can't move the denominator. Backtested on
  // 7/16-8/18: on the 6 days where a >=70% bull tape preceded a red day,
  // the opposite-side prints with ask>=85, DTE 5-45, single-name, >=$500K
  // graded median +67% 10d peak vs +39% for the consensus. Selection
  // signal only — it does NOT predict the market day (corr ~0).
  // Lean is per flow date (keyed like EntryRow.flowDate) — pooling several
  // days would let one euphoric day tag dissent on another.
  const leanByDate = useMemo(() => {
    const acc = new Map<string, { bull: number; bear: number }>();
    for (const e of entries) {
      const prem = parsePremium(e.premium_usd ?? e.premium);
      if (prem <= 0) continue;
      let s = correctedSide(e);
      if (s === "Unknown") continue;
      if (BEAR_ETFS.has(String(e.ticker || "").toUpperCase()))
        s = s === "Bull" ? "Bear" : "Bull";
      const d = String(e._date ?? (e.flow_date ?? (dates[0] ?? "")));
      const a = acc.get(d) ?? { bull: 0, bear: 0 };
      if (s === "Bull") a.bull += prem; else a.bear += prem;
      acc.set(d, a);
    }
    const out = new Map<string, number>();
    for (const [d, a] of acc) if (a.bull + a.bear > 0) out.set(d, a.bull / (a.bull + a.bear));
    return out;
  }, [entries, dates]);
  const sideOf = (lean: number | null | undefined): "Bull" | "Bear" | null =>
    lean == null ? null : lean >= 0.7 ? "Bull" : lean <= 0.3 ? "Bear" : null;
  // Header pill only when exactly one date is loaded.
  const dayLean = leanByDate.size === 1 ? [...leanByDate.values()][0] : null;
  const leanSide = sideOf(dayLean);
  const isDissent = (r: EntryRow): boolean => {
    const rowLean = sideOf(leanByDate.get(r.flowDate));
    if (!rowLean || r.side === rowLean) return false;
    const tk = r.ticker.toUpperCase();
    if (INDEX_ETFS.has(tk) || BEAR_ETFS.has(tk)) return false;
    return (r.askPct ?? 0) >= 85 && r.dte != null && r.dte >= 5 && r.dte <= 45
      && r.premium >= 500_000;
  };

  // (closest to the directional extreme) and the earliest timestamp.
  // Returns one row per CONTRACT, not per print. Only built in kian
  // mode; the other modes use the raw per-print entries.
  const aggregatedEntries = useMemo<Record<string, unknown>[]>(() => {
    if (filterMode !== "kian") return entries;
    type Agg = {
      seed: Record<string, unknown>;
      sumPremium: number;
      bestAsk: number | null;
      earliestTs: string;
      printCount: number;
    };
    const groups = new Map<string, Agg>();
    for (const e of entries) {
      const ticker = String(e.ticker || "").toUpperCase();
      if (!ticker) continue;
      const type = normalizeOptType(e.type || e.option_type);
      const strike = e.strike;
      const expiry = String(e.expiry || "").trim();
      const key = `${ticker}|${type}|${strike}|${expiry}`;
      const prem = parsePremium(e.premium_usd ?? e.premium);
      const askRaw = e.ask_pct;
      const ask = askRaw == null ? null : Number(askRaw);
      const ts = String(e.image_downloaded_at || "");
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          seed: { ...e, type, premium: prem },
          sumPremium: prem,
          bestAsk: ask,
          earliestTs: ts,
          printCount: 1,
        });
      } else {
        existing.sumPremium += prem;
        existing.printCount += 1;
        // "Best" ask% = the one furthest from 50 (most directionally clear).
        if (ask != null) {
          const curDist = existing.bestAsk == null ? -1 : Math.abs(existing.bestAsk - 50);
          const newDist = Math.abs(ask - 50);
          if (newDist > curDist) existing.bestAsk = ask;
        }
        // Keep the EARLIEST ts — the first time the contract showed up,
        // matching how chronological feeds typically display aggregates.
        if (ts && (!existing.earliestTs || ts < existing.earliestTs)) {
          existing.earliestTs = ts;
        }
      }
    }
    return Array.from(groups.values()).map((g) => ({
      ...g.seed,
      premium: g.sumPremium,
      ask_pct: g.bestAsk,
      image_downloaded_at: g.earliestTs || g.seed.image_downloaded_at,
      _print_count: g.printCount,
    }));
  }, [entries, filterMode]);

  const rows: EntryRow[] = useMemo(() => {
    const dteMatch = (d: number) => {
      if (dte === "all") return true;
      if (dte === "lotto") return d > 0 && d <= 14;
      if (dte === "swing") return d > 14 && d <= 60;
      if (dte === "leap") return d > 60;
      return true;
    };
    const out: EntryRow[] = [];
    // Row keys MUST be unique: most entries carry `_msg_id: null` (79/80 on
    // a typical day), so the ticker-strike-expiry-ts fallback collides when
    // the same contract prints twice — duplicate React keys made sorting
    // visually DUPLICATE rows at the top (reconciliation reuses keyed DOM).
    // Suffix repeats with #n; stable across sorts since it's assigned here.
    const seenIds = new Map<string, number>();
    // In Kian mode, iterate over the contract-aggregated set so each row
    // represents the whole bet (sum of prints) — matching how he posts
    // on Twitter. In all other modes, iterate raw per-print entries.
    const source = filterMode === "kian" ? aggregatedEntries : entries;
    for (const e of source) {
      const ticker = String(e.ticker || "");
      if (!ticker) continue;
      if (search && !ticker.toUpperCase().includes(search.toUpperCase())) continue;
      if (tradersOnly && authorTickerSet && !authorTickerSet.has(ticker)) continue;
      if (categoryTickers && !categoryTickers.has(ticker)) continue;
      // Earnings-window filter — same rule as the Grid: ticker must report
      // within the window. No earnings date = excluded while a window is on.
      if (earningsWindow && earningsWindow !== "all" && earningsMap
          && earningsMaxDays != null) {
        const ed = earningsMap[ticker.toUpperCase()];
        if (!ed) continue;
        const days = daysFromToday(ed);
        if (!(days >= 0 && days <= earningsMaxDays)) continue;
      }
      const dteNum = Number(e.dte ?? 0);
      if (!dteMatch(dteNum)) continue;

      const side = correctedSide(e);
      if (bias === "bullish" && side !== "Bull") continue;
      if (bias === "bearish" && side !== "Bear") continue;

      // image_downloaded_at is the canonical timestamp — universal on
      // every entry (set by the iFlow fetcher when the Discord image lands).
      // _discord_time_utc / flow_time are intentionally NOT used here:
      // they're sparse + sometimes wrong + cause inconsistent ordering.
      const tsRaw = String(e.image_downloaded_at || "");
      const type = normalizeOptType(e.type || e.option_type);
      const strike = Number(e.strike ?? 0);
      const expiry = fmtExpiry(String(e.expiry ?? ""));
      const askPct = e.ask_pct != null ? Number(e.ask_pct) : null;
      const voi = (() => {
        const v = e.vol_oi_ratio;
        if (typeof v === "number") return v;
        if (typeof v === "string") return Number(v.replace("x", "").trim()) || null;
        return null;
      })();
      const underlying = Number(e.underlying_price ?? 0);
      // Moneyness as % to ATM. Positive = OTM (for both calls and puts);
      // the deeper OTM, the more convex. Drives the green/red tone + the
      // "Someone knows something" outlier filter.
      const moneyness = entryMoneyness(e);

      const contractType = type.includes("CALL") ? "CALL" : type.includes("PUT") ? "PUT" : type;
      const contractLabel = `$${strike} ${contractType}${expiry ? ` ${expiry}` : ""}`;

      // Canonical parser handles numeric dollars and compact K/M/B strings.
      const premiumNum = parsePremium(e.premium_usd ?? e.premium);

      if (filterMode === "outliers") {
        // Deep-OTM convexity bets — "someone knows something" prints.
        // Keep only strikes at least `outlierMin`% out-of-the-money.
        if (moneyness == null || moneyness < outlierMin) continue;
      }
      if (filterMode === "kian") {
        const passes = passesKianFilter({
          ticker,
          type,
          premium: premiumNum,
          ask_pct: askPct,
          dte: dteNum > 0 ? dteNum : null,
        });
        if (!passes) continue;
      }

      // In Kian mode the source rows carry a `_print_count` from the aggregator.
      const printCount = Number((e._print_count as number | string | undefined) ?? 1);

      const baseId = String(e._msg_id ?? `${ticker}-${strike}-${type}-${expiry}-${tsRaw}`);
      const nSeen = seenIds.get(baseId) ?? 0;
      seenIds.set(baseId, nSeen + 1);
      out.push({
        msgId: nSeen === 0 ? baseId : `${baseId}#${nSeen}`,
        ts: tsRaw,
        timeLabel: fmtTime(tsRaw),
        ticker,
        side,
        action: optionIntent(e).action,
        contractLabel,
        strike,
        dte: Number.isFinite(dteNum) && dteNum > 0 ? dteNum : null,
        pnlDte: e.dte != null && Number.isFinite(Number(e.dte)) ? Number(e.dte) : null,
        dteCategory: dteNum > 0 ? dteTag(dteNum) : null,
        voiRatio: voi,
        askPct,
        moneyness,
        premium: premiumNum,
        optType: type,
        optFill: Number(e.avg_price ?? 0),
        underlyingFill: underlying,
        flowDate: String(e._date ?? (e.flow_date ?? (dates[0] ?? ""))),
        printCount,
      });
    }
    return out;
  }, [entries, aggregatedEntries, bias, dte, search, tradersOnly, authorTickerSet, categoryTickers, filterMode, outlierMin, dates, earningsWindow, earningsMap, earningsMaxDays]);

  // Batch-fetch current prices for every unique ticker in the visible
  // rows. Refetches every 60s via the hook's refetchInterval — so the
  // P/L column updates in the background while you're looking at it.
  const uniqueTickers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ticker))),
    [rows],
  );
  const { data: pricesResp } = useTickerPricesBatch(uniqueTickers);
  const priceMap = useMemo(() => pricesResp?.prices ?? {}, [pricesResp?.prices]);

  // Per-row P/L — same delta+theta estimator the grid view's EntryRow uses
  // (canonical impl in iflow/estimator.ts). Null when we can't price the
  // contract yet (price still loading, missing underlying_price at fill,
  // missing avg_price). Memoized over [rows, priceMap] so sort + render
  // don't recompute on every keystroke.
  const pnlByMsg = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const r of rows) {
      const cur = priceMap[r.ticker] || 0;
      if (cur <= 0 || r.underlyingFill <= 0 || r.side === "Unknown" || r.action.includes("to close")) {
        m[r.msgId] = null;
        continue;
      }
      if (r.optFill > 0 && r.strike > 0) {
        m[r.msgId] = estimateOptionPnl(
          r.underlyingFill, cur, r.optFill, r.strike, r.pnlDte ?? 30,
          r.optType, r.flowDate, r.action.includes("selling"),
        );
      } else {
        m[r.msgId] = null;
      }
    }
    return m;
  }, [rows, priceMap]);

  // Active sort — default: time DESC (newest first). The full row list
  // above stays in insertion order; sorting happens here so toggling sort
  // never re-runs the filter pass. `sortKey`/`sortDir` come from the shared
  // store (destructured above) so they persist across tab/view switches.
  const sortedRows = useMemo(() => {
    // null/missing values sink to the bottom regardless of direction.
    const numCmp = (a: number | null, b: number | null, dir: SortDir) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return dir === "asc" ? a - b : b - a;
    };
    const strCmp = (a: string, b: string, dir: SortDir) =>
      dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);

    const copy = rows.slice();
    copy.sort((a, b) => {
      switch (sortKey) {
        case "time": {
          if (a.ts && b.ts) return sortDir === "asc" ? a.ts.localeCompare(b.ts) : b.ts.localeCompare(a.ts);
          if (a.ts) return -1;
          if (b.ts) return 1;
          return 0;
        }
        case "ticker":   return strCmp(a.ticker, b.ticker, sortDir);
        case "side":     return strCmp(a.side, b.side, sortDir);
        case "action":   return strCmp(a.action, b.action, sortDir);
        case "contract": return numCmp(a.strike, b.strike, sortDir);
        case "dte":      return numCmp(a.dte, b.dte, sortDir);
        case "ern": {
          const ed = (t: string) => {
            const d = earningsMap?.[t.toUpperCase()];
            if (!d) return null;
            const n = daysFromToday(d);
            return n >= 0 ? n : null;
          };
          return numCmp(ed(a.ticker), ed(b.ticker), sortDir);
        }
        case "voi":      return numCmp(a.voiRatio, b.voiRatio, sortDir);
        case "ask":      return numCmp(a.askPct, b.askPct, sortDir);
        case "atm":      return numCmp(a.moneyness, b.moneyness, sortDir);
        case "premium":  return numCmp(a.premium, b.premium, sortDir);
        case "pnl":      return numCmp(pnlByMsg[a.msgId], pnlByMsg[b.msgId], sortDir);
        case "setup":    return numCmp(
                           setupScore(a.side, tickerMeta?.[a.ticker], tickerTech?.[a.ticker], tickerGex?.[a.ticker]).score,
                           setupScore(b.side, tickerMeta?.[b.ticker], tickerTech?.[b.ticker], tickerGex?.[b.ticker]).score,
                           sortDir);
      }
    });
    return copy;
  }, [rows, sortKey, sortDir, pnlByMsg, tickerMeta, tickerTech, tickerGex, earningsMap]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) {
      patchTape({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      patchTape({ sortKey: k, sortDir: DEFAULT_DIR[k] });
    }
  };

  // Kian-mode count must match the aggregated-contract semantics — same
  // grouping logic as `aggregatedEntries` so the badge number lines up
  // with the rows you'd see after toggling the filter on. Doesn't depend
  // on filterMode (we compute the count regardless of which mode is
  // active so the badge always tells the truth).
  const kianCount = useMemo(() => {
    const seen = new Map<string, { prem: number; ask: number | null; type: string; dte: number | null; ticker: string }>();
    for (const e of entries as any[]) {
      const ticker = String(e?.ticker || "").toUpperCase();
      if (!ticker) continue;
      const type = normalizeOptType(e?.type);
      const strike = e?.strike;
      const expiry = String(e?.expiry || "").trim();
      const key = `${ticker}|${type}|${strike}|${expiry}`;
      const prem = parsePremium(e?.premium_usd ?? e?.premium);
      const ask = e?.ask_pct != null ? Number(e.ask_pct) : null;
      const dteN = e?.dte != null ? Number(e.dte) : null;
      const cur = seen.get(key);
      if (!cur) seen.set(key, { prem, ask, type, dte: dteN, ticker });
      else {
        cur.prem += prem;
        if (ask != null) {
          const curDist = cur.ask == null ? -1 : Math.abs(cur.ask - 50);
          if (Math.abs(ask - 50) > curDist) cur.ask = ask;
        }
      }
    }
    let n = 0;
    for (const g of seen.values()) {
      if (passesKianFilter({ ticker: g.ticker, type: g.type, premium: g.prem, ask_pct: g.ask, dte: g.dte })) n += 1;
    }
    return n;
  }, [entries]);
  // "Someone knows something" count — entries at least outlierMin% OTM.
  const outlierCount = useMemo(() => {
    let n = 0;
    for (const e of entries as Record<string, unknown>[]) {
      const m = entryMoneyness(e);
      if (m != null && m >= outlierMin) n += 1;
    }
    return n;
  }, [entries, outlierMin]);

  if (isLoading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-7 rounded bg-text-muted/10 animate-pulse" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    if (dateQueries.some((q) => q.isError || q.fetchStatus === "paused")) {
      return <QueryNotice queries={dateQueries} label="Flow entries" />;
    }
    const dateLabel =
      dates.length === 0 ? "selected dates"
      : dates.length === 1 ? dates[0]
      : `${dates.length} dates`;
    return (
      <div className="text-center text-text-muted text-sm py-12">
        No entries match the current filters on {dateLabel}.
      </div>
    );
  }

  const renderHeader = (label: string, key: SortKey, className: string) => (
    <SortHeaderButton
      label={label}
      sortKey={key}
      activeSortKey={sortKey}
      sortDir={sortDir}
      className={className}
      onSort={toggleSort}
    />
  );

  return (
    <Tile
      title={
        <>
          Tape{" "}
          <span className="num text-xs font-normal text-text-muted">
            {sortedRows.length} of {entries.length}
          </span>
        </>
      }
      meta={dates.length > 1 ? `${dates.length} dates` : dates[0]}
      bodyClassName="text-xs"
    >
      <QueryNotice queries={dateQueries} label="Flow entries" />
      <div className="flex items-center justify-between gap-3 max-md:flex-wrap max-md:gap-2">
        <div className="flex items-center gap-2 max-md:gap-1 max-md:overflow-x-auto max-md:flex-nowrap max-md:w-full">
          <button
            type="button"
            onClick={() => {
              const next: FilterMode = filterMode === "kian" ? "none" : "kian";
              // Kian filter is rule-based pass/fail — premium sort
              // matches how he visually surfaces "biggest single bets".
              if (next === "kian" && sortKey !== "premium") {
                patchTape({ filterMode: next, sortKey: "premium", sortDir: "desc" });
              } else {
                patchTape({ filterMode: next });
              }
            }}
            className="flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors"
            style={pillStyle(filterMode === "kian")}
            title={
              "Replication of @kiantrades' (Flowseidon) Twitter selection logic: " +
              "premium ≥ $300K · single-leg · not an index/leveraged ETF · DTE 7–400 · " +
              "directional clarity (call buying / put STO / OTM put hedge). " +
              "Rule-based pass/fail — no score, no convergence."
            }
          >
            <Activity size={12} />
            Flowseidon
            {kianCount > 0 && <span className="num text-text-muted">{kianCount}</span>}
          </button>
          {/* "Someone knows something" — deep-OTM convexity bets (strike far
              out of the money). The 40C-on-a-$13-stock kind of print. */}
          <button
            type="button"
            onClick={() => {
              const next: FilterMode = filterMode === "outliers" ? "none" : "outliers";
              // Surface the most extreme first — sort by ATM% desc on activate.
              if (next === "outliers" && sortKey !== "atm") {
                patchTape({ filterMode: next, sortKey: "atm", sortDir: "desc" });
              } else {
                patchTape({ filterMode: next });
              }
            }}
            className="flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors"
            style={pillStyle(filterMode === "outliers")}
            title={
              `Deep out-of-the-money convexity bets — strike at least ${outlierMin}% OTM ` +
              `(e.g. a $40 call on a $13 stock = +208%). The "someone knows something" prints: ` +
              `lottery-ticket lottos and long-dated conviction LEAPs. ` +
              `Tip: add the DTE = Leap filter for the long-dated 2027-style ones. Sorts by ATM% (most extreme first).`
            }
          >
            <Sparkles size={12} />
            Deep OTM
            {outlierCount > 0 && <span className="num text-text-muted">{outlierCount}</span>}
          </button>
          {filterMode === "outliers" && (
            <label
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0.5"
              title="Minimum % out-of-the-money to qualify"
            >
              <span className="text-xs text-text-muted">≥</span>
              <input
                type="number"
                min={0}
                max={1000}
                step={10}
                value={outlierMin}
                onChange={(e) =>
                  patchTape({ outlierMin: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })
                }
                className="w-12 bg-transparent text-xs text-text-primary outline-none num"
              />
              <span className="text-xs text-text-muted">% OTM</span>
            </label>
          )}
        </div>
        <span className="flex items-center gap-4 text-sm text-text-muted">
          {dayLean != null && (
            <span
              className="whitespace-nowrap"
              title={
                `Premium-weighted lean of the full loaded tape (inverse ETFs counted as market bets). ` +
                (leanSide
                  ? `One-sided (>=70%) — opposite-side conviction prints get a DISSENT tag: ` +
                    `single-name, ask% >= 85, DTE 5-45, >= $500K. On the six 70%+ bull days that preceded ` +
                    `a red day (7/16-8/4), those prints graded median +67% 10d peak vs +39% for the consensus. ` +
                    `Selection signal only — it does NOT predict whether tomorrow is red.`
                  : `Mixed tape — no dissent tags at <70% one-sidedness.`)
              }
            >
              Tape{" "}
              <span
                className="num font-medium"
                style={{
                  color: leanSide === "Bull" ? "var(--accent-green)"
                    : leanSide === "Bear" ? "var(--accent-red)" : "var(--text-secondary)",
                }}
              >
                {Math.round(dayLean * 100)}% bull
              </span>
            </span>
          )}
        </span>
      </div>
      <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto overscroll-x-contain lg:-mx-5 lg:max-w-[calc(100%+2.5rem)]">
      <div className="min-w-fit">
      <div
        className="iflow-tape-header sticky top-0 z-10 flex items-center gap-3 border-y border-border px-4 py-2 text-xs font-medium text-text-muted max-md:gap-1.5 max-md:px-2 lg:px-5"
        style={{ background: "var(--surface-inset)" }}
      >
        {renderHeader("Setup", "setup", "w-12 justify-end max-md:hidden")}
        {renderHeader("Time", "time", "w-12 justify-start pl-2 max-md:hidden")}
        {renderHeader("Ticker", "ticker", "w-16 justify-start")}
        {renderHeader("Side", "side", "w-10 justify-start")}
        {renderHeader("Action", "action", "w-28 justify-start max-md:hidden")}
        {renderHeader("Contract", "contract", "flex-1 min-w-[160px] justify-start max-md:min-w-[80px]")}
        {renderHeader("DTE", "dte", "w-20 justify-start max-md:hidden")}
        {renderHeader("Earn", "ern", "w-10 justify-end max-md:hidden")}
        {renderHeader("Vol/OI", "voi", "w-14 justify-end max-md:hidden")}
        {renderHeader("Ask%", "ask", "w-12 justify-end max-md:hidden")}
        {renderHeader("ATM%", "atm", "w-16 justify-end max-md:hidden")}
        {renderHeader("Premium", "premium", "w-20 justify-end max-md:hidden")}
        {renderHeader("Est. P/L", "pnl", "w-16 justify-end")}
      </div>
      <div className="divide-y divide-border px-2 lg:px-3">
      {sortedRows.map((r) => {
        const sideColor =
          r.side === "Unknown" ? "var(--text-muted)" : r.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
        const moneyColor =
          r.moneyness == null
            ? "var(--text-muted)"
            : r.moneyness >= 0
              ? "var(--accent-green)"
              : "var(--accent-red)";
        const isSelected = selectedTicker === r.ticker;
        return (
          <button
            key={r.msgId}
            type="button"
            onClick={() => onSelectTicker(r.ticker)}
            className="iflow-tape-row data-row flex w-full items-center gap-3 px-2 py-2.5 text-left max-md:gap-1.5 max-md:px-1"
            style={{
              background: isSelected ? "color-mix(in srgb, var(--accent) 12%, transparent)" : undefined,
            }}
          >
            {/* SETUP — does the underlying's analyst target + chart pattern +
                technical trend AGREE with this trade's direction? Per-ticker,
                direction-aware. */}
            {(() => {
              const s = setupScore(r.side, tickerMeta?.[r.ticker], tickerTech?.[r.ticker], tickerGex?.[r.ticker]);
              const t = tickerTech?.[r.ticker];
              const pct = (x: number | null) =>
                x == null ? "—" : `${x >= 0 ? "+" : ""}${Math.round(x * 100)}`;
              const title = s.score == null
                ? "Setup score unavailable (no technical/target data for this ticker yet)"
                : `SETUP ${s.score}/100 — does the underlying back this ${r.side} trade?\n` +
                  `net underlying lean ${s.bull >= 0 ? "+" : ""}${Math.round(s.bull * 100)} ` +
                  `(>50 tailwind, <50 fights the trade)\n` +
                  `technical ${pct(s.tech)} · pattern ${pct(s.pat)}${t?.pattern ? ` (${t.pattern})` : ""} · target ${pct(s.tgt)} · dealer ${pct(s.gex)}\n` +
                  `weights .35/.30/.15/.20 (dealer = spot between put/call GEX walls).\n` +
                  `Heuristic context only; it is not an outcome probability.`;
              return (
                <span
                  className="w-12 shrink-0 text-right font-semibold num max-md:hidden"
                  style={{ color: setupTextColor(s.score) }}
                  title={title}
                >
                  {s.score != null ? s.score : "—"}
                </span>
              );
            })()}
            <span className="w-12 shrink-0 pl-2 num text-text-muted max-md:hidden">{r.timeLabel}</span>
            <span className="ticker w-16 shrink-0 truncate text-sm">{r.ticker}</span>
            <span
              className="w-10 shrink-0 text-xs font-medium"
              style={{ color: sideColor }}
            >
              {r.side}
            </span>
            <span className="w-28 shrink-0 text-text-muted max-md:hidden flex items-center gap-1">
              <span className="truncate">{r.action}</span>
              {isDissent(r) && (
                <span
                  className="tag shrink-0"
                  style={{ "--tag": "var(--accent-purple)" } as React.CSSProperties}
                  title={
                    `DISSENT — conviction print against a ${Math.round((leanByDate.get(r.flowDate) ?? 0) * 100)}% ` +
                    `${sideOf(leanByDate.get(r.flowDate))?.toLowerCase()} tape: single-name, ask% ${r.askPct}, DTE ${r.dte}, ` +
                    `${formatPremium(r.premium)}. Historically (7/16-8/18) these graded ` +
                    `median +67% 10d peak vs +39% for the day's consensus prints. ` +
                    `A print-selection screen, NOT a market-crash forecast.`
                  }
                >
                  dissent
                </span>
              )}
            </span>
            <span className="flex-1 min-w-[160px] num text-text-secondary truncate flex items-center gap-1.5 max-md:min-w-[80px]" title={r.contractLabel}>
              <span className="truncate">{r.contractLabel}</span>
              {r.printCount > 1 && (
                <span
                  className="shrink-0 num text-xs text-text-muted"
                  title={`Aggregated from ${r.printCount} prints (same ticker/strike/type/expiry). Premium reflects the sum; ask% is the most directional across prints.`}
                >
                  ×{r.printCount}
                </span>
              )}
            </span>
            <span className="w-20 shrink-0 flex items-center gap-1.5 text-text-muted max-md:hidden">
              {r.dte ? <span className="num text-text-secondary">{r.dte}d</span> : null}
              {r.dteCategory ? (
                <span className="text-xs">{r.dteCategory.text.toLowerCase()}</span>
              ) : null}
            </span>
            {(() => {
              const d = earningsMap?.[r.ticker.toUpperCase()];
              const n = d ? daysFromToday(d) : null;
              const show = n != null && n >= 0;
              return (
                <span
                  className={`w-10 shrink-0 text-right num max-md:hidden ${show && n === 0 ? "font-bold" : ""}`}
                  style={{
                    color: !show ? "var(--text-muted)"
                      : n === 0 ? "var(--accent-orange)"
                      : n <= 7 ? "color-mix(in srgb, var(--accent-orange) 70%, var(--text-secondary))"
                      : "var(--text-muted)",
                  }}
                  title={show ? `Earnings ${d} (${n === 0 ? "today" : `in ${n}d`})` : "No upcoming earnings date"}
                >
                  {show ? (n === 0 ? "TDY" : `${n}d`) : "—"}
                </span>
              );
            })()}
            <span
              className="w-14 shrink-0 text-right num max-md:hidden"
              style={{
                color: r.voiRatio != null && r.voiRatio >= 2
                  ? "var(--accent-green)"
                  : "var(--text-secondary)",
              }}
            >
              {r.voiRatio != null ? `${r.voiRatio.toFixed(1)}×` : "—"}
            </span>
            <span
              className="w-12 shrink-0 text-right num max-md:hidden"
              style={{
                color: r.askPct == null
                  ? "var(--text-muted)"
                  : r.askPct >= 55
                    ? "var(--accent-green)"
                    : r.askPct < 40
                      ? "var(--accent-red)"
                      : "var(--text-secondary)",
              }}
            >
              {r.askPct != null ? `${r.askPct}%` : "—"}
            </span>
            <span className="w-16 shrink-0 text-right num max-md:hidden" style={{ color: moneyColor }}>
              {r.moneyness != null
                ? `${r.moneyness >= 0 ? "+" : ""}${r.moneyness.toFixed(1)}%`
                : "—"}
            </span>
            <span
              className={`w-20 shrink-0 text-right num text-sm max-md:hidden ${r.premium >= 1_000_000 ? "font-bold text-text-primary" : "font-semibold text-text-primary"}`}
            >
              {r.premium > 0 ? formatPremium(r.premium) : "—"}
            </span>
            {(() => {
              const pnl = pnlByMsg[r.msgId];
              const cur = priceMap[r.ticker] || 0;
              // "…" while we wait on the batch price, "—" when we have
              // the price but can't compute (no fill/strike), else the
              // signed percent in green/red.
              const label =
                pnl != null
                  ? `${pnl >= 0 ? "+" : ""}${pnl}%`
                  : cur > 0
                    ? "—"
                    : "…";
              const color =
                pnl != null
                  ? pnl >= 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)"
                  : "var(--text-muted)";
              return (
                <span
                  className="w-16 shrink-0 text-right font-semibold num"
                  style={{ color }}
                  title={cur > 0 ? `current ${r.ticker} $${cur.toFixed(2)} vs entry $${r.underlyingFill.toFixed(2)}` : "price loading…"}
                >
                  {label}
                </span>
              );
            })()}
          </button>
        );
      })}
      </div>
      </div>
      </div>
    </Tile>
  );
}
