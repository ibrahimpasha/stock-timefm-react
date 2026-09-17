/**
 * Shared types for the IFlowTracker feature.
 *
 * Kept separate from the components so hooks/utils can depend on them without
 * pulling in React.
 */

export type BiasFilter = "all" | "bullish" | "bearish";
export type DteFilter = "all" | "lotto" | "swing" | "leap";
export type SortMode = "entries" | "premium" | "score" | "escalating" | "returns" | "recent";
export type EarningsWindow = "all" | "today" | "1w" | "2w" | "1m" | "2m";

export type MlServingMode = "disabled" | "rank_only" | "gate_and_rank";
export type MlCalibrationStatus = "calibrated" | "uncalibrated";

/** Optional model provenance attached to scored flow entries as the backend
 * rolls out the expanded contract. Every field stays optional so cached and
 * legacy responses remain renderable. */
export interface MlScoreProvenance {
  ml_model_status?: string | null;
  ml_model_version?: string | null;
  ml_serving_mode?: MlServingMode | string | null;
  ml_ranking_allowed?: boolean | null;
  ml_gating_allowed?: boolean | null;
  ml_calibration_status?: MlCalibrationStatus | string | null;
  ml_cohort?: string | null;
  ml_horizon_sessions?: number | null;
  ml_validation_sample_size?: number | null;
}

/** Backend notable-flow envelope. NScore, ML percentile, and probability are
 * deliberately separate because they have different definitions and gates. */
export interface NotableScore extends MlScoreProvenance {
  score: number;
  side: "Bull" | "Bear";
  parts: {
    size: number;
    convergence: number;
    conviction: number;
    catalyst: number;
    structural: number;
  };
  signals: {
    intel_bias?: string;
    forecast_dir?: string;
    accumulation_label?: string;
    trader_calls_24h?: number;
    trader_same_dir_24h?: number;
    news_24h?: number;
    voices_7d?: number;
    voices_sentiment?: string;
    component_scores?: Record<string, number>;
  };
  /** 0-100 percentile among recent prints in a similar-DTE cohort. */
  ml_score?: number | null;
  /** Calibrated P(peak > +100% within the configured horizon), in percent. */
  ml_prob?: number | null;
  ml_gate_approved?: boolean;
  predicted_peak_pnl?: number | null;
}

/** Per-ticker accumulation/escalation intel returned by /flow/iflow/history. */
export interface TickerIntel {
  escalating: boolean;
  accumScore: number;
  accumLabel: string;
  exitSignals: number;
  daysActive: number;
}

/** One ticker's premium-weighted Flow P/L summary from /flow/iflow/returns. */
export interface FlowReturn {
  /** Premium-weighted average P/L %. null when no scoreable entries. */
  avg_pnl_pct: number | null;
  /** Composite ranking metric: avg_pnl_pct × scored_entries. */
  score: number | null;
  total_premium: number;
  entry_count: number;
  scored_entries: number;
}

export interface FlowReturnsMeta {
  earliest_date: string | null;
  latest_date: string | null;
  days_covered: number;
  entry_count: number;
}

export interface FlowReturnsResponse {
  meta: FlowReturnsMeta;
  tickers: Record<string, FlowReturn>;
}

/**
 * One trader call that overlaps with a flow entry — chip metadata for
 * the cross-reference strip rendered in EntryRow.
 *
 * Tier:
 *   - "contract" -> strike + opt_type + expiry all line up within tolerance
 *   - "ticker"   -> same ticker only (different contract specifics)
 *
 * `aligned` reports trader direction match with flow side; `direction_known`
 * distinguishes "opposite call" from "trader's direction was neutral/null"
 * so the chip can pick muted-gray instead of red for the latter case.
 */
export interface TraderMatch {
  alert_id: number | null;
  author: string;
  event_type: string | null;
  ts: string;
  days_offset: number;
  aligned: boolean;
  direction_known: boolean;
  tier: "contract" | "ticker";
  call_strike: number | null;
  call_opt_type: string | null;
  call_expiry: string | null;
  /** Resolved by backend via loose-match position grouper. Use this to
   *  group events of the same position even when individual events have
   *  missing strike/expiry (e.g. "small add, avg 2.5" with no contract). */
  position_key?: {
    ticker: string | null;
    strike: number | null;
    opt_type: string | null;
    expiry: string | null;
  };
}

/** Shape of /flow/iflow/summary?date=... */
export interface IFlowSummaryData {
  total_entries: number;
  bull_count: number;
  bear_count: number;
  net_sentiment: string;
  tickers: {
    ticker: string;
    count: number;
    bull: number;
    bear: number;
    total_premium: number;
    /** Latest per-ticker arrival timestamp. Format: `"YYYY-MM-DD HH:MM:SS"`
     *  (UTC, no timezone suffix) from `_discord_time_utc` when present,
     *  `"YYYY-MM-DD HH:MM"` from the LLM-parsed `flow_time` fallback, or
     *  just `"YYYY-MM-DD"` when no time field could be extracted. Empty
     *  string if even the date is missing. Backs the "Most Recent" sort. */
    latest_ts?: string;
  }[];
}
