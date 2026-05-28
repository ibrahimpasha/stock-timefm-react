/**
 * Pure helpers for option-flow classification & scoring.
 *
 * These mirror the logic the backend uses for ranking and conviction display.
 * Keep them pure (no React, no apiClient) so they're trivially testable.
 */

import type { DteFilter, EarningsWindow } from "./types";

/**
 * How many days into the future an "Earnings filter" considers when active.
 * `Infinity` for "Any" so the filter is a no-op.
 */
export const EARNINGS_WINDOW_DAYS: Record<EarningsWindow, number> = {
  all: Infinity,
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
  const t = (optType || "").toUpperCase();
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
 * Parse a Discord-style premium string like "$1.5M" / "$250K" / "$425" into
 * a raw dollar number. Returns 0 for unparseable input.
 */
export function parsePremium(s: string): number {
  const c = (s || "").replace("$", "").replace(/,/g, "").trim();
  if (c.toUpperCase().endsWith("M")) return parseFloat(c) * 1e6;
  if (c.toUpperCase().endsWith("K")) return parseFloat(c) * 1e3;
  return parseFloat(c) || 0;
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
