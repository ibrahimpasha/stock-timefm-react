export interface PriceCoverage {
  ticker_count?: number;
  ticker_priced?: number;
  price_coverage_pct?: number;
  tickers_missing_price?: string[];
  benchmark_missing?: string[];
}

export function flowCoverage(meta?: PriceCoverage | null) {
  const pct = meta?.price_coverage_pct;
  const benchmarks = meta?.benchmark_missing ?? [];
  const known = pct != null && Number.isFinite(pct);
  const reliable = known && pct >= 90 && !benchmarks.length;
  const label = known ? `Price coverage ${pct.toFixed(1)}%${meta?.ticker_priced != null && meta.ticker_count != null ? ` (${meta.ticker_priced}/${meta.ticker_count} tickers)` : ""}` : "Price coverage unknown";
  return { reliable, label: `${label}${benchmarks.length ? `; benchmarks missing: ${benchmarks.join(", ")}` : ""}${reliable ? "" : "; return ranking withheld"}. Modeled option estimates, not executed returns.` };
}
