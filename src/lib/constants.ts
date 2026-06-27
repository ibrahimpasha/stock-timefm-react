/** Model display colors — keyed by model name from the backend */
export const MODEL_COLORS: Record<string, string> = {
  prophet: "#58a6ff",
  dlinear: "#3fb950",
  patchtst: "#f85149",
  itransformer: "#bc8cff",
  timemixer: "#ffa500",
  timexer: "#40e0d0",
  timesnet: "#ff6b9d",
  timesfm: "#e3b341",
  arima: "#8b949e",
  deepar: "#da3633",
  tide: "#79c0ff",
  chronos2: "#ffa500",
  claude: "#cc785c",
  ensemble: "#f0c040",
};

/** Human-readable model labels */
export const MODEL_LABELS: Record<string, string> = {
  prophet: "Prophet",
  dlinear: "DLinear",
  patchtst: "PatchTST",
  itransformer: "iTransformer",
  timemixer: "TimeMixer",
  timexer: "TimeXer",
  timesnet: "TimesNet",
  timesfm: "TimesFM 2.5",
  arima: "ARIMA",
  deepar: "DeepAR",
  tide: "TiDE",
  chronos2: "Chronos-2",
  claude: "Claude Opus",
  ensemble: "Ensemble (per-ticker top-N)",
};

/** Quantile band colors (fill) */
export const BAND_COLORS = {
  q10_q90: "rgba(88, 166, 255, 0.08)",
  q25_q75: "rgba(88, 166, 255, 0.18)",
} as const;

/** Direction badge colors */
export const DIRECTION_COLORS = {
  BULL: "#3fb950",
  BEAR: "#f85149",
  NEUTRAL: "#8b949e",
} as const;

/** Conviction badge colors */
export const CONVICTION_COLORS = {
  high: "#3fb950",
  medium: "#ffa500",
  lotto: "#f85149",
} as const;

/** Flow alert state colors */
export const ALERT_STATE_COLORS: Record<string, string> = {
  WATCHING: "#8b949e",
  DIPPING: "#ffa500",
  BUY_NOW: "#3fb950",
  PEAKED: "#f85149",
  WAIT: "#bc8cff",
};

/** Default ticker */
export const DEFAULT_TICKER = "INTC";

/** React Query stale times */
export const STALE_TIMES = {
  price: 30_000, // 30s
  forecast: 60_000, // 1min — forecasts should refresh frequently
  marketHistory: 10 * 60_000, // 10min — daily OHLCV barely moves intraday; long
  // cache makes re-clicking a previously-viewed ticker's chart instant
  intel: 10 * 60_000, // 10min
  eval: 5 * 60_000, // 5min
  flow: 60_000, // 1min
} as const;

/** Intelligence bullet tag colors — used by V2 panel and any future bullet renderer.
 *
 *  Also drives catalyst chip coloring in the Traders → Signals view.
 *  Keys are normalized via `catalystTagColor()` below (uppercased, punctuation
 *  forgiven) so "FDA", "fda", and "Fda" all map to the same color.
 */
export const INTEL_TAG_COLORS: Record<string, string> = {
  CATALYST: "var(--accent-orange)",
  VALUATION: "var(--accent-blue)",
  RISK: "var(--accent-red)",
  FLOW: "var(--accent-purple)",
  // Trader-alert catalyst types — used in the Signals view's chip strips.
  EARNINGS: "var(--accent-orange)",
  FOMC: "var(--accent-blue)",
  FDA: "var(--accent-purple)",
  "M&A": "var(--accent-cyan)",
  MA: "var(--accent-cyan)",
  LOCKUP: "var(--accent-red)",
  GUIDANCE: "var(--accent-orange)",
  BEAT: "var(--accent-green)",
  MISS: "var(--accent-red)",
  SPINOFF: "var(--accent-purple)",
  BUYBACK: "var(--accent-green)",
} as const;

/** Look up the chip color for a catalyst tag, tolerant of casing/punctuation. */
export function catalystTagColor(tag: string): string {
  const norm = tag.trim().toUpperCase();
  if (norm in INTEL_TAG_COLORS) return INTEL_TAG_COLORS[norm];
  // M&A → also try with the ampersand stripped
  const stripped = norm.replace(/[^A-Z0-9&]/g, "");
  if (stripped in INTEL_TAG_COLORS) return INTEL_TAG_COLORS[stripped];
  return "var(--text-secondary)";
}

/** Intelligence LLM view colors (BULL/BEAR/NEUTRAL) — used in the LLM Panel tile */
export const INTEL_VIEW_COLORS: Record<string, string> = {
  BULL: "var(--accent-green)",
  BEAR: "var(--accent-red)",
  NEUTRAL: "var(--text-secondary)",
} as const;

/** Navigation items */
export const NAV_ITEMS = [
  { label: "Command Center", path: "/" },
  { label: "Pillars", path: "/pillars" },
  { label: "Traders", path: "/traders" },
  { label: "Map", path: "/map" },
] as const;
