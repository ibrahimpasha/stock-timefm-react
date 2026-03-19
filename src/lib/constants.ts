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
  ensemble: "#ffffff",
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
  timesfm: "TimesFM",
  arima: "ARIMA",
  deepar: "DeepAR",
  tide: "TiDE",
  ensemble: "Ensemble",
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
  forecast: 5 * 60_000, // 5min
  intel: 10 * 60_000, // 10min
  eval: 5 * 60_000, // 5min
  flow: 60_000, // 1min
} as const;

/** Navigation items */
export const NAV_ITEMS = [
  { label: "Forecast", path: "/" },
  { label: "Command Center", path: "/command-center" },
  { label: "Model Eval", path: "/eval" },
  { label: "Intelligence", path: "/intel" },
  { label: "Signal Analysis", path: "/signals" },
] as const;
