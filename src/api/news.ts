import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";

// ── Types matching server/api_routes.py /news/* ──────────────

export type NewsSentiment = "bullish" | "bearish" | "neutral" | null;

export interface NewsItem {
  msg_id: string;
  posted_at: string; // ISO seconds
  author_username: string;
  headline: string;
  analysis_status: "pending" | "done" | "failed" | "duplicate";
  summary: string | null;
  sentiment: NewsSentiment;
  sentiment_score: number | null;
  tickers: string[];
}

export interface NewsStats {
  total_canonical: number;
  analyzed: number;
  pending: number;
  failed: number;
  duplicates: number;
  latest_posted_at: string | null;
}

// ── Hooks ────────────────────────────────────────────────────

/** Today's news feed. Auto-refresh every 5 min so the tab stays fresh. */
export function useNewsToday(date?: string) {
  return useQuery<{ ok: boolean; date: string; count: number; items: NewsItem[] }>({
    queryKey: ["news-today", date ?? "today"],
    queryFn: () =>
      apiClient
        .get(`/news/today${date ? `?date=${date}` : ""}`)
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: 5 * 60_000,
  });
}

/** Rolling N-day feed for the "All days" view. */
export function useNewsFeed(days: number = 7) {
  return useQuery<{ ok: boolean; days: number; count: number; items: NewsItem[] }>({
    queryKey: ["news-feed", days],
    queryFn: () => apiClient.get(`/news/feed?days=${days}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: 5 * 60_000,
  });
}

/** News mentioning a specific ticker — optional ticker drill-down. */
export function useNewsByTicker(ticker: string, days: number = 30) {
  return useQuery<{ ok: boolean; ticker: string; days: number; count: number; items: NewsItem[] }>({
    queryKey: ["news-by-ticker", ticker, days],
    queryFn: () =>
      apiClient.get(`/news/by-ticker/${ticker}?days=${days}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!ticker,
  });
}

/** Counts for the header strip. */
export function useNewsStats() {
  return useQuery<NewsStats>({
    queryKey: ["news-stats"],
    queryFn: () => apiClient.get(`/news/stats`).then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ── 2h synthesis (one LLM call per window) ───────────────────

export interface NewsSynthesis {
  id: number;
  window_start: string;
  window_end: string;
  n_messages: number;
  bull_case: string | null;
  bear_case: string | null;
  theme: string | null;
  model?: string | null;
  generated_at: string;
}

export interface NewsSynthesisResp {
  ok: boolean;
  synthesis?: NewsSynthesis;
  reason?: string;
}

/** Latest 2h bull/bear synthesis. Auto-refreshes every 5 min — cron writes
 *  a new row every 2h, so most polls find no change. */
export function useNewsSynthesis() {
  return useQuery<NewsSynthesisResp>({
    queryKey: ["news-synthesis-latest"],
    queryFn: () => apiClient.get(`/news/synthesis`).then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Manual trigger — fires a fresh synthesis pass over the trailing window
 *  (default 2h, override with `hours`). Server runs claude -p; latency ~10-30s. */
export function useGenerateNewsSynthesis() {
  const qc = useQueryClient();
  return useMutation<NewsSynthesisResp, Error, { hours?: number }>({
    mutationFn: ({ hours }) =>
      apiClient
        .post(`/news/synthesis/generate${hours ? `?hours=${hours}` : ""}`)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["news-synthesis-latest"] });
      qc.invalidateQueries({ queryKey: ["news-synthesis-recent"] });
    },
  });
}

/** Recent N synthesis rows, newest-first. Used to interleave bull/bear cards
 *  into the chronological news feed at each 2h window boundary. */
export function useRecentNewsSynthesis(limit: number = 20) {
  return useQuery<{ ok: boolean; rows: NewsSynthesis[]; reason?: string }>({
    queryKey: ["news-synthesis-recent", limit],
    queryFn: () =>
      apiClient.get(`/news/synthesis/recent?limit=${limit}`).then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
