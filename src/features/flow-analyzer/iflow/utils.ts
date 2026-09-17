/**
 * Pure helpers for option-flow classification & scoring.
 *
 * These mirror the logic the backend uses for ranking and conviction display.
 * Keep them pure (no React, no apiClient) so they're trivially testable.
 */

import type {
  DteFilter,
  EarningsWindow,
  MlCalibrationStatus,
} from "./types";

/**
 * How many days into the future an "Earnings filter" considers when active.
 * `Infinity` for "Any" so the filter is a no-op.
 */
export const EARNINGS_WINDOW_DAYS: Record<EarningsWindow, number> = {
  all: Infinity,
  today: 0,
  "1w": 7,
  "2w": 14,
  "1m": 30,
  "2m": 60,
};

/**
 * Decide whether an entry is institutional Bull or Bear given the raw fields.
 *
 * Logic precedence:
 *   1. If the upstream `side` already says BULL/BEAR, trust it and just pick
 *      the right action label from the option type.
 *   2. Otherwise infer from ask% (>=55 = buying, <40 = selling) with vol/OI
 *      ratio as the tiebreaker for the 40-55 band.
 *
 * Output `action` is plain English ("call buying", "put selling") for UI use.
 */
export function classifySide(
  optType: string,
  askPct?: number | null,
  volOi?: number | null,
  fallback?: string,
) {
  const rawType = (optType || "").toUpperCase().trim();
  const t = rawType === "C" ? "CALL" : rawType === "P" ? "PUT" : rawType;
  const fb = (fallback || "").toLowerCase();
  const ask = askPct ?? 50;
  const voi = volOi ?? 0;
  const buying = ask >= 55 ? true : ask < 40 ? false : voi >= 1.5;

  if (fb.includes("bull") || fb.includes("bear")) {
    const side = fb.includes("bull") ? ("Bull" as const) : ("Bear" as const);
    let action = "";
    if (t.includes("CALL")) action = side === "Bull" ? "call buying" : "call selling";
    else if (t.includes("PUT")) action = side === "Bear" ? "put buying" : "put selling";
    return { side, action };
  }

  if (t.includes("CALL")) {
    return buying
      ? { side: "Bull" as const, action: "call buying" }
      : { side: "Bear" as const, action: "call selling" };
  }
  if (t.includes("PUT")) {
    return buying
      ? { side: "Bear" as const, action: "put buying" }
      : { side: "Bull" as const, action: "put selling" };
  }
  return { side: "Bear" as "Bull" | "Bear", action: "" };
}

/**
 * Normalize an expiry to canonical "M/D" so "05/22", "2026-05-22", "5/22"
 * all compare equal. Mirrors backend `_norm_expiry` in
 * `src/alerts_positions.py` so frontend grouping matches backend grouping.
 */
export function normExpiry(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${parseInt(iso[2], 10)}/${parseInt(iso[3], 10)}`;
  const md = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?$/);
  if (md) return `${parseInt(md[1], 10)}/${parseInt(md[2], 10)}`;
  return v;
}

/**
 * Parse a Discord-style premium value like "$1.5M" / "$250K" / "$425" into
 * raw dollars. Numeric API fields pass through unchanged. Returns 0 for
 * unparseable input so callers can use one conversion path for old and new
 * response shapes.
 */
export function parsePremium(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/[$,\s]/g, "")
    .toUpperCase();
  const match = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([KMB])?$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const multiplier = match[2] === "B" ? 1e9 : match[2] === "M" ? 1e6 : match[2] === "K" ? 1e3 : 1;
  return amount * multiplier;
}

/** Experimental research ordering, not the persona's final selection. NScore and
 * directional Setup form the evidence base. A quarantined model can adjust
 * that base by at most three points; only a governed model joins the weighted
 * base. Missing base components are reweighted instead of silently becoming
 * zero. This is an ordering score, never an outcome probability. */
export function researchRank(
  setup: number | null | undefined,
  mlPercentile: number | null | undefined,
  evidence: number | null | undefined,
  servingMode: string | null | undefined,
): number | null {
  const governed = servingMode === "gate_and_rank";
  const requested: Array<[number | null | undefined, number]> = governed
    ? [[mlPercentile, 0.45], [evidence, 0.35], [setup, 0.2]]
    : [[evidence, 0.65], [setup, 0.35]];
  const available = requested.filter((item): item is [number, number] =>
    typeof item[0] === "number" && Number.isFinite(item[0]));
  const weight = available.reduce((sum, [, value]) => sum + value, 0);
  if (!weight) return null;
  const base = available.reduce((sum, [score, value]) => sum + score * value, 0) / weight;
  const modelAdjustment = !governed && servingMode !== "disabled" && typeof mlPercentile === "number" && Number.isFinite(mlPercentile)
    ? Math.max(-3, Math.min(3, (mlPercentile - 50) / 10))
    : 0;
  return Math.round(Math.max(0, Math.min(100, base + modelAdjustment)));
}

/** Probability is displayable only when the response explicitly confirms both
 * model approval and calibration. Missing legacy metadata fails closed. */
export function canShowMlProbability(
  approved: boolean | null | undefined,
  calibrationStatus: MlCalibrationStatus | string | null | undefined,
): boolean {
  return approved === true && calibrationStatus === "calibrated";
}

/**
 * Whether a DTE value (or undefined) passes the current DTE filter.
 * "all" → always true. Other values bucket DTE into the named windows.
 */
export function matchesDte(dte: number | null | undefined, f: DteFilter): boolean {
  if (f === "all") return true;
  const d = dte || 0;
  if (d <= 0) return false;
  if (f === "lotto") return d <= 14;
  if (f === "swing") return d > 14 && d <= 60;
  if (f === "leap") return d > 60;
  return true;
}

/**
 * The little colored DTE pill shown next to entries. Returns null when there's
 * no DTE so callers can `{dl && <span>}` it.
 */
export function dteTag(
  dte: number | null | undefined,
): { text: string; color: string; bg: string } | null {
  const d = dte || 0;
  if (d > 0 && d <= 14) return { text: "LOTTO", color: "var(--accent-orange)", bg: "rgba(227,127,46,0.12)" };
  if (d > 14 && d <= 60) return { text: "SWING", color: "var(--accent-blue)", bg: "rgba(88,166,255,0.12)" };
  if (d > 60) return { text: "LEAP", color: "var(--accent-cyan)", bg: "rgba(56,211,168,0.12)" };
  return null;
}

/**
 * Heuristic conviction score for an entry. Higher = more institutional. Used
 * by TopPicks to pick the >=7.0 standouts each day.
 *
 * Buckets:
 *   - Premium:   >=$5M: +2.5, >=$1M: +2, >=$500k: +1.5, >=$200k: +1
 *   - Ask%:      >=90:  +2,   >=75:  +1.5, >=50: +1
 *   - Vol/OI:    >=100: +3,   >=10:  +2,   >=5:  +1.5, >=2: +1
 *   - Side match (Bull+CALL or Bear+PUT): +1.5
 *   - DTE:       <3: -3,      <7:    -1.5, >=90: +0.5
 */
export function scoreEntry(e: any): number {
  let s = 0;
  const prem = parsePremium(e.premium || "$0");
  const voi = e.vol_oi_ratio || 0;
  const ask = e.ask_pct || 0;
  const dte = e.dte || 0;
  const { side } = classifySide(e.type || e.option_type, e.ask_pct, e.vol_oi_ratio, e.side);
  const t = (e.type || e.option_type || "").toUpperCase();
  if (prem >= 5e6) s += 2.5;
  else if (prem >= 1e6) s += 2;
  else if (prem >= 5e5) s += 1.5;
  else if (prem >= 2e5) s += 1;
  if (ask >= 90) s += 2;
  else if (ask >= 75) s += 1.5;
  else if (ask >= 50) s += 1;
  if (voi >= 100) s += 3;
  else if (voi >= 10) s += 2;
  else if (voi >= 5) s += 1.5;
  else if (voi >= 2) s += 1;
  if ((side === "Bear" && t.includes("PUT")) || (side === "Bull" && t.includes("CALL"))) s += 1.5;
  if (dte < 3) s -= 3;
  else if (dte < 7) s -= 1.5;
  else if (dte >= 90) s += 0.5;
  return s;
}
