export interface TickerMatch {
  ticker: string;
  name: string;
  score: number;
}

/** Rank tickers by symbol or company name: "apple" and "appl" both surface AAPL. Names
 *  match at a word start, so "gem" doesn't find Apollo Global Management. */
export function rankTickers(names: Record<string, string>, raw: string, limit: number): TickerMatch[] {
  const query = raw.trim();
  if (!query) return [];
  const upper = query.toUpperCase();
  const lower = query.toLowerCase();
  const out: TickerMatch[] = [];
  for (const [ticker, name] of Object.entries(names)) {
    const nameLower = (name || "").toLowerCase();
    let score = -1;
    if (ticker === upper) score = 100;
    else if (ticker.startsWith(upper)) score = 90 - (ticker.length - upper.length); // prefer shorter symbols
    else if (nameLower.startsWith(lower)) score = 70;
    else if (ticker.includes(upper)) score = 50;
    else if (nameLower.split(/[\s,.&-]+/).some((word) => word.startsWith(lower))) score = 40;
    if (score >= 0) out.push({ ticker, name, score });
  }
  out.sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  return out.slice(0, limit);
}
