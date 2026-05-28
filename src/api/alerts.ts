import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type {
  AlertsRecentResponse,
  AlertsLeaderboardResponse,
  AlertsByTickerResponse,
  AlertsByAuthorResponse,
  AlertsPositionsResponse,
  TrendingResponse,
  FirstMentionLeaderboardResponse,
  SentimentTrajectoryResponse,
  AlertMessageResponse,
  StructuredCallsResponse,
} from "../lib/types";

/**
 * Recent alerts (joined with parsed trade_call + latest pl_estimate).
 * Auto-refreshes every 60s — backend fetcher service appends new rows continuously.
 */
export function useRecentAlerts(limit: number = 50) {
  return useQuery<AlertsRecentResponse>({
    queryKey: ["alerts", "recent", limit],
    queryFn: () =>
      apiClient
        .get<AlertsRecentResponse>(`/alerts/recent?limit=${limit}`)
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: 60_000,
  });
}

/**
 * Per-author aggregate over the lookback window — drives the leaderboard table.
 */
export function useLeaderboard(lookbackDays: number = 30) {
  return useQuery<AlertsLeaderboardResponse>({
    queryKey: ["alerts", "leaderboard", lookbackDays],
    queryFn: () =>
      apiClient
        .get<AlertsLeaderboardResponse>(
          `/alerts/leaderboard?lookback_days=${lookbackDays}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

/**
 * Recent calls on one ticker across all traders.
 */
export function useAlertsByTicker(ticker: string, limit: number = 20) {
  return useQuery<AlertsByTickerResponse>({
    queryKey: ["alerts", "by-ticker", ticker, limit],
    queryFn: () =>
      apiClient
        .get<AlertsByTickerResponse>(
          `/alerts/by-ticker?ticker=${encodeURIComponent(ticker)}&limit=${limit}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

/**
 * Recent calls by one trader + per-window summary stats.
 */
export function useAlertsByAuthor(author: string, limit: number = 50) {
  return useQuery<AlertsByAuthorResponse>({
    queryKey: ["alerts", "by-author", author, limit],
    queryFn: () =>
      apiClient
        .get<AlertsByAuthorResponse>(
          `/alerts/by-author?author=${encodeURIComponent(author)}&limit=${limit}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!author,
  });
}

/**
 * Positions grouped by (ticker, strike, opt_type, expiry) for one trader.
 * Each position bundles the open/add/trim/close events into a chronological
 * timeline so the UI can render one row per real position rather than one
 * row per Discord message.
 */
export function useAlertsPositions(
  author: string,
  lookbackDays: number = 60,
) {
  return useQuery<AlertsPositionsResponse>({
    queryKey: ["alerts", "positions", author, lookbackDays],
    queryFn: () =>
      apiClient
        .get<AlertsPositionsResponse>(
          `/alerts/positions?author=${encodeURIComponent(author)}&lookback_days=${lookbackDays}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!author,
  });
}

/* ── Signals view (Agent A: text analysis, Agent B: LLM extractor) ───── */

/**
 * Trending tickers ranked by mention velocity + cross-trader consensus.
 * Auto-refreshes every 2 min — pipeline appends new mentions continuously.
 */
/**
 * Today's raw chronological feed of LLM-extracted events, grouped by author.
 * Bypasses position stitching — just shows what the LLM cycle wrote.
 * Backend: GET /alerts/today
 */
export interface TraderTodayEvent {
  alert_id: number;
  msg_id: string | null;
  channel_name: string | null;
  author: string;
  ts: string;
  is_call: number;
  event_type: string | null;
  ticker: string | null;
  direction: string | null;
  instrument: string | null;
  strike: number | null;
  expiry: string | null;
  premium: string | null;
  exit_pct: number | null;
  position_ref: number | null;
  sentiment: string | null;
  conviction: string | null;
  rationale: string | null;
}

export interface TradersTodayResponse {
  ok: boolean;
  date: string;
  total_events: number;
  authors: { author: string; count: number; events: TraderTodayEvent[] }[];
}

export function useTradersToday(date?: string) {
  return useQuery<TradersTodayResponse>({
    queryKey: ["alerts", "today", date ?? ""],
    queryFn: () =>
      apiClient
        .get<TradersTodayResponse>(`/alerts/today${date ? `?date=${date}` : ""}`)
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: 60_000,
  });
}

export function useTrending(windowHours: number = 24, limit: number = 20) {
  return useQuery<TrendingResponse>({
    queryKey: ["alerts", "trending", windowHours, limit],
    queryFn: () =>
      apiClient
        .get<TrendingResponse>(
          `/alerts/trending?window_hours=${windowHours}&limit=${limit}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: 120_000,
  });
}

/**
 * First-mention leaderboard: who calls tickers FIRST that subsequently
 * get picked up by 2+ other traders within 24h.
 */
export function useFirstMentionLeaderboard(days: number = 14) {
  return useQuery<FirstMentionLeaderboardResponse>({
    queryKey: ["alerts", "first-mention-leaderboard", days],
    queryFn: () =>
      apiClient
        .get<FirstMentionLeaderboardResponse>(
          `/alerts/first-mention-leaderboard?days=${days}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
  });
}

/** Per-ticker daily sentiment trajectory over the last `days` days. */
export function useSentimentTrajectory(ticker: string, days: number = 14) {
  return useQuery<SentimentTrajectoryResponse>({
    queryKey: ["alerts", "sentiment-trajectory", ticker, days],
    queryFn: () =>
      apiClient
        .get<SentimentTrajectoryResponse>(
          `/alerts/sentiment-trajectory?ticker=${encodeURIComponent(ticker)}&days=${days}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

/**
 * Full message + annotation for one alert.
 * Only fires when `alertId` is non-null — used to lazy-expand a call row.
 */
export function useAlertMessage(alertId: number | null) {
  return useQuery<AlertMessageResponse>({
    queryKey: ["alerts", "message", alertId],
    queryFn: () =>
      apiClient
        .get<AlertMessageResponse>(`/alerts/message?alert_id=${alertId}`)
        .then((r) => r.data),
    staleTime: 10 * 60_000,
    enabled: alertId != null,
  });
}

/**
 * Structured (regex + LLM) trade calls, optionally filtered by author / ticker.
 */
export function useStructuredCalls(
  author?: string,
  ticker?: string,
  limit: number = 50,
) {
  return useQuery<StructuredCallsResponse>({
    queryKey: ["alerts", "structured", author ?? "", ticker ?? "", limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (author) params.set("author", author);
      if (ticker) params.set("ticker", ticker);
      params.set("limit", String(limit));
      return apiClient
        .get<StructuredCallsResponse>(`/alerts/structured?${params.toString()}`)
        .then((r) => r.data);
    },
    staleTime: STALE_TIMES.flow,
  });
}


// ── Trader brief — LLM cross-message digest per author ──

export interface TraderBriefSector {
  sector: string;
  weight_pct: number;
  lean: "bullish" | "bearish" | "neutral" | "mixed";
  notes?: string;
}

export interface TraderBriefPosition {
  ticker: string;
  thesis: string;
  current_view?: string;
}

export interface TraderBriefWatch {
  ticker: string;
  why_watching: string;
}

export interface TraderBriefOutcome {
  ticker: string;
  outcome: string;
  note?: string;
}

export interface TraderBriefContent {
  current_view: string;
  trading_style: "scalp" | "swing" | "leap" | "mixed" | "defensive";
  open_thesis: string;
  sectors_focus: TraderBriefSector[];
  active_positions_recap: TraderBriefPosition[];
  watching: TraderBriefWatch[];
  recent_outcomes: TraderBriefOutcome[];
  catalysts_flagged: string[];
  style_notes: string;
}

export interface TraderBriefRecord {
  id?: number;
  author: string;
  window_days: number;
  generated_at?: string;
  n_messages?: number;
  model?: string;
  content: TraderBriefContent | null;
  stale?: boolean;
  error?: string;
}

const TRADER_BRIEF_STALE_MS = 15 * 60_000;

export function useTraderBrief(
  author: string | null,
  windowDays: number = 7,
  maxAgeHours: number = 24,
) {
  return useQuery({
    queryKey: ["alerts", "trader-brief", author ?? "", windowDays, maxAgeHours],
    queryFn: async () => {
      const url = `/alerts/trader-brief?author=${encodeURIComponent(author ?? "")}&window_days=${windowDays}&max_age_hours=${maxAgeHours}`;
      const { data } = await apiClient.get<TraderBriefRecord>(url);
      return data;
    },
    enabled: !!author,
    staleTime: TRADER_BRIEF_STALE_MS,
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useGenerateTraderBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { author: string; windowDays?: number; maxMessages?: number }) => {
      const windowDays = args.windowDays ?? 7;
      const maxMessages = args.maxMessages ?? 120;
      const url = `/alerts/trader-brief?author=${encodeURIComponent(args.author)}&window_days=${windowDays}&max_messages=${maxMessages}`;
      const { data } = await apiClient.post<TraderBriefRecord & { ok: boolean }>(url);
      return data;
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({
        queryKey: ["alerts", "trader-brief", args.author],
      });
    },
  });
}
