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
  dte?: number;
  premium: string;
  side: string;
  flow_date: string;
  created_at?: string;
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
  latest?: string;
  /** Latest per-ticker arrival timestamp (UTC, lex-sortable). Set by the
   *  IFlowTracker merger from `IFlowSummary.tickers[].latest_ts`. Backs the
   *  "Most Recent" sort. */
  latest_ts?: string;
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

/** Directional bias signal extracted from the Perplexity intel response.
 *  Returned by /intel/latest as a synthetic section with type === "_bias",
 *  whose `content` field is JSON-encoded `{bias, reason}`. The dashboard
 *  pulls it out for the panel-header chip; Ruby Trader (which iterates by
 *  known category names) ignores unknown types. */
export type IntelBiasDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";
export interface IntelBias {
  bias: IntelBiasDirection;
  reason: string;
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

/** Per-edge brief used by /intel-graph/context. Edge "type" is the related
 *  node's type (article / claim / entity); name is the related node's display
 *  name (e.g. "AMD" for a ticker article, "TSMC 3nm capacity" for an entity).
 *  edge_desc is the LLM-extracted reason the edge exists, capped to 240 chars.
 *  `bias` is present only for ticker articles — lets the chip color-code
 *  competitor alignment (e.g. peer also BULL = confirmation). */
export interface GraphEdgeBrief {
  id: string;
  name: string;
  type: string;
  file: string;
  summary: string;
  edge_desc: string;
  bias?: IntelBiasDirection | null;
}

/** Same-theme ticker with its bias and one-liner summary. Returned by
 *  /intel-graph/context.theme_peers, pre-sorted bull → neutral → bear. */
export interface GraphThemePeer {
  ticker: string;
  bias: IntelBiasDirection | null;
  summary: string;
}

/** Response of GET /api/intel-graph/context — the ticker's structural
 *  neighborhood in the Understand-Anything knowledge graph. bias is read
 *  from intelligence.db (graph extraction drops the YAML), so it stays
 *  fresh between weekly graph re-ingests. */
export interface IntelGraphContext {
  ticker: string;
  available: boolean;
  reason?: string;
  bias?: IntelBiasDirection | null;
  bias_reason?: string | null;
  bias_as_of?: string | null;
  sector?: string;
  theme?: string | null;
  thesis?: string;
  competitors?: GraphEdgeBrief[];
  builds_on?: GraphEdgeBrief[];
  enabled_by?: GraphEdgeBrief[];
  cites?: GraphEdgeBrief[];
  /** Entity ties — products, customer cohorts, market segments the ticker
   *  is structurally exposed to. Backend filters targets to entity nodes
   *  only so this never duplicates claims (Key facts) or other tickers. */
  exemplifies?: GraphEdgeBrief[];
  claims?: GraphEdgeBrief[];
  theme_peers?: GraphThemePeer[];
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
  analyst_consensus: string | null;
  price_target: number | null;
  /** Analyst target spread + count for the AnalystTargetChip hover.
   *  Mean is `price_target` above; high/low/count come from the same
   *  yfinance .info call so there's no extra request. */
  price_target_high?: number | null;
  price_target_low?: number | null;
  analyst_count?: number | null;
  earnings_date: string | null;
  news_sentiment: string | null;
  sector: string | null;
  industry?: string | null;
  /** Full company name (e.g. "Intel Corporation"), pulled from yfinance
   *  `info.longName || info.shortName`. */
  company_name?: string | null;
  // Ticker-extras (cached 6h server-side in intelligence.db::ticker_extras).
  range_52w_low?: number | null;
  range_52w_high?: number | null;
  /** ATM straddle / spot, as %. e.g. 8.26 = ±8.26% expected move by expiry. */
  implied_move_pct?: number | null;
  /** Expiration the implied move is computed against (nearest weekly). */
  options_expiry?: string | null;
  last_earnings_date?: string | null;
  /** Next-trading-day price reaction after the last earnings print, as %. */
  last_earnings_reaction_pct?: number | null;
  /** Today's session volume and the 3-month average — the chip surfaces
   *  the ratio (e.g. "9.5×") to flag unusual activity. ~6h stale due
   *  to the ticker_extras cache; refreshed when the user re-selects. */
  volume_today?: number | null;
  volume_avg_3mo?: number | null;
  volume_ratio?: number | null;
  /** Market capitalization in dollars. The chip renders human-readable
   *  ($5.22T, $40B, $850M). 6h stale due to ticker_extras cache; that's
   *  fine because it's for order-of-magnitude context, not live valuation. */
  market_cap?: number | null;
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

/* ── Trader Alerts ────────────────────────────────────────── */

export interface AlertCall {
  id?: number;
  ticker: string | null;
  strike: number | null;
  opt_type: string | null;
  expiry: string | null;
  side: string | null;
  entry_underlying: number | null;
  entry_iv_est?: number | null;
  is_realized: boolean;
  realized_pct: number | null;
  parsed_at?: string | null;
}

export interface AlertPL {
  as_of_date: string | null;
  current_underlying: number | null;
  est_pl_pct: number | null;
  days_held: number | null;
  iflow_agreement: string | null;
  iflow_total_premium: number | null;
  recorded_at?: string | null;
}

export interface Alert {
  id: number;
  channel_id?: string | number | null;
  channel_name: string | null;
  msg_id?: string | number | null;
  ts: string;
  author: string | null;
  content: string | null;
  attachments?: string | null;
  fetched_at?: string | null;
  call: AlertCall | null;
  pl: AlertPL | null;
}

export interface LeaderboardRow {
  author: string;
  n_calls: number;
  n_realized: number;
  win_rate: number | null;
  mean_pl_pct: number | null;
  median_pl_pct: number | null;
  top_ticker: string | null;
  latest_call_ts: string | null;
}

/** Flattened call row returned by /alerts/by-ticker and /alerts/by-author —
 *  shape comes from `_row_to_dict` so all fields are siblings on the row. */
export interface AlertCallRow {
  alert_id: number;
  ts: string;
  author: string | null;
  channel_name: string | null;
  content: string | null;
  call_id: number;
  ticker: string | null;
  strike: number | null;
  opt_type: string | null;
  expiry: string | null;
  side: string | null;
  entry_underlying?: number | null;
  entry_iv_est?: number | null;
  is_realized: 0 | 1 | boolean | null;
  realized_pct: number | null;
  parsed_at: string | null;
  as_of_date: string | null;
  current_underlying: number | null;
  est_pl_pct: number | null;
  days_held: number | null;
  iflow_agreement: string | null;
  iflow_total_premium: number | null;
  recorded_at?: string | null;
  /** LLM-extracted direction (bullish/bearish/neutral). */
  direction?: string | null;
  /** LLM-extracted conviction (high/medium/low/lotto). */
  conviction?: string | null;
  /** LLM short rationale. */
  rationale?: string | null;
  /** Option premium the trader paid (per-contract dollar value). */
  premium?: number | null;
  /** Sizing tags from the LLM (e.g. ["starter","swing"]). */
  sizing?: string[] | null;
  /** Later trim/close/stop events linked to this open position. */
  exits?: AlertExit[] | null;
}

export interface AlertExit {
  ts: string;
  event_type: string;
  exit_pct: number | null;
  rationale: string | null;
  alert_id: number;
}

export interface AlertsRecentOk {
  ok: true;
  alerts: Alert[];
  count: number;
}

export interface AlertsLeaderboardOk {
  ok: true;
  leaderboard: LeaderboardRow[];
  lookback_days: number;
  n_traders: number;
}

export interface AlertsByTickerOk {
  ok: true;
  ticker: string;
  calls: AlertCallRow[];
  count: number;
}

export interface AlertsByAuthorSummary {
  n_calls: number;
  n_realized: number;
  win_rate: number | null;
  mean_pl_pct: number | null;
  iflow_tagged: number;
  iflow_agreement_rate: number | null;
}

export interface AlertsByAuthorOk {
  ok: true;
  author: string;
  calls: AlertCallRow[];
  count: number;
  summary: AlertsByAuthorSummary;
}

export interface AlertsNotReady {
  ok: false;
  reason: string;
}

export type AlertsRecentResponse = AlertsRecentOk | AlertsNotReady;
export type AlertsLeaderboardResponse = AlertsLeaderboardOk | AlertsNotReady;
export type AlertsByTickerResponse = AlertsByTickerOk | AlertsNotReady;
export type AlertsByAuthorResponse = AlertsByAuthorOk | AlertsNotReady;

/* — Positions — one row per (ticker, strike, opt_type, expiry) per trader.
 *   Backend groups individual call/exit messages into a single position with a
 *   chronological events array. See `/api/alerts/positions`. */

export interface AlertPositionEvent {
  ts: string;
  alert_id: number;
  event_type: string | null;
  exit_pct: number | null;
  /** JSON-stringified array from backend; parse with JSON.parse, fallback []. */
  sizing: string | null;
  premium: number | null;
  entry_underlying: number | null;
  pl_underlying: number | null;
  rationale: string | null;
  content: string | null;
}

export interface AlertPosition {
  position_key: {
    ticker: string | null;
    strike: number | null;
    opt_type: string | null;
    expiry: string | null;
  };
  author: string;
  events: AlertPositionEvent[];
  opened_at: string | null;
  cumulative_exit_pct: number | null;
  current_pl_pct: number | null;
  status: "open" | "partial" | "closed" | "stopped" | "runner" | string;
  n_events: number;
}

export interface AlertsPositionsOk {
  ok: true;
  author: string;
  lookback_days: number;
  positions: AlertPosition[];
  count?: number;
}

export type AlertsPositionsResponse = AlertsPositionsOk | AlertsNotReady;

/* ── Signals view (Agent A: text analysis + Agent B: LLM extractor) ──── */

/** One row in the Trending tickers table. */
export interface TrendingTicker {
  ticker: string;
  n_mentions: number;
  n_unique_authors: number;
  sentiment_avg: number | null;
  catalysts_top: string[];
  first_mention_author: string | null;
  first_mention_ts: string | null;
  trending_score: number;
}

/** One row in the First-Mention leaderboard — who calls things FIRST? */
export interface FirstMentionRow {
  author: string;
  n_first_mentions: number;
  n_followers_within_24h_avg: number | null;
  leading_tickers: string[];
}

/** Per-day datapoint in the sentiment-trajectory chart. */
export interface SentimentPoint {
  date: string;
  n_mentions: number;
  sentiment_avg: number | null;
  bull_count: number;
  bear_count: number;
  top_catalysts: string[];
}

/** Per-alert annotation (text-analysis pipeline). */
export interface AlertAnnotation {
  sentiment_score: number | null;
  sentiment_label: string | null;
  catalysts: string[];
  sizing: string[];
  macro_focus: boolean;
  conviction: string | null;
}

/** Structured trade call — unified shape across regex and LLM extractors. */
export interface StructuredCall {
  source: "regex" | "llm";
  alert_id: number;
  ticker: string | null;
  strike?: number | null;
  opt_type?: string | null;
  expiry?: string | null;
  direction: string | null;
  conviction?: string | null;
  entry_low?: number | null;
  entry_high?: number | null;
  stop_loss?: number | null;
  target?: number | null;
  rationale?: string | null;
  ts: string;
  author: string | null;
  channel_name: string | null;
}

/* — Response envelopes — — — — — — — — — — — — — — — — — — — — — — — — */

export interface TrendingOk {
  ok: true;
  rows: TrendingTicker[];
  window_hours: number;
  count: number;
}

export interface FirstMentionLeaderboardOk {
  ok: true;
  rows: FirstMentionRow[];
  days: number;
  count: number;
}

export interface SentimentTrajectoryOk {
  ok: true;
  ticker: string;
  days: number;
  points: SentimentPoint[];
}

export interface AlertMessageOk {
  ok: true;
  alert_id: number;
  content: string | null;
  annotation: AlertAnnotation | null;
}

export interface StructuredCallsOk {
  ok: true;
  rows: StructuredCall[];
  count: number;
}

export type TrendingResponse = TrendingOk | AlertsNotReady;
export type FirstMentionLeaderboardResponse =
  | FirstMentionLeaderboardOk
  | AlertsNotReady;
export type SentimentTrajectoryResponse =
  | SentimentTrajectoryOk
  | AlertsNotReady;
export type AlertMessageResponse = AlertMessageOk | AlertsNotReady;
export type StructuredCallsResponse = StructuredCallsOk | AlertsNotReady;

/* ── Server ───────────────────────────────────────────────── */

export interface HealthCheck {
  status: string;
  models: string[];
  uptime: number;
}
