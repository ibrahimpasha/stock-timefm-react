/**
 * React Query hooks for the /api/intel-v3/* convergence + daily-brief
 * endpoints. Consumed exclusively by IntelligencePanelV3 today; lift more
 * callers up as new surfaces consume the data.
 *
 * All hooks refetch on a 60s interval since intel is slow-moving.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";

/* ── Response shapes ─────────────────────────────────────── */

export type Alignment = "bullish" | "bearish" | "mixed" | "neutral" | string;
export type ConvergenceLabelStr = "STRONG" | "MODERATE" | "WEAK" | "QUIET" | string;
export type TimelineSource = "news" | "iflow" | "trader" | "voice" | string;
export type TimelineAlignment = "ALIGNED" | "CONTRARIAN" | "NEUTRAL" | null;

export interface SourceSignalNews {
  count: number;
  net_sentiment?: number;
  latest_at?: string | null;
}

export interface SourceSignalIFlow {
  count: number;
  premium_usd?: number;
  side?: "CALL" | "PUT" | string | null;
  avg_ask_pct?: number;
  latest_at?: string | null;
}

export interface SourceSignalVoices {
  count: number;
  bullish?: number;
  bearish?: number;
  authors?: string[];
}

export interface SourceSignalTraders {
  count: number;
  opens?: number;
  closes?: number;
  authors?: string[];
}

export interface SourceSignalForecast {
  top_n_pct?: number;
  horizon?: number;
  agreement?: string;
  direction?: Alignment;
}

export interface ConvergenceSignals {
  news?: SourceSignalNews;
  iflow?: SourceSignalIFlow;
  voices?: SourceSignalVoices;
  traders?: SourceSignalTraders;
  forecast?: SourceSignalForecast;
}

export interface ConvergenceVerdict {
  score: number;
  alignment: Alignment;
  label: ConvergenceLabelStr;
}

export interface ConvergenceResponse {
  ticker: string;
  window_hours: number;
  as_of: string;
  signals: ConvergenceSignals;
  convergence: ConvergenceVerdict;
}

export interface ConvergenceListItem {
  ticker: string;
  score: number;
  alignment: Alignment;
  label: ConvergenceLabelStr;
  count_by_source?: Record<string, number>;
}

export interface ConvergenceListResponse {
  count: number;
  items: ConvergenceListItem[];
}

export interface TimelineEvent {
  ts: string;
  source: TimelineSource;
  label: string;
  icon?: string;
  sentiment?: number | null;
  alignment_with_prior?: TimelineAlignment;
  headline?: string;
  summary?: string;
  premium_usd?: number;
  side?: string;
  ask_pct?: number;
  event_type?: string;
}

export interface TimelineResponse {
  ticker: string;
  window_hours: number;
  as_of: string;
  events: TimelineEvent[];
}

export interface CalendarEvent {
  date: string;
  label: string;
  category: string;
  source?: string;
  ticker?: string | null;
  weight?: number;
}

export interface CalendarResponse {
  as_of: string;
  days_ahead: number;
  ticker?: string | null;
  events: CalendarEvent[];
}

/** Parsed daily-brief row. `top_themes` / `top_tickers` / `forward_catalysts`
 *  arrive from the backend as JSON-encoded strings; the hook decodes them
 *  before handing the row back so callers can treat them as objects. */
export interface DailyBrief {
  date: string;
  generated_at?: string;
  market_summary?: string;
  top_themes?: BriefTheme[];
  top_tickers?: BriefTicker[];
  forward_catalysts?: BriefCatalyst[];
  n_news_items?: number;
  n_tickers_covered?: number;
  /** `true` only on the empty placeholder shape returned when no row exists. */
  exists?: boolean;
}

/** Loose shapes — backend writers vary slightly. Treat every field as
 *  optional and let the renderer cope. */
export interface BriefTheme {
  theme?: string;
  count?: number;
  [k: string]: unknown;
}

export interface BriefTicker {
  ticker?: string;
  narrative?: string;
  count?: number;
  direction?: string;
  [k: string]: unknown;
}

export interface BriefCatalyst {
  date?: string;
  label?: string;
  ticker?: string | null;
  category?: string;
  [k: string]: unknown;
}

/* ── Hooks ───────────────────────────────────────────────── */

const REFETCH_MS = 60_000;

/** Per-ticker convergence verdict + per-source signal summary. */
export function useConvergence(ticker: string, hours: number = 24) {
  return useQuery<ConvergenceResponse>({
    queryKey: ["intel-v3", "convergence", ticker, hours],
    queryFn: () =>
      apiClient
        .get<ConvergenceResponse>(
          `/intel-v3/convergence/${encodeURIComponent(ticker)}?hours=${hours}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
    enabled: !!ticker,
  });
}

/** Cross-ticker convergence list — used in the no-ticker market-brief state. */
export function useConvergenceList(
  hours: number = 24,
  minSources: number = 3,
) {
  return useQuery<ConvergenceListResponse>({
    queryKey: ["intel-v3", "convergence-list", hours, minSources],
    queryFn: () =>
      apiClient
        .get<ConvergenceListResponse>(
          `/intel-v3/convergence?hours=${hours}&min_sources=${minSources}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
  });
}

/** Reaction timeline of events for the active ticker. */
export function useTimeline(ticker: string, hours: number = 24) {
  return useQuery<TimelineResponse>({
    queryKey: ["intel-v3", "timeline", ticker, hours],
    queryFn: () =>
      apiClient
        .get<TimelineResponse>(
          `/intel-v3/timeline/${encodeURIComponent(ticker)}?hours=${hours}`,
        )
        .then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
    enabled: !!ticker,
  });
}

/** Forward calendar — pass `ticker` to scope; omit for the full macro list. */
export function useCalendar(daysAhead: number = 14, ticker?: string) {
  const tk = ticker?.trim() || "";
  return useQuery<CalendarResponse>({
    queryKey: ["intel-v3", "calendar", daysAhead, tk],
    queryFn: () => {
      const params = new URLSearchParams({ days_ahead: String(daysAhead) });
      if (tk) params.set("ticker", tk);
      return apiClient
        .get<CalendarResponse>(`/intel-v3/calendar?${params.toString()}`)
        .then((r) => r.data);
    },
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
  });
}

/** Raw daily-brief row, decoded. The three JSON-string fields are parsed
 *  into objects here so component code never has to deal with them. */
export function useDailyBrief(date?: string) {
  const d = date?.trim() || "";
  return useQuery<DailyBrief>({
    queryKey: ["intel-v3", "brief", d],
    queryFn: async () => {
      const params = d ? `?date=${encodeURIComponent(d)}` : "";
      const { data } = await apiClient.get<Record<string, unknown>>(
        `/intel-v3/brief${params}`,
      );
      return decodeBrief(data);
    },
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
  });
}

/** Force-generate today's daily brief. Invalidates the brief query on
 *  success so the panel re-fetches the newly-cached row. */
export function useGenerateDailyBrief() {
  const qc = useQueryClient();
  return useMutation<DailyBrief, Error, { date?: string; force?: boolean } | void>({
    mutationFn: async (vars) => {
      const params = new URLSearchParams();
      if (vars?.date) params.set("date", vars.date);
      if (vars?.force) params.set("force", "true");
      const qs = params.toString();
      const { data } = await apiClient.post<Record<string, unknown>>(
        `/intel-v3/brief/generate${qs ? `?${qs}` : ""}`,
      );
      return decodeBrief(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intel-v3", "brief"] });
      qc.invalidateQueries({ queryKey: ["intel-v3", "briefs"] });
    },
  });
}

/** Per-ticker brief — Claude-synthesized read for one ticker.
 *  Returns null-shape `{ticker, exists: false}` when not yet generated. */
export interface TickerBrief {
  ticker: string;
  date?: string;
  exists?: boolean;
  generated_at?: string;
  headline?: string;
  narrative?: string;
  watch_for?: string[];
  convergence_label?: string;
  convergence_score?: number;
  model?: string;
}

export function useTickerBrief(ticker: string, date?: string) {
  const t = (ticker || "").trim().toUpperCase();
  const d = date?.trim() || "";
  return useQuery<TickerBrief>({
    queryKey: ["intel-v3", "ticker-brief", t, d],
    queryFn: async () => {
      const params = d ? `?date=${encodeURIComponent(d)}` : "";
      const { data } = await apiClient.get<Record<string, unknown>>(
        `/intel-v3/ticker-brief/${encodeURIComponent(t)}${params}`,
      );
      return decodeTickerBrief(data, t);
    },
    enabled: !!t,
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
  });
}

export function useGenerateTickerBrief() {
  const qc = useQueryClient();
  return useMutation<TickerBrief, Error, { ticker: string; force?: boolean }>({
    mutationFn: async (vars) => {
      const t = vars.ticker.toUpperCase();
      const qs = vars.force ? "?force=true" : "";
      const { data } = await apiClient.post<Record<string, unknown>>(
        `/intel-v3/ticker-brief/${encodeURIComponent(t)}/generate${qs}`,
      );
      return decodeTickerBrief(data, t);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["intel-v3", "ticker-brief", vars.ticker.toUpperCase()],
      });
    },
  });
}

function decodeTickerBrief(raw: Record<string, unknown>, ticker: string): TickerBrief {
  if (!raw || raw.exists === false) {
    return { ticker, exists: false };
  }
  return {
    ticker: String(raw.ticker ?? ticker),
    date: raw.date as string | undefined,
    generated_at: raw.generated_at as string | undefined,
    headline: (raw.headline as string | undefined) || undefined,
    narrative: (raw.narrative as string | undefined) || undefined,
    watch_for: safeParse<string[]>(raw.watch_for, []),
    convergence_label: raw.convergence_label as string | undefined,
    convergence_score:
      typeof raw.convergence_score === "number" ? raw.convergence_score : undefined,
    model: raw.model as string | undefined,
  };
}

/** Recent daily-brief rows (date + summary headers only, no full body). */
export function useRecentBriefs(limit: number = 14) {
  return useQuery<DailyBrief[]>({
    queryKey: ["intel-v3", "briefs", limit],
    queryFn: async () => {
      const { data } = await apiClient.get<Record<string, unknown>[]>(
        `/intel-v3/briefs?limit=${limit}`,
      );
      return data.map(decodeBrief);
    },
    staleTime: STALE_TIMES.flow,
    refetchInterval: REFETCH_MS,
  });
}

/* ── Helpers ─────────────────────────────────────────────── */

function safeParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function decodeBrief(raw: Record<string, unknown>): DailyBrief {
  if (!raw || raw.exists === false) {
    return {
      date: String(raw?.date ?? ""),
      exists: false,
    };
  }
  return {
    date: String(raw.date ?? ""),
    generated_at: raw.generated_at as string | undefined,
    market_summary: raw.market_summary as string | undefined,
    top_themes: safeParse<BriefTheme[]>(raw.top_themes, []),
    top_tickers: safeParse<BriefTicker[]>(raw.top_tickers, []),
    forward_catalysts: safeParse<BriefCatalyst[]>(raw.forward_catalysts, []),
    n_news_items: typeof raw.n_news_items === "number" ? raw.n_news_items : undefined,
    n_tickers_covered:
      typeof raw.n_tickers_covered === "number" ? raw.n_tickers_covered : undefined,
  };
}
