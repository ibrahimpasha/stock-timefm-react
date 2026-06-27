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

/** Directional bias signal extracted from the Perplexity intel response.
 *  Used by the Command Center intelligence panels + the intel-graph
 *  context card to color-code bullish / bearish / neutral chips. */
export type IntelBiasDirection = "BULLISH" | "BEARISH" | "NEUTRAL" | "UNKNOWN";

/** graphify structural-role enum — the supply-chain position of a ticker,
 *  read from intelligence.db `_structural_signal`. */
export type StructuralRole =
  | "PLATFORM"
  | "ENABLER"
  | "BOTTLENECK"
  | "CONSUMER"
  | "NEUTRAL";

/** graphify edge confidence — EXTRACTED (stated in source), INFERRED (model
 *  deduced), AMBIGUOUS (low confidence). */
export type EdgeConfidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS" | string;

/** A ticker→ticker peer edge from the graphify graph, with the relation kind
 *  (semantic vs conceptual) and confidence so the UI can weight it. */
export interface GraphRelatedCompany {
  ticker: string;
  relation: string;
  confidence: EdgeConfidence;
  role?: StructuralRole | null;
}

/** A non-ticker concept the ticker hangs off — a chokepoint thesis, a theme,
 *  or another concept node. */
export interface GraphConcept {
  name: string;
  relation: string;
  confidence?: EdgeConfidence;
}

/** Same-theme ticker with its graphify structural role. */
export interface GraphThemePeer {
  ticker: string;
  role?: StructuralRole | null;
}

/** A graphify hyperedge the ticker participates in (a thematic group), with
 *  its co-members and the model's rationale. */
export interface GraphThematicGroup {
  id: string;
  relation: string;
  members: string[];
  rationale?: string;
}

/** graphify community (cluster) the ticker belongs to, with its human label. */
export interface GraphCommunity {
  id: number;
  label?: string | null;
}

/** Entity/company the ticker is structurally tied to (product, segment, JV). */
export interface GraphTiedTo {
  name: string;
  relation: string;
}

/** One ticker inside a Theme Pulse, with its auditable quant play-score, the
 *  bucket the score put it in, and the LLM "why". */
export interface ThemePulseTicker {
  ticker: string;
  play_score: number;
  bucket: "play" | "watch" | "wait";
  role?: StructuralRole | null;
  accum_label: string;
  bull_share?: number | null;
  days_active: number;
  tech_score?: number | null;
  ret_30d?: number | null;
  days_to_earnings?: number | null;
  key_facts: string[];
  why: string;
}

/** Response of GET /api/intel-graph/theme-pulse — theme-level synthesis:
 *  a one-paragraph read + tickers bucketed Plays-now / Watch / Wait. */
export interface ThemePulse {
  available: boolean;
  reason?: string;
  theme?: string;
  n?: number;
  theme_read?: string;
  generated_at?: string;
  plays?: ThemePulseTicker[];
  watch?: ThemePulseTicker[];
  wait?: ThemePulseTicker[];
}

/** Response of GET /api/intel-graph/context — the ticker's structural
 *  neighborhood in the **graphify** knowledge graph (migrated from
 *  Understand-Anything 2026-06-13). Superset of the old shape: adds
 *  structural_role, related_companies (with confidence), chokepoints,
 *  concepts, community cluster, and thematic_groups. `bias` is always null
 *  (removed 2026-06-02) and kept only for back-compat. */
export interface IntelGraphContext {
  ticker: string;
  available: boolean;
  reason?: string;
  source?: string;
  bias?: IntelBiasDirection | null;
  sector?: string;
  theme?: string | null;
  thesis?: string;
  /** Supply-chain role: PLATFORM / ENABLER / BOTTLENECK / CONSUMER / NEUTRAL. */
  structural_role?: { role: StructuralRole; reason?: string } | null;
  /** graphify community cluster + human label. */
  community?: GraphCommunity | null;
  /** Per-ticker narrative facts read fresh from intelligence.db catalysts. */
  key_facts?: string[];
  sentiment?: string | null;
  competitors_text?: string | null;
  outlook?: string | null;
  intel_as_of?: string | null;
  /** Tightest semantic peers (subset of related_companies). */
  competitors?: { ticker: string; confidence: EdgeConfidence; role?: StructuralRole | null }[];
  /** All ticker→ticker peer/related edges with relation kind + confidence. */
  related_companies?: GraphRelatedCompany[];
  /** Supply-chain chokepoint theses this ticker hangs off. */
  chokepoints?: GraphConcept[];
  /** Other conceptually-related concept nodes (themes, buildouts). */
  concepts?: GraphConcept[];
  /** Hyperedge thematic groups the ticker participates in. */
  thematic_groups?: GraphThematicGroup[];
  theme_peers?: GraphThemePeer[];
  tied_to?: GraphTiedTo[];
}

/* ── Model Evaluation ─────────────────────────────────────── */

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
