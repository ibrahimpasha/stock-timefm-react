/**
 * React Query hooks used by IFlowTracker.
 *
 * Each hook is colocated with the feature because they're feature-specific
 * (the multi-date summary, the intel batch). Generic API hooks live in
 * src/api/*. If one of these grows a second caller, lift it to src/api/.
 *
 * Prewarming contract:
 *   - `useTickerEarningsBatch` and `useTickerIntelBatch` are designed to fire
 *     on mount. The server SQLite cache makes the repeat call cheap (~6ms),
 *     so always-enabled is the right default for "instant first click."
 */

import { useQuery, useQueries, keepPreviousData } from "@tanstack/react-query";
import apiClient from "../../../api/client";
import { tickersKey } from "../../../api/cacheKey";
import { STALE_TIMES } from "../../../lib/constants";
import type {
  DteFilter,
  IFlowSummaryData,
  TickerIntel,
  FlowReturnsResponse,
} from "./types";

/* ── DTE → query-string mapper used by the summary endpoints ─────────── */
function dteParam(dte: DteFilter): string {
  if (dte === "lotto") return "&dte_min=1&dte_max=14";
  if (dte === "swing") return "&dte_min=15&dte_max=60";
  if (dte === "leap") return "&dte_min=61";
  return "";
}

/* ── List of dates that have any flow ────────────────────────────────── */
export function useIFlowDates() {
  return useQuery<{ dates: { date: string; entries: number }[] }>({
    queryKey: ["iflow", "dates"],
    queryFn: () => apiClient.get("/flow/iflow/dates").then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

/* ── Summary for one date ────────────────────────────────────────────── */
export function useIFlowSummary(date: string, dte: DteFilter) {
  const p = dteParam(dte);
  return useQuery<IFlowSummaryData>({
    queryKey: ["iflow", "summary", date, dte],
    queryFn: () => apiClient.get(`/flow/iflow/summary?date=${date}${p}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

/* ── One summary per date, in parallel ───────────────────────────────── */
export function useMultiDateSummaries(dates: string[], dte: DteFilter) {
  const p = dteParam(dte);
  return useQueries({
    queries: dates.map((date) => ({
      queryKey: ["iflow", "summary", date, dte],
      queryFn: () =>
        apiClient.get<IFlowSummaryData>(`/flow/iflow/summary?date=${date}${p}`).then((r) => r.data),
      staleTime: STALE_TIMES.flow,
      enabled: !!date,
    })),
  });
}

/* ── Raw entries across N dates (parallel, React Query dedup-cached) ───
 * Returns an array of query results — one per date. Caller merges as
 * needed. Mirrors useMultiDateSummaries so any per-date caching that's
 * already warm gets reused. */
export function useMultiDateEntries(dates: string[], includeNotable = false) {
  const n = includeNotable ? "&include_notable=true" : "";
  return useQueries({
    queries: dates.map((date) => ({
      queryKey: ["iflow", "entries", date, "", includeNotable],
      queryFn: () =>
        apiClient.get<{ entries: any[] }>(`/flow/iflow/entries?date=${date}${n}`).then((r) => r.data),
      staleTime: STALE_TIMES.flow,
      enabled: !!date,
    })),
  });
}

/* ── Raw entries for one date (optionally filtered by ticker) ────────── */
export function useIFlowEntries(date: string, ticker?: string, includeNotable = false) {
  const t = ticker ? `&ticker=${ticker}` : "";
  const n = includeNotable ? "&include_notable=true" : "";
  return useQuery<{ entries: any[] }>({
    queryKey: ["iflow", "entries", date, ticker || "", includeNotable],
    queryFn: () => apiClient.get(`/flow/iflow/entries?date=${date}${t}${n}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!date,
  });
}

/* ── Per-ticker multi-day history. Server walks up to 365d. ──────────── */
export interface IFlowHistoryResponse {
  by_date: Record<string, { entries: any[]; entry_count: number }>;
  summary?: {
    total_premium: number;
    total_bull_premium: number;
    total_bear_premium: number;
    dominant_side: "Bull" | "Bear" | "Mixed";
    days_active: number;
    strikes_escalating: boolean;
  };
  accumulation_score?: number;
  accumulation_label?: string;
  conviction_status?: string;
  exit_signals?: Array<unknown>;
}

export function useIFlowHistory(ticker: string) {
  return useQuery<IFlowHistoryResponse>({
    queryKey: ["iflow", "history", ticker],
    // Walk all available flow (server walker stops when it runs out of date
    // dirs). Earliest dir is 2026-03-16 — older "Flow History (N)" counts
    // were artificially clipped by the previous 30-day default.
    queryFn: () => apiClient.get(`/flow/iflow/history?ticker=${ticker}&days=365`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

/* ── Per-ticker escalation rollup for ALL visible tickers (one HTTP) ── */
export interface EscRollup {
  escalating: boolean;
  dominant_side: "Bull" | "Bear" | "Mixed";
  total_premium: number;
  days_active: number;
}
export function useEscalatingBatch(tickers: string[], days = 14) {
  const { key, param, sorted } = tickersKey(tickers);
  return useQuery<Record<string, EscRollup>>({
    queryKey: ["iflow", "escalating-batch", days, key],
    queryFn: () =>
      apiClient
        .get<{ tickers: Record<string, EscRollup> }>(
          `/flow/iflow/escalating-batch?days=${days}&tickers=${param}`,
        )
        .then((r) => r.data.tickers),
    staleTime: STALE_TIMES.flow * 3,
    enabled: sorted.length > 0,
  });
}

/* ── Escalation/accumulation intel for the top N tickers ─────────────── */
export function useTickerIntelBatch(tickers: string[]) {
  const keys = tickers.slice(0, 40);
  return useQuery<Record<string, TickerIntel>>({
    queryKey: ["iflow", "intel-batch", keys.join(",")],
    queryFn: async () => {
      const result: Record<string, TickerIntel> = {};
      const fetches = keys.map(async (t) => {
        try {
          const { data } = await apiClient.get(`/flow/iflow/history?ticker=${t}&days=14`);
          result[t] = {
            escalating: data.summary?.strikes_escalating || false,
            accumScore: data.accumulation_score || 0,
            accumLabel: data.accumulation_label || "",
            exitSignals: (data.exit_signals || []).length,
            daysActive: data.summary?.days_active || 0,
          };
        } catch {
          /* skip — intel batch is best-effort */
        }
      });
      await Promise.all(fetches);
      return result;
    },
    staleTime: STALE_TIMES.flow * 3,
    enabled: keys.length > 0,
  });
}

/* ── Earnings batch ───────────────────────────────────────────────────
 * Server-backed by SQLite (results/intelligence.db, table `ticker_earnings`)
 * with a 24h TTL. Client mirrors at 12h for safe overlap. PREWARMS on mount
 * so the Earnings filter is instant when the user clicks 1W/2W/1M/2M.
 */
const EARNINGS_STALE_MS = 12 * 60 * 60_000; // half the server TTL — safe overlap

export function useTickerEarningsBatch(tickers: string[]) {
  const { key, param, sorted } = tickersKey(tickers);

  return useQuery<Record<string, string | null>>({
    queryKey: ["ticker-earnings-batch", key],
    queryFn: async () => {
      const { data } = await apiClient.get<Record<string, string | null>>(
        `/market/earnings-batch?tickers=${param}`,
      );
      return data ?? {};
    },
    staleTime: EARNINGS_STALE_MS,
    enabled: sorted.length > 0,
    // Keep the prior batch visible while a new one is in flight. The ticker
    // universe changes as per-date summaries trickle in, so the cache key
    // churns; without this, "loading earnings…" flashes on every change.
    placeholderData: keepPreviousData,
  });
}

/* ── Single-ticker convenience wrapper around earnings-batch ─────────── */
export function useTickerEarnings(ticker: string) {
  return useQuery<{ earnings_date: string | null }>({
    queryKey: ["ticker-earnings-single", ticker],
    queryFn: async () => {
      const { data } = await apiClient.get<Record<string, string | null>>(
        `/market/earnings-batch?tickers=${encodeURIComponent(ticker)}`,
      );
      return { earnings_date: data?.[ticker] ?? null };
    },
    staleTime: EARNINGS_STALE_MS,
    enabled: !!ticker,
  });
}

/* ── Flow P/L per ticker (Highest Returns sort) ──────────────────────── */
export function useFlowReturns(enabled = false) {
  return useQuery<FlowReturnsResponse>({
    queryKey: ["flow-returns", "all"],
    queryFn: async () => {
      const { data } = await apiClient.get<FlowReturnsResponse>(`/flow/iflow/returns?days=365`);
      return (
        data ?? {
          meta: { earliest_date: null, latest_date: null, days_covered: 0, entry_count: 0 },
          tickers: {},
        }
      );
    },
    staleTime: 30 * 60_000,
    enabled,
  });
}

/* ── Per-ticker flow entries (last N days), used by watched-contracts view ───
 *
 * We call /flow/iflow/entries-export?tickers=T&days=30 — already server-side
 * cached for an hour. React Query gives us a second layer of per-ticker
 * cache reuse: a watched-contracts view with 3 tickers makes 3 parallel GETs;
 * subsequent renders use the cached responses until staleTime elapses.
 *
 * Returns the raw enriched-entries list for the ticker; aggregation happens
 * in `ContractsView` so the cache key stays simple (ticker + days only).
 */
export function useTickerFlowExport(ticker: string, days = 30, enabled = true) {
  return useQuery<{ entries: any[] }>({
    queryKey: ["ticker-flow-export", ticker, days],
    queryFn: () =>
      apiClient
        .get(`/flow/iflow/entries-export?days=${days}&tickers=${encodeURIComponent(ticker)}`)
        .then((r) => r.data),
    staleTime: 10 * 60_000, // 10min — server's TTL is 60min, half is safe
    enabled: enabled && !!ticker,
  });
}

/* ── Live underlying price for P/L badge ─────────────────────────────── */
export function useStockPrice(ticker: string) {
  return useQuery<{ price: number }>({
    queryKey: ["market-price", ticker],
    queryFn: () => apiClient.get(`/market/price?ticker=${ticker}`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!ticker,
  });
}

/** Current price for many tickers in one HTTP round trip. Returned dict is
 *  keyed by ticker; tickers with no price are absent (caller falls back
 *  to 0 / "loading"). Used by EntryTape to compute per-row P/L without
 *  firing N parallel useStockPrice queries. */
export function useTickerPricesBatch(tickers: string[]) {
  const { key, param, sorted } = tickersKey(tickers);
  return useQuery<{ prices: Record<string, number>; missing: string[] }>({
    queryKey: ["market-prices-batch", key],
    queryFn: () =>
      apiClient.get(`/market/prices-batch?tickers=${param}`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: sorted.length > 0,
  });
}
