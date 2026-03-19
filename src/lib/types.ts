/* ── Forecast ──────────────────────────────────────────────── */

export interface Prediction {
  timestamp: string;
  price: number;
  change: number;
  pct_change: number;
  q10: number;
  q25: number;
  q75: number;
  q90: number;
}

export interface ModelForecast {
  model: string;
  prices: number[];
  end_price: number;
  predictions: Prediction[];
  current_price: number;
  latency_ms: number;
}

export interface EnsembleResult {
  models: ModelForecast[];
  ensemble_prices: number[];
  ensemble_end: number;
  num_models: number;
}

/* ── Signal Analysis ──────────────────────────────────────── */

export interface Signal {
  direction: "BULL" | "BEAR" | "NEUTRAL";
  confidence: number;
  pct_move: number;
  t1: number;
  t2: number;
  entry_low: number;
  entry_high: number;
  agreeing: number;
  total_models: number;
}

export interface SignalResult {
  ticker: string;
  signal: Signal;
  thesis?: string;
  models: ModelForecast[];
  timestamp: string;
}

/* ── Options Flow ─────────────────────────────────────────── */

export interface FlowPick {
  id: number;
  ticker: string;
  direction: "bullish" | "bearish";
  conviction: "high" | "medium" | "lotto";
  category: "directional" | "swing" | "lotto";
  strike: number;
  option_type: "CALL" | "PUT";
  expiry: string;
  flow_size: string;
  vol_oi_ratio: number;
  ask_pct: number;
  avg_fill: number;
  rationale: string;
  option_entry_premium: number;
  option_current_premium: number;
  option_pnl_pct: number;
  stock_entry_price: number;
  stock_current_price: number;
  status: "open" | "closed";
  entry_date: string;
}

export interface FlowAlert {
  id: number;
  ticker: string;
  strike: number;
  option_type: string;
  side: "Bull" | "Bear";
  premium: string;
  state: "WATCHING" | "DIPPING" | "BUY_NOW" | "PEAKED" | "WAIT";
  reason: string;
  ref_price: number;
  current_price: number;
  dip_pct: number;
}

export interface FlowEntry {
  id: number;
  ticker: string;
  strike: number;
  option_type: string;
  expiry: string;
  premium: string;
  size: string;
  side: string;
  timestamp: string;
}

export interface FlowChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface TrackedTicker {
  ticker: string;
  total_entries: number;
  bullish: number;
  bearish: number;
  net_premium: string;
  latest: string;
}

/* ── Paper Trading ────────────────────────────────────────── */

export interface PaperPosition {
  id: number;
  ticker: string;
  direction: string;
  conviction: string;
  strike: number;
  option_type: string;
  expiry: string;
  contracts: number;
  entry_premium: number;
  current_premium: number;
  cost_basis: number;
  current_value: number;
  pnl_dollars: number;
  pnl_pct: number;
  status: "open" | "closed";
  exit_reason?: string;
}

export interface PortfolioSummary {
  cash: number;
  positions_value: number;
  total_value: number;
  total_return_pct: number;
  realized_pnl: number;
  unrealized_pnl: number;
  open_positions: number;
  closed_positions: number;
  win_rate: number;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  strike: number;
  option_type: string;
  expiry: string;
  ref_price: number;
  current_price: number;
  dip_pct: number;
  status: string;
}

export interface TradeLogEntry {
  id: number;
  timestamp: string;
  action: string;
  ticker: string;
  strike: number;
  option_type: string;
  contracts: number;
  premium: number;
  reason: string;
}

export interface PortfolioHistoryPoint {
  date: string;
  value: number;
}

/* ── Intelligence ─────────────────────────────────────────── */

export interface IntelSection {
  type: string;
  title: string;
  content: string;
  timestamp: string;
}

export interface IntelEvent {
  id: number;
  ticker: string;
  event_date: string;
  event_type: string;
  summary: string;
  severity: number;
  trend: string;
}

export interface IntelSignal {
  type: "bullish" | "bearish" | "caution";
  title: string;
  detail: string;
}

/* ── Model Evaluation ─────────────────────────────────────── */

export interface LeaderboardEntry {
  model: string;
  mape: number;
  rmse: number;
  mae: number;
  dir_acc: number;
  samples: number;
  trust_score: number;
}

export interface DailyMetric {
  date: string;
  mape: number;
  mae: number;
  dir_acc: number;
}

export interface ModelHistoryEntry {
  id: number;
  ticker: string;
  model: string;
  predicted_price: number;
  actual_price: number;
  pct_error: number;
  direction_correct: boolean;
  date: string;
}

export interface TrustScore {
  model: string;
  score: number;
  samples: number;
  trend: "up" | "down" | "flat";
}

/* ── Market Data ──────────────────────────────────────────── */

export interface MarketPrice {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  volume: number;
  market_status: string;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketContext {
  analyst_consensus: string;
  price_target: number;
  earnings_date: string;
  news_sentiment: string;
  sector: string;
}

/* ── WebSocket ────────────────────────────────────────────── */

export interface LivePriceUpdate {
  ticker: string;
  price: number;
  change_pct: number;
  timestamp: string;
}

export interface PaperTradingUpdate {
  type: "position_update" | "watchlist_update" | "trade_executed" | "alert";
  data: unknown;
}

export interface FlowAlertUpdate {
  type: "state_change";
  alert: FlowAlert;
}

/* ── Server ───────────────────────────────────────────────── */

export interface HealthCheck {
  status: string;
  models: string[];
  uptime: number;
}
