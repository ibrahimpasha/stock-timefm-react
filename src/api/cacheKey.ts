/**
 * Shared helpers for building React Query cache keys from API inputs.
 *
 * The functions here keep cache identity stable across permutations: sorting
 * ticker lists so `["AAPL","MSFT"]` and `["MSFT","AAPL"]` share an entry,
 * matching the backend's symbol-set parsing.
 */

export interface TickerKey {
  /** Canonical comma-joined list — use in queryKey arrays. */
  key: string;
  /** URL-encoded form — drop into query strings: `?tickers=${param}`. */
  param: string;
  /** The sorted list itself, in case the caller needs it for iteration. */
  sorted: string[];
}

/**
 * Sort + dedupe + encode a list of tickers for use as a stable batch query key.
 *
 * Returns three views so callers don't re-derive them: the joined `key` (for
 * `queryKey` arrays), the URL-encoded `param` (to splice into `?tickers=…`),
 * and the `sorted` list itself.
 */
export function tickersKey(tickers: readonly string[]): TickerKey {
  const sorted = [...new Set(tickers)].sort();
  const key = sorted.join(",");
  return { key, param: encodeURIComponent(key), sorted };
}
