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
import { useMemo, useState } from "react";
import { useMultiDateEntries, useTickerPricesBatch } from "./hooks";
import { estimateOptionPnl } from "./estimator";
import type { BiasFilter, DteFilter } from "./types";
import { dteTag } from "./utils";
import { formatPremium } from "../../../lib/utils";
import { ChevronUp, ChevronDown, Activity } from "lucide-react";

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

/** Notable filter has 4 states cycled by clicking the button:
 *   "none"            → no filter
 *   "notable_nscore"  → NScore ≥ threshold (heuristic)
 *   "notable_ml"      → ML ≥ threshold (model)
 *   "notable_both"    → BOTH NScore AND ML ≥ threshold (intersection)
 * The Flowseidon "kian" filter remains mutually exclusive with all
 * Notable variants — clicking Flowseidon clears whichever Notable was on
 * and vice versa.
 */
type FilterMode = "none" | "notable_nscore" | "notable_ml" | "notable_both" | "kian";

const NOTABLE_CYCLE: FilterMode[] = ["none", "notable_nscore", "notable_ml", "notable_both"];

/** Visual + label per Notable filter state. Picked so the operator
 *  always knows which lens is active without reading the tooltip. */
const NOTABLE_STYLE: Record<FilterMode, { label: string; fg: string; bg: string; bd: string }> = {
  none: {
    label: "Notable",
    fg: "var(--text-muted)",
    bg: "transparent",
    bd: "var(--border)",
  },
  notable_nscore: {
    label: "Top NScore",
    fg: "var(--accent-yellow, #eab308)",
    bg: "rgba(234,179,8,0.18)",
    bd: "rgba(234,179,8,0.50)",
  },
  notable_ml: {
    label: "Top ML",
    fg: "var(--accent-cyan, #22d3ee)",
    bg: "rgba(34,211,238,0.18)",
    bd: "rgba(34,211,238,0.50)",
  },
  notable_both: {
    label: "Top Both",
    fg: "var(--accent-purple, #c084fc)",
    bg: "rgba(192,132,252,0.18)",
    bd: "rgba(192,132,252,0.50)",
  },
  kian: {  // unused for Notable button, defined for type completeness
    label: "—",
    fg: "var(--text-muted)",
    bg: "transparent",
    bd: "var(--border)",
  },
};

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

/** Recompute the Notable score for an aggregated-contract row.
 *
 *  Backend's score is per-print, so when we sum prints into one contract
 *  row the displayed score becomes wrong (it still reflects ONE print's
 *  premium and ask%). This re-applies the same formula client-side using
 *  the aggregated premium and best (most-extreme) ask%. Other components
 *  — convergence, catalyst, structural — come from the seed entry's
 *  score because they're per-ticker, identical across prints.
 *
 *  Approximation note: we don't have market_cap on the client, so the
 *  small-cap cap-multiplier from the backend's size formula is dropped.
 *  This makes the recomputed size slightly conservative — it can't
 *  reward small-cap unusual activity the way the backend does. Good
 *  enough for the Kian-mode display, where premium IS the headline. */
function recomputeAggregateScore(
  seed: { score: number; parts: { size: number; convergence: number; conviction: number; catalyst: number; structural: number } },
  aggregatedPremium: number,
  bestAskPct: number | null,
  voiRatio: number | null,
  dteVal: number | null,
): { score: number; parts: { size: number; convergence: number; conviction: number; catalyst: number; structural: number } } {
  // size — pure absolute-premium tier (no cap multiplier client-side)
  const newSize = Math.min(1, aggregatedPremium / 3_000_000);
  // conviction — recompute the ask-extremity slice from best ask%;
  // keep voi/dte slices from the seed since they don't aggregate cleanly
  const askExtremity = bestAskPct == null ? 0.5 : Math.min(1, Math.abs(bestAskPct - 50) / 50);
  const voiScore = Math.min(1, Math.max(0, voiRatio ?? 0) / 3);
  const dteScore = dteVal == null || dteVal <= 0 ? 0.5
                 : dteVal <= 6 ? 0.3
                 : dteVal > 365 ? 0.5
                 : 1.0;
  const newConv = 0.5 * askExtremity + 0.3 * voiScore + 0.2 * dteScore;
  // Other 3 components ride seed.parts (per-ticker / per-contract structural)
  const total = 100 * (
    0.25 * newSize
    + 0.30 * seed.parts.convergence
    + 0.20 * newConv
    + 0.15 * seed.parts.catalyst
    + 0.10 * seed.parts.structural
  );
  return {
    score: Math.round(total),
    parts: {
      size: Math.round(newSize * 100) / 100,
      convergence: seed.parts.convergence,
      conviction: Math.round(newConv * 100) / 100,
      catalyst: seed.parts.catalyst,
      structural: seed.parts.structural,
    },
  };
}

/** Sortable column keys. `time` is always lex-sorted on the raw timestamp
 *  string; everything else extracts the obvious comparable value (numeric
 *  where it makes sense, alphabetic otherwise). Headers expose all of
 *  these — clicking a column toggles direction; clicking another column
 *  switches to it with that column's default direction. */
type SortKey =
  | "time" | "ticker" | "side" | "action" | "contract"
  | "dte" | "voi" | "ask" | "atm" | "premium" | "pnl"
  | "score" | "ml" | "avg";
type SortDir = "asc" | "desc";

/** Default direction when first clicking a column. Numeric / time columns
 *  default to DESC ("biggest first"); text columns default to ASC. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  time: "desc", ticker: "asc", side: "asc", action: "asc", contract: "asc",
  dte: "desc", voi: "desc", ask: "desc", atm: "desc", premium: "desc",
  pnl: "desc", score: "desc", ml: "desc", avg: "desc",
};

/** Average-score helper. Returns (nscore + ml) / 2 when both present,
 *  whichever single one is present otherwise, null when neither is. */
function avgScore(nscore: number | null | undefined,
                  ml: number | null | undefined): number | null {
  const ns = typeof nscore === "number" ? nscore : null;
  const mlNum = typeof ml === "number" ? ml : null;
  if (ns != null && mlNum != null) return Math.round((ns + mlNum) / 2);
  if (ns != null) return ns;
  if (mlNum != null) return mlNum;
  return null;
}

/** AVG column color — intensity-keyed. Green when both systems converge
 *  on a high value; amber at mid; muted otherwise. This is the
 *  "consensus" reading — different semantic from NScore (heuristic) or
 *  ML alone, so it gets its own accent. */
function avgTextColor(score: number | null): string {
  if (score == null) return "var(--text-muted)";
  if (score >= 80) return "var(--accent-green)";
  if (score >= 65) return "var(--accent-orange, #e37f2e)";
  if (score >= 50) return "var(--text-secondary)";
  return "var(--text-muted)";
}

/** Notable score → border style. Tiered: top picks visually pop. */
function scoreBorderStyle(score: number | null, fallbackColor: string) {
  if (score == null) return { borderLeft: `2px solid ${fallbackColor}`, boxShadow: undefined };
  if (score >= 85) {
    return {
      borderLeft: "3px solid var(--accent-yellow, #eab308)",
      boxShadow: "0 0 6px rgba(234, 179, 8, 0.35)",
    };
  }
  if (score >= 70) {
    return { borderLeft: "3px solid var(--accent-yellow, #eab308)", boxShadow: undefined };
  }
  if (score >= 55) {
    return { borderLeft: `2px solid var(--accent-yellow, #eab308)`, boxShadow: undefined };
  }
  return { borderLeft: `2px solid ${fallbackColor}`, boxShadow: undefined };
}

function scoreTextColor(score: number | null): string {
  if (score == null) return "var(--text-muted)";
  if (score >= 85) return "var(--accent-yellow, #eab308)";
  if (score >= 70) return "var(--accent-yellow, #eab308)";
  if (score >= 55) return "var(--accent-orange, #e37f2e)";
  return "var(--text-secondary)";
}

/** ML score color — distinct accent so the user can't confuse it with
 *  the heuristic NScore. Cyan/blue tone matches the Flowseidon filter
 *  chip semantic (different system). */
function mlTextColor(score: number | null): string {
  if (score == null) return "var(--text-muted)";
  if (score >= 80) return "var(--accent-cyan, #22d3ee)";
  if (score >= 60) return "var(--accent-blue, #60a5fa)";
  if (score >= 40) return "var(--text-secondary)";
  return "var(--accent-red, #ef4444)";
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
  selectedTicker: string | null;
  onSelectTicker: (ticker: string) => void;
}

/** Map (CALL/PUT) × (ask% inferred direction) to a 2-word action label.
 *  High ask% (≥55) = lifting offer (buying). Low ask% (<40) = hitting bid
 *  (selling). Mirrors the backend's _corrected_side classifier so the chip
 *  reads the same way across the dashboard. */
function actionLabel(type: string, askPct: number): string {
  const t = (type || "").toUpperCase();
  const isCall = t.includes("CALL");
  const isPut = t.includes("PUT");
  const buying = askPct >= 55;
  if (isCall) return buying ? "call buying" : "call selling";
  if (isPut) return buying ? "put buying" : "put selling";
  return type?.toLowerCase() || "flow";
}

/** Format expiry as M/D (drop year unless it's not the current one). */
function fmtExpiry(raw: string): string {
  if (!raw) return "";
  // Backend gives "12/18/2026" — keep year for LEAPs, drop for near-term.
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return raw;
  const [, mo, da, yr] = m;
  const cur = new Date().getFullYear();
  return Number(yr) === cur ? `${mo}/${da}` : `${mo}/${da}/${yr.slice(2)}`;
}

/** Time-only string from the entry's UTC arrival timestamp. */
function fmtTime(raw: string | undefined): string {
  if (!raw) return "";
  // "2026-05-27 13:33:25 UTC" → "13:33"
  const m = raw.match(/(\d{2}:\d{2})(?::\d{2})?/);
  return m ? m[1] : raw.slice(11, 16);
}

/** Use the same side-correction logic the backend summary applies, so a
 *  put-selling entry doesn't render as "Bear" just because the LLM tagged
 *  it that way before ask% was factored in. */
function correctedSide(entry: Record<string, unknown>): "Bull" | "Bear" {
  const type = String(entry.type || entry.option_type || "").toUpperCase();
  const askPct = Number(entry.ask_pct ?? 50);
  let voi = entry.vol_oi_ratio as number | string | undefined;
  if (typeof voi === "string") voi = Number(String(voi).replace("x", "").trim()) || 0;
  let isBuying: boolean;
  if (askPct >= 55) isBuying = true;
  else if (askPct < 40) isBuying = false;
  else isBuying = (Number(voi) || 0) >= 1.5;
  if (type.includes("CALL")) return isBuying ? "Bull" : "Bear";
  if (type.includes("PUT")) return isBuying ? "Bear" : "Bull";
  return (entry.side as "Bull" | "Bear") || "Bull";
}

/** Backend's per-entry Notable scoring envelope. Optional on the wire
 *  because we only pay for the prefetch when `include_notable=true`. */
interface NotableScore {
  /** Heuristic 5-component blend, 0-100. Auditable via `parts` and
   *  `signals`. Rendered in the dashboard's "NScore" column. */
  score: number;
  side: "Bull" | "Bear";
  parts: {
    size: number;
    convergence: number;
    conviction: number;
    catalyst: number;
    structural: number;
  };
  signals: {
    intel_bias?: string;
    forecast_dir?: string;
    accumulation_label?: string;
    trader_calls_24h?: number;
    trader_same_dir_24h?: number;
    news_24h?: number;
    voices_7d?: number;
    voices_sentiment?: string;
    component_scores?: Record<string, number>;
  };
  /** ML probability (0-100) that the option's peak P/L during its
   *  lifetime exceeds +100%. From notable_ml_v4 — gradient-boosting
   *  classifier trained on lifetime-graded historical entries. NULL
   *  when the model bundle isn't loadable. Rendered in the "ML"
   *  column, sortable, separately colored from NScore. */
  ml_score?: number | null;
}

interface EntryRow {
  msgId: string;
  ts: string;
  timeLabel: string;
  ticker: string;
  side: "Bull" | "Bear";
  action: string;
  contractLabel: string;
  /** Numeric strike value — separated from `contractLabel` so the
   *  contract column sorts by strike rather than alphabetically (which
   *  would make "$1000 CALL" sort before "$200 CALL"). */
  strike: number;
  dte: number | null;
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
  /** Notable-flow score envelope from /flow/iflow/entries?include_notable=true.
   *  Null when the backend wasn't asked to score (shouldn't happen in
   *  EntryTape; included for safety). When this row is a Kian-aggregated
   *  contract (printCount > 1), the `score` here has been recomputed
   *  client-side via recomputeAggregateScore() — convergence/catalyst/
   *  structural come from the seed print; size + conviction reflect the
   *  aggregate. */
  notable: NotableScore | null;
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
  selectedTicker,
  onSelectTicker,
}: Props) {
  // Fan out N parallel per-date queries (one per selected date). React
  // Query dedupes by (date, includeNotable), so re-renders don't re-fetch.
  const dateQueries = useMultiDateEntries(dates, true);
  const isLoading = dateQueries.length > 0 && dateQueries.some((q) => q.isLoading);
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

  // Three filter modes:
  //   none    — show everything
  //   notable — algorithmic score ≥ NOTABLE_THRESHOLD (auditable, multi-signal)
  //   kian    — boolean rule-based filter matching @kiantrades' Twitter logic
  //             (premium ≥ $300K, not ETF, DTE 7-400, directional clarity).
  //             ALSO aggregates same-contract entries (sum premium across
  //             prints) so the row count matches what he posts on Twitter
  //             — his $805K BWA 75C is our $233K + $572K + ... summed.
  // The two are MUTUALLY EXCLUSIVE.
  const [filterMode, setFilterMode] = useState<FilterMode>("none");
  const NOTABLE_THRESHOLD = 65;

  // Kian-mode contract aggregation. Groups entries by
  // (ticker, normalized type, strike, expiry) — collapses C/CALL and
  // P/PUT label inconsistency — sums premium, keeps the strongest ask%
  // (closest to the directional extreme) and the earliest timestamp.
  // Returns one row per CONTRACT, not per print. Only built in kian
  // mode; default and notable modes use the raw per-print entries.
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
      const prem = parseFloat(String(e.premium ?? "0").replace(/[$,]/g, "")) || 0;
      const askRaw = e.ask_pct;
      const ask = askRaw == null ? null : Number(askRaw);
      const ts = String(e._discord_time_utc || e.image_downloaded_at || "");
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
      _discord_time_utc: g.earliestTs || g.seed._discord_time_utc,
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
    // In Kian mode, iterate over the contract-aggregated set so each row
    // represents the whole bet (sum of prints) — matching how he posts
    // on Twitter. In all other modes, iterate raw per-print entries.
    const source = filterMode === "kian" ? aggregatedEntries : entries;
    for (const e of source) {
      const ticker = String(e.ticker || "");
      if (!ticker) continue;
      if (search && !ticker.toUpperCase().includes(search.toUpperCase())) continue;
      if (tradersOnly && authorTickerSet && !authorTickerSet.has(ticker)) continue;
      const dteNum = Number(e.dte ?? 0);
      if (!dteMatch(dteNum)) continue;

      const side = correctedSide(e);
      if (bias === "bullish" && side !== "Bull") continue;
      if (bias === "bearish" && side !== "Bear") continue;

      // Same priority as the backend's _entry_ts: discord post time first
      // (most precise), then image download time (universal baseline,
      // populated by the iFlow fetcher / backfill), then flow_time fallback.
      const tsRaw = String(
        e._discord_time_utc || e.image_downloaded_at || ""
      );
      const type = String(e.type || "").toUpperCase();
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
      // Moneyness as % to ATM. Positive for calls = stock needs to rise;
      // negative for puts = stock needs to fall. Drives the green/red tone.
      let moneyness: number | null = null;
      if (underlying > 0 && strike > 0) {
        moneyness = ((strike - underlying) / underlying) * 100;
        if (type.includes("PUT")) moneyness = -moneyness;
      }

      const contractType = type.includes("CALL") ? "CALL" : type.includes("PUT") ? "PUT" : type;
      const contractLabel = `$${strike} ${contractType}${expiry ? ` ${expiry}` : ""}`;

      // Parse premium once — strip "$" and "," then to number. Used for
      // sorting; the display still uses formatPremium() for readability.
      const premiumNum = parseFloat(String(e.premium ?? "0").replace(/[$,]/g, "")) || 0;

      const notable = (e.notable as NotableScore | null | undefined) ?? null;
      // Apply the active filter mode early so downstream sort/render
      // scans are smaller. Filters are skipped when their required data
      // is missing (e.g. backend score absent) so we don't accidentally
      // hide every row on a partial response.
      if (filterMode === "notable_nscore" && notable && notable.score < NOTABLE_THRESHOLD) continue;
      if (filterMode === "notable_ml") {
        const ml = notable?.ml_score;
        if (ml != null && ml < NOTABLE_THRESHOLD) continue;
      }
      if (filterMode === "notable_both") {
        if (notable && notable.score < NOTABLE_THRESHOLD) continue;
        const ml = notable?.ml_score;
        if (ml != null && ml < NOTABLE_THRESHOLD) continue;
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

      // In Kian mode the source rows carry a `_print_count` from the
      // aggregator. Score + parts get re-derived against the aggregated
      // premium + best ask% so BOTH the score column and the hover
      // tooltip show numbers that reflect the WHOLE bet, not a seed print.
      const printCount = Number((e as any)._print_count ?? 1);
      let rowNotable: NotableScore | null = notable;
      if (filterMode === "kian" && notable && printCount > 1) {
        const rescore = recomputeAggregateScore(notable, premiumNum, askPct, voi, dteNum > 0 ? dteNum : null);
        rowNotable = {
          ...notable,
          score: rescore.score,
          parts: rescore.parts,
        };
      }

      out.push({
        msgId: String(e._msg_id ?? `${ticker}-${strike}-${type}-${expiry}-${tsRaw}`),
        ts: tsRaw,
        timeLabel: fmtTime(tsRaw) || (String(e.flow_time ?? "")),
        ticker,
        side,
        action: actionLabel(type, askPct ?? 50),
        contractLabel,
        strike,
        dte: Number.isFinite(dteNum) && dteNum > 0 ? dteNum : null,
        dteCategory: dteNum > 0 ? dteTag(dteNum) : null,
        voiRatio: voi,
        askPct,
        moneyness,
        premium: premiumNum,
        optType: type,
        optFill: Number(e.avg_price ?? 0),
        underlyingFill: underlying,
        flowDate: String(e._date ?? (e.flow_date ?? date)),
        notable: rowNotable,
        printCount,
      });
    }
    return out;
  }, [entries, aggregatedEntries, bias, dte, search, tradersOnly, authorTickerSet, filterMode]);

  // Batch-fetch current prices for every unique ticker in the visible
  // rows. Refetches every 60s via the hook's refetchInterval — so the
  // P/L column updates in the background while you're looking at it.
  const uniqueTickers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ticker))),
    [rows],
  );
  const { data: pricesResp } = useTickerPricesBatch(uniqueTickers);
  const priceMap = pricesResp?.prices ?? {};

  // Per-row P/L — same delta+theta estimator the grid view's EntryRow uses
  // (canonical impl in iflow/estimator.ts). Null when we can't price the
  // contract yet (price still loading, missing underlying_price at fill,
  // missing avg_price). Memoized over [rows, priceMap] so sort + render
  // don't recompute on every keystroke.
  const pnlByMsg = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const r of rows) {
      const cur = priceMap[r.ticker] || 0;
      if (cur <= 0 || r.underlyingFill <= 0) {
        m[r.msgId] = null;
        continue;
      }
      if (r.optFill > 0 && r.strike > 0) {
        m[r.msgId] = estimateOptionPnl(
          r.underlyingFill, cur, r.optFill, r.strike, r.dte ?? 30,
          r.optType, r.flowDate,
        );
      } else {
        // Fallback: bare underlying % move, direction-adjusted, floored
        // at -100%. Matches EntryRow's secondary path.
        const isPut = r.optType.toUpperCase().includes("PUT");
        const raw = ((cur - r.underlyingFill) / r.underlyingFill) * 100 * (isPut ? -1 : 1);
        m[r.msgId] = Math.max(-100, Math.round(raw));
      }
    }
    return m;
  }, [rows, priceMap]);

  // Active sort — default: time DESC (newest first). The full row list
  // above stays in insertion order; sorting happens here so toggling sort
  // never re-runs the filter pass.
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
        case "voi":      return numCmp(a.voiRatio, b.voiRatio, sortDir);
        case "ask":      return numCmp(a.askPct, b.askPct, sortDir);
        case "atm":      return numCmp(a.moneyness, b.moneyness, sortDir);
        case "premium":  return numCmp(a.premium, b.premium, sortDir);
        case "pnl":      return numCmp(pnlByMsg[a.msgId], pnlByMsg[b.msgId], sortDir);
        case "score":    return numCmp(a.notable?.score ?? null, b.notable?.score ?? null, sortDir);
        case "ml":       return numCmp(a.notable?.ml_score ?? null, b.notable?.ml_score ?? null, sortDir);
        case "avg":      return numCmp(
                           avgScore(a.notable?.score, a.notable?.ml_score),
                           avgScore(b.notable?.score, b.notable?.ml_score),
                           sortDir);
      }
    });
    return copy;
  }, [rows, sortKey, sortDir, pnlByMsg]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(DEFAULT_DIR[k]);
    }
  };

  // Counts for the Notable button — one per cycle state. Computed
  // pre-filter so the badge always shows "how many would pass" no
  // matter which mode is active. MUST be declared before any early
  // return (Rules of Hooks).
  const notableCounts = useMemo(() => {
    let n = 0, m = 0, b = 0;
    for (const e of entries as any[]) {
      const ns = e?.notable?.score;
      const ml = e?.notable?.ml_score;
      const nsHit = ns != null && ns >= NOTABLE_THRESHOLD;
      const mlHit = ml != null && ml >= NOTABLE_THRESHOLD;
      if (nsHit) n += 1;
      if (mlHit) m += 1;
      if (nsHit && mlHit) b += 1;
    }
    return { nscore: n, ml: m, both: b };
  }, [entries]);
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
      const prem = parseFloat(String(e?.premium ?? "0").replace(/[$,]/g, "")) || 0;
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

  // Reusable header cell — clickable, shows the active sort arrow.
  // Defining this AFTER the early returns is safe — it's a plain function
  // expression, not a hook. (Hooks-rules apply only to use*() calls.)
  const Th = ({
    label, k, className,
  }: { label: string; k: SortKey; className: string }) => {
    const active = sortKey === k;
    const Arrow = sortDir === "asc" ? ChevronUp : ChevronDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`${className} flex items-center gap-0.5 select-none cursor-pointer hover:text-text-primary transition-colors`}
        style={{ color: active ? "var(--accent-blue)" : undefined }}
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        {active && <Arrow size={10} strokeWidth={3} />}
      </button>
    );
  };

  return (
    <div className="space-y-0.5 font-mono text-xs">
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          {(() => {
            // Notable button — cycles through:
            //   none → Top NScore → Top ML → Top Both → none
            // Distinct visual per state so the active lens is obvious
            // at a glance (gold for NScore, cyan for ML, purple for
            // intersection). Mutually exclusive with the Flowseidon
            // button — clicking either resets the other.
            const notableModes: FilterMode[] = ["notable_nscore", "notable_ml", "notable_both"];
            const currentNotable: FilterMode = notableModes.includes(filterMode) ? filterMode : "none";
            const style = NOTABLE_STYLE[currentNotable];
            const count =
              currentNotable === "notable_nscore" ? notableCounts.nscore
              : currentNotable === "notable_ml"   ? notableCounts.ml
              : currentNotable === "notable_both" ? notableCounts.both
              : notableCounts.both;
            const onClick = () => {
              const idx = NOTABLE_CYCLE.indexOf(currentNotable);
              const next = NOTABLE_CYCLE[(idx + 1) % NOTABLE_CYCLE.length];
              setFilterMode(next);
              if (next === "notable_ml" && sortKey !== "ml") {
                setSortKey("ml"); setSortDir("desc");
              } else if ((next === "notable_nscore" || next === "notable_both")
                         && sortKey !== "score" && sortKey !== "ml") {
                setSortKey("score"); setSortDir("desc");
              }
            };
            const tooltipFor: Record<FilterMode, string> = {
              none: `Click to cycle: Top NScore (${notableCounts.nscore}) → Top ML (${notableCounts.ml}) → Top Both (${notableCounts.both}) → off`,
              notable_nscore: `Heuristic NScore ≥ ${NOTABLE_THRESHOLD}. Click → Top ML.`,
              notable_ml: `ML probability ≥ ${NOTABLE_THRESHOLD} (P[peak P/L > +100%]). Click → Top Both.`,
              notable_both: `BOTH NScore AND ML ≥ ${NOTABLE_THRESHOLD} — the picks both systems agree on. Click → off.`,
              kian: "",
            };
            return (
              <button
                type="button"
                onClick={onClick}
                className="px-2 py-0.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                style={{ background: style.bg, color: style.fg, border: `1px solid ${style.bd}` }}
                title={tooltipFor[currentNotable]}
              >
                {style.label}
                <span className="opacity-70 font-mono">{count > 0 ? `(${count})` : ""}</span>
              </button>
            );
          })()}
          <button
            type="button"
            onClick={() => {
              const next: FilterMode = filterMode === "kian" ? "none" : "kian";
              setFilterMode(next);
              // Kian filter is rule-based pass/fail — premium sort
              // matches how he visually surfaces "biggest single bets".
              if (next === "kian" && sortKey !== "premium" && sortKey !== "score") {
                setSortKey("premium");
                setSortDir("desc");
              }
            }}
            className="px-2 py-0.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
            style={{
              background: filterMode === "kian" ? "rgba(34,211,238,0.18)" : "transparent",
              color: filterMode === "kian" ? "var(--accent-cyan, #22d3ee)" : "var(--text-muted)",
              border: `1px solid ${filterMode === "kian" ? "rgba(34,211,238,0.50)" : "var(--border)"}`,
            }}
            title={
              "Replication of @kiantrades' (Flowseidon) Twitter selection logic: " +
              "premium ≥ $300K · single-leg · not an index/leveraged ETF · DTE 7–400 · " +
              "directional clarity (call buying / put STO / OTM put hedge). " +
              "Rule-based pass/fail — no score, no convergence."
            }
          >
            <Activity size={11} />
            {filterMode === "kian" ? "Showing Flowseidon" : "Flowseidon"}
            <span className="opacity-70 font-mono">{kianCount > 0 ? `(${kianCount})` : ""}</span>
          </button>
        </div>
        <span className="text-[10px] text-text-muted">
          {sortedRows.length} of {entries.length} entries
          {dates.length > 1 ? ` · ${dates.length} dates` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-muted px-2 py-1 border-b border-border">
        <Th label="avg"      k="avg"      className="w-12 justify-center" />
        <Th label="nscore"   k="score"    className="w-10 justify-center" />
        <Th label="ml"       k="ml"       className="w-10 justify-center" />
        <Th label="time"     k="time"     className="w-12 justify-start" />
        <Th label="ticker"   k="ticker"   className="w-14 justify-start" />
        <Th label="side"     k="side"     className="w-12 justify-start" />
        <Th label="action"   k="action"   className="w-24 justify-start" />
        <Th label="contract" k="contract" className="flex-1 min-w-[160px] justify-start" />
        <Th label="dte"      k="dte"      className="w-14 justify-start" />
        <Th label="vol/oi"   k="voi"      className="w-14 justify-end" />
        <Th label="ask%"     k="ask"      className="w-14 justify-end" />
        <Th label="ATM%"     k="atm"      className="w-16 justify-end" />
        <Th label="premium"  k="premium"  className="w-20 justify-end" />
        <Th label="P/L"      k="pnl"      className="w-16 justify-end" />
      </div>
      {sortedRows.map((r) => {
        const sideColor =
          r.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
        const moneyColor =
          r.moneyness == null
            ? "var(--text-muted)"
            : r.moneyness >= 0
              ? "var(--accent-green)"
              : "var(--accent-red)";
        const isSelected = selectedTicker === r.ticker;
        const scoreNum = r.notable?.score ?? null;
        // Border + glow keyed to Notable score. Falls back to the side
        // color when no score is present (graceful for backend errors).
        const borderStyle = scoreBorderStyle(scoreNum, sideColor);
        // Build the hover tooltip: breakdown of the 5 component scores
        // + which convergence signals lit up. Same data that justifies
        // the number — auditable, not editorial.
        const scoreTitle = (() => {
          if (!r.notable) return "Notable score unavailable";
          const p = r.notable.parts;
          const sf = r.notable.signals;
          const isAggregated = r.printCount > 1;
          // ALWAYS show the actual numeric breakdown. For aggregated
          // rows, the size + conviction values are the re-derived ones
          // (from recomputeAggregateScore) and we add a note about that.
          const parts = [
            `score ${r.notable.score} / 100${isAggregated ? ` (aggregated across ${r.printCount} prints)` : ""}`,
            `size ${p.size.toFixed(2)}  convergence ${p.convergence.toFixed(2)}  conviction ${p.conviction.toFixed(2)}`,
            `catalyst ${p.catalyst.toFixed(2)}  structural ${p.structural.toFixed(2)}`,
          ];
          const sigBits: string[] = [];
          if (sf.intel_bias) sigBits.push(`intel ${sf.intel_bias}`);
          if (sf.forecast_dir) sigBits.push(`forecast ${sf.forecast_dir}`);
          if (sf.accumulation_label) sigBits.push(sf.accumulation_label);
          if (sf.trader_calls_24h) {
            const same = sf.trader_same_dir_24h ?? 0;
            sigBits.push(`${sf.trader_calls_24h} trader call(s) 24h (${same} aligned)`);
          }
          if (sf.news_24h) sigBits.push(`${sf.news_24h} news 24h`);
          if (sf.voices_7d) {
            const sent = sf.voices_sentiment ? ` ${sf.voices_sentiment}` : "";
            sigBits.push(`${sf.voices_7d} voices mentions 7d${sent}`);
          }
          if (sigBits.length) parts.push("signals: " + sigBits.join(" · "));
          return parts.join("\n");
        })();
        return (
          <button
            key={r.msgId}
            type="button"
            onClick={() => onSelectTicker(r.ticker)}
            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-card-hover transition-colors text-left"
            style={{
              background: isSelected ? "rgba(88,166,255,0.08)" : "transparent",
              ...borderStyle,
            }}
          >
            {/* AVG — promoted to first position. Mean of NScore + ML;
                empirical correlation analysis (2026-05-28) showed AVG
                beats both individual scorers (r=+0.246 vs ML r=+0.229
                vs NScore r=+0.157). Bigger / bolder than the individual
                columns since it's the headline number. */}
            {(() => {
              const avg = avgScore(r.notable?.score, r.notable?.ml_score);
              const ns = r.notable?.score;
              const ml = r.notable?.ml_score;
              const title = avg == null
                ? "Average score unavailable (no NScore + ML data)"
                : `AVG = ${avg}/100  (NScore ${ns ?? "—"} + ML ${ml ?? "—"} / 2)\n` +
                  `Headline score — mean of the heuristic + ML.\n` +
                  `Empirically the strongest single signal (Pearson +0.246 vs realized peak P/L).`;
              return (
                <span
                  className="w-12 text-center font-bold text-sm"
                  style={{ color: avgTextColor(avg) }}
                  title={title}
                >
                  {avg != null ? avg : "—"}
                </span>
              );
            })()}
            {/* NScore — heuristic 5-component blend (notable_score.py)
                with empirically-recalibrated weights. Component breakdown
                in the hover tooltip. */}
            <span
              className="w-10 text-center font-semibold"
              style={{ color: scoreTextColor(scoreNum) }}
              title={scoreTitle}
            >
              {scoreNum != null ? scoreNum : "—"}
            </span>
            {/* ML — gradient boosting P(peak P/L > +100%) — notable_ml_v4. */}
            {(() => {
              const ml = r.notable?.ml_score ?? null;
              const mlTitle = ml == null
                ? "ML score unavailable (model bundle not loaded server-side)"
                : `ML probability: ${ml}/100\n` +
                  `Trained classifier — P("option peak P/L will exceed +100%" at some point during its lifetime)\n` +
                  `Source: notable_ml_v4 (gradient boosting, peak-graded labels)`;
              return (
                <span
                  className="w-10 text-center font-semibold"
                  style={{ color: mlTextColor(ml) }}
                  title={mlTitle}
                >
                  {ml != null ? ml : "—"}
                </span>
              );
            })()}
            <span className="w-12 text-text-secondary">{r.timeLabel}</span>
            <span className="w-14 font-semibold text-text-primary">{r.ticker}</span>
            <span
              className="w-12 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase text-center"
              style={{
                background: `${sideColor}1f`,
                color: sideColor,
                border: `1px solid ${sideColor}40`,
              }}
            >
              {r.side}
            </span>
            <span className="w-24 text-text-secondary">{r.action}</span>
            <span className="flex-1 min-w-[160px] text-text-primary truncate flex items-center gap-1.5" title={r.contractLabel}>
              <span className="truncate">{r.contractLabel}</span>
              {r.printCount > 1 && (
                <span
                  className="px-1 rounded text-[9px] font-mono font-bold shrink-0"
                  style={{
                    color: "var(--accent-cyan, #22d3ee)",
                    background: "rgba(34,211,238,0.10)",
                    border: "1px solid rgba(34,211,238,0.30)",
                  }}
                  title={`Aggregated from ${r.printCount} prints (same ticker/strike/type/expiry). Premium and score reflect the sum; ask% is the most directional across prints.`}
                >
                  ×{r.printCount}
                </span>
              )}
            </span>
            <span className="w-14 flex items-center gap-1 text-text-muted">
              {r.dte ? <span>{r.dte}d</span> : null}
              {r.dteCategory ? (
                <span
                  className="px-1 rounded text-[9px] font-bold"
                  style={{
                    color: r.dteCategory.color,
                    background: r.dteCategory.bg,
                  }}
                >
                  {r.dteCategory.text}
                </span>
              ) : null}
            </span>
            <span
              className="w-14 text-right"
              style={{
                color: r.voiRatio != null && r.voiRatio >= 2
                  ? "var(--accent-green)"
                  : "var(--text-secondary)",
              }}
            >
              {r.voiRatio != null ? `${r.voiRatio.toFixed(1)}×` : "—"}
            </span>
            <span
              className="w-14 text-right"
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
            <span className="w-16 text-right" style={{ color: moneyColor }}>
              {r.moneyness != null
                ? `${r.moneyness >= 0 ? "+" : ""}${r.moneyness.toFixed(1)}%`
                : "—"}
            </span>
            <span className="w-20 text-right text-text-primary">
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
                  className="w-16 text-right font-semibold"
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
  );
}
