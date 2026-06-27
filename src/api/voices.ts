import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";

// ── Types matching server/api_routes.py /voices/* ─────────────

export type VoiceSentiment = "bullish" | "bearish" | "neutral" | "mixed" | null;
export type TickerSentiment = "bullish" | "bearish" | "neutral";

export interface VoiceTickerMention {
  ticker: string;
  sentiment: TickerSentiment;
  confidence: number;
}

export interface VoiceTweet {
  tweet_id: string;
  voice_id: number;
  voice_username: string;
  voice_display_name: string;
  posted_at: string;
  text: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  is_retweet: 0 | 1;
  is_quote: 0 | 1;
  in_reply_to_user_id: string | null;
  analysis_status: "pending" | "done" | "failed" | "skipped";
  summary: string | null;
  overall_sentiment: VoiceSentiment;
  is_market_related: 0 | 1 | null;
  tickers: VoiceTickerMention[];
  sectors: string[];
  themes: string[];
}

export interface Voice {
  id: number;
  username: string;
  display_name: string;
  x_user_id: string;
  follower_count: number | null;
  since_id: string | null;
  active: boolean;
}

export interface TrendingTicker {
  ticker: string;
  mentions: number;
  bullish: number;
  bearish: number;
  last_mentioned: string;
}

export interface TrendingTheme {
  label: string;
  kind: "sector" | "theme";
  mentions: number;
  last_mentioned: string;
}

export interface TrendingResponse {
  window_days: number;
  tickers: TrendingTicker[];
  themes: TrendingTheme[];
}

export interface VoicesTickerSummary {
  ticker: string;
  window_days: number;
  mentions: number;
  bullish: number;
  bearish: number;
  neutral: number;
  last_mentioned: string | null;
  voices: string[];
}

// Voices update on a daily cron — give the cache a generous staleTime so
// switching tabs / re-mounting doesn't refetch unnecessarily. The user can
// always force a refresh via the POST /voices/refresh button.
const VOICES_STALE_MS = 15 * 60_000;

// ── Hooks ─────────────────────────────────────────────────────

export function useVoicesList() {
  return useQuery({
    queryKey: ["voices", "list"],
    queryFn: async () => {
      const { data } = await apiClient.get<{ voices: Voice[] }>("/voices/list");
      return data.voices;
    },
    staleTime: VOICES_STALE_MS,
  });
}

export function useVoicesFeed(
  voice: string | null,
  opts: { limit?: number; marketOnly?: boolean } = {},
) {
  const limit = opts.limit ?? 100;
  const marketOnly = opts.marketOnly ?? true;
  return useQuery({
    queryKey: ["voices", "feed", voice ?? "all", limit, marketOnly],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
        market_only: String(marketOnly),
      });
      if (voice) params.set("voice", voice);
      const { data } = await apiClient.get<{ count: number; tweets: VoiceTweet[] }>(
        `/voices/feed?${params.toString()}`,
      );
      return data;
    },
    staleTime: VOICES_STALE_MS,
  });
}

export function useVoicesByTicker(
  ticker: string | null,
  opts: { days?: number; limit?: number } = {},
) {
  const days = opts.days ?? 60;
  const limit = opts.limit ?? 30;
  return useQuery({
    queryKey: ["voices", "by-ticker", ticker ?? "", days, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        ticker: string;
        count: number;
        tweets: VoiceTweet[];
      }>(`/voices/by-ticker/${ticker}?days=${days}&limit=${limit}`);
      return data;
    },
    enabled: !!ticker,
    staleTime: VOICES_STALE_MS,
  });
}

export function useVoicesByTheme(
  theme: string | null,
  opts: { days?: number; limit?: number } = {},
) {
  const days = opts.days ?? 60;
  const limit = opts.limit ?? 30;
  return useQuery({
    queryKey: ["voices", "by-theme", theme ?? "", days, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<{
        theme: string;
        count: number;
        tweets: VoiceTweet[];
      }>(`/voices/by-theme/${encodeURIComponent(theme ?? "")}?days=${days}&limit=${limit}`);
      return data;
    },
    enabled: !!theme,
    staleTime: VOICES_STALE_MS,
  });
}

export function useVoicesTrending(
  windowDays: number = 7,
  limit: number = 20,
  voice: string | null = null,
) {
  return useQuery({
    queryKey: ["voices", "trending", windowDays, limit, voice ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({
        window_days: String(windowDays),
        limit: String(limit),
      });
      if (voice) params.set("voice", voice);
      const { data } = await apiClient.get<TrendingResponse>(
        `/voices/trending?${params.toString()}`,
      );
      return data;
    },
    staleTime: VOICES_STALE_MS,
  });
}

export function useVoicesTickerSummary(ticker: string | null, days: number = 7) {
  return useQuery({
    queryKey: ["voices", "ticker-summary", ticker ?? "", days],
    queryFn: async () => {
      const { data } = await apiClient.get<VoicesTickerSummary>(
        `/voices/ticker-summary/${ticker}?days=${days}`,
      );
      return data;
    },
    enabled: !!ticker,
    staleTime: STALE_TIMES.flow,
  });
}

export function useVoicesStats(voice: string | null = null) {
  return useQuery({
    queryKey: ["voices", "stats", voice ?? "all"],
    queryFn: async () => {
      const url = voice
        ? `/voices/stats?voice=${encodeURIComponent(voice)}`
        : "/voices/stats";
      const { data } = await apiClient.get<{
        total_tweets: number;
        analyzed: number;
        pending: number;
        failed: number;
        latest_tweet_at: string | null;
      }>(url);
      return data;
    },
    staleTime: STALE_TIMES.flow,
  });
}

// ── Patterns (co-occurrence + velocity) ────────────────────

export interface VelocityRow {
  ticker: string;
  mentions_recent: number;
  mentions_prior: number;
  delta: number;
  pct_change: number;
  bullish: number;
  bearish: number;
  avg_confidence: number;
  net_sentiment: "bullish" | "bearish" | "neutral";
  last_mentioned: string;
  momentum_score: number;
  is_new: boolean;
}

export interface CooccurrencePair {
  a: string;
  b: string;
  weight: number;
  both_bullish: number;
  both_bearish: number;
}

export interface CooccurrenceCluster {
  id: number;
  tickers: string[];
  size: number;
  internal_edges: number;
}

export interface CooccurrenceBlock {
  window_days: number;
  n_tweets_considered: number;
  n_tickers: number;
  pairs: CooccurrencePair[];
  clusters: CooccurrenceCluster[];
  node_stats: Record<string, { mentions: number; bullish: number; bearish: number }>;
}

export interface PatternsSnapshot {
  window_days: number;
  voice_username: string | null;
  velocity: VelocityRow[];
  cooccurrence: CooccurrenceBlock;
}

export function useVoicesPatterns(windowDays: number = 30, voice: string | null = null) {
  return useQuery({
    queryKey: ["voices", "patterns", windowDays, voice ?? "all"],
    queryFn: async () => {
      const params = new URLSearchParams({ window_days: String(windowDays) });
      if (voice) params.set("voice", voice);
      const { data } = await apiClient.get<PatternsSnapshot>(
        `/voices/patterns?${params.toString()}`,
      );
      return data;
    },
    staleTime: VOICES_STALE_MS,
  });
}

// ── Synthesis (cross-tweet meta-LLM digest) ────────────────

export interface SectorFocus {
  sector: string;
  weight_pct: number;
  lean: "bullish" | "bearish" | "neutral" | "mixed";
  notes?: string;
}

export interface HighConvictionItem {
  ticker: string;
  thesis: string;
  evidence_count: number;
  sentiment: "bullish" | "bearish" | "neutral";
}

export interface EmergingTheme {
  theme: string;
  rationale: string;
}

export interface PrivateCompany {
  name: string;
  rationale: string;
  public_proxies: string[];
}

export interface BottleneckItem {
  description: string;
  exposed_tickers: string[];
}

export interface WatchListItem {
  ticker: string;
  why_watch: string;
}

export interface SynthesisContent {
  overall_view: string;
  overall_sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  top_thesis: string;
  sector_focus: SectorFocus[];
  high_conviction: HighConvictionItem[];
  emerging_themes: EmergingTheme[];
  private_companies: PrivateCompany[];
  bottlenecks: BottleneckItem[];
  watch_list: WatchListItem[];
}

export interface SynthesisRecord {
  id?: number;
  voice_id?: number | null;
  window_days: number;
  generated_at?: string;
  n_tweets?: number;
  model?: string;
  content: SynthesisContent | null;
  stale?: boolean;
  error?: string;
}

export function useVoicesSynthesis(
  voice: string = "aleabitoreddit",
  windowDays: number = 30,
  maxAgeHours: number = 24,
) {
  return useQuery({
    queryKey: ["voices", "synthesis", voice, windowDays, maxAgeHours],
    queryFn: async () => {
      const { data } = await apiClient.get<SynthesisRecord>(
        `/voices/synthesis?voice=${encodeURIComponent(voice)}&window_days=${windowDays}&max_age_hours=${maxAgeHours}`,
      );
      return data;
    },
    staleTime: VOICES_STALE_MS,
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useGenerateSynthesis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { voice?: string; windowDays?: number; maxTweets?: number }) => {
      const voice = args.voice ?? "aleabitoreddit";
      const windowDays = args.windowDays ?? 30;
      // Default well under the server cap. The single Claude call legitimately
      // runs 2-4 min (sonnet generating the full structured digest over ~100
      // tweets — measured ~226s at 120), so override the shared 60s axios
      // timeout for THIS request only — otherwise axios aborts mid-synthesis
      // and the button "does nothing". The server auto-trims the prompt to a
      // safe size regardless.
      const maxTweets = args.maxTweets ?? 100;
      const { data } = await apiClient.post<SynthesisRecord & { ok: boolean; reason?: string }>(
        `/voices/synthesize?voice=${encodeURIComponent(voice)}&window_days=${windowDays}&max_tweets=${maxTweets}`,
        undefined,
        { timeout: 300_000 },
      );
      // The endpoint returns 200 with {ok:false, reason} when the window has no
      // analyzed tweets — treat that as an error so the UI shows the reason
      // instead of silently re-displaying the previous (stale) synthesis.
      if (data && data.ok === false) {
        throw new Error(data.reason || "Synthesis returned no content");
      }
      return data;
    },
    onSuccess: (_data, args) => {
      qc.invalidateQueries({
        queryKey: ["voices", "synthesis", args.voice ?? "aleabitoreddit"],
      });
    },
  });
}
