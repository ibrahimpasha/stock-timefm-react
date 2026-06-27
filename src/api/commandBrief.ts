import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "./client";

/* Command Center daily brief — a market-intelligence desk note (movers + why,
 * earnings, flow-vs-catalyst), NOT a recap of the paper books. See backend
 * src/command_brief.py. Three session briefs per trading day capture the arc:
 * premarket (pre-open) → midday (mid-session) → afterhours (post-close). */

export type BriefSession = "premarket" | "midday" | "afterhours";

export const SESSION_ORDER: BriefSession[] = ["premarket", "midday", "afterhours"];

export const SESSION_LABELS: Record<BriefSession, string> = {
  premarket: "Pre-Market",
  midday: "Midday",
  afterhours: "After-Hours",
};

/** Which of the three daily briefs is live right now, by PT clock — mirrors the
 * backend's _current_session so the UI can default to the right tab without a
 * round-trip. Open 6:30 PT (390), close 13:00 PT (780). */
export function currentSession(): BriefSession {
  const pt = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const m = pt.getHours() * 60 + pt.getMinutes();
  if (m < 390) return "premarket";
  if (m < 780) return "midday";
  return "afterhours";
}

export interface BriefSessionInfo {
  session: BriefSession;
  label: string;
  generated_at: string;
}

export interface BriefRegime {
  vix: number;
  vix_regime: string;
  spy_price: number;
  spy_change_pct: number;
  market_status: string | null;
  posture: "risk-on" | "neutral" | "risk-off";
  sizing: "full" | "half";
  is_safe: boolean;
}

export interface BriefMover {
  ticker: string;
  pct: number;
  earnings_in: number | null;
  has_flow: boolean;
  flow_score: number | null;
  in_book: boolean;
  on_radar: boolean;
  intel: string;
}

export interface BriefMovers {
  gainers: BriefMover[];
  losers: BriefMover[];
  priced: number;
}

export interface BriefEarningsRow {
  ticker: string;
  date: string;
  days_out: number;
  weight: string | null;
  session: string | null;
  has_flow: boolean;
  flow_score: number | null;
}

export interface BriefEarnings {
  this_week: BriefEarningsRow[];
  flow_into_earnings: BriefEarningsRow[];
}

export interface BriefFlowStandout {
  ticker: string;
  side: string;
  ml: number | null;
  nscore: number | null;
  premium: number;
  earnings_in: number | null;
}

export interface BriefTheme {
  category: string;
  ratio: number;
  tickers: number | null;
}

export interface BriefBookFootnote {
  label: string;
  return_pct: number | null;
  open_positions: number | null;
  near_stop: number;
}

export interface BriefMacro {
  date: string;
  label: string;
}

export interface BriefFocus {
  ticker: string;
  views: number;
  pct: number | null;
  earnings_in: number | null;
  in_book: boolean;
}

export interface BriefContext {
  as_of: string;
  pt_date: string;
  regime: BriefRegime | Record<string, never>;
  movers: BriefMovers;
  earnings: BriefEarnings;
  flow: BriefFlowStandout[];
  macro_next: BriefMacro[];
  themes: { hot: BriefTheme[]; cooling: BriefTheme[] };
  books: BriefBookFootnote[];
  focus: BriefFocus[];
  rule_flags: string[];
}

export interface BriefDeltaItem {
  kind: string;
  text: string;
  dir: "up" | "down" | "neutral";
}

export interface BriefDeltas {
  since: string | null;
  items: BriefDeltaItem[];
}

export interface BriefMoverExplained {
  ticker: string;
  move: string;
  why: string;
  flag?: string;
}

export interface BriefWatch {
  ticker: string;
  why: string;
}

export type PlayAction =
  | "ACCUMULATE"
  | "WATCH"
  | "AVOID"
  | "MANAGE"
  | "TRIM"
  | "HEDGE";

export interface BriefPlay {
  ticker: string;
  action: PlayAction | string;
  thesis: string;
  trigger: string;
  risk: string;
}

export interface BriefRead {
  headline: string;
  read: string;
  movers_explained: BriefMoverExplained[];
  watch: BriefWatch[];
  plays: BriefPlay[];
  heads_up: string[];
}

export interface CommandBrief {
  as_of: string;
  pt_date: string;
  session?: BriefSession;
  session_label?: string;
  current_session?: BriefSession;
  available_sessions?: BriefSessionInfo[];
  context: BriefContext;
  read: BriefRead | Record<string, never>;
  read_as_of: string | null;
  stale: boolean;
  pending?: boolean;
  gen_eta_min?: number | null;
  historical?: boolean;
  deltas?: BriefDeltas;
}

export interface AskTurn {
  q: string;
  a: string;
}

export interface BriefDate {
  pt_date: string;
  generated_at: string | null;
  sessions: BriefSessionInfo[];
}

/** Fast read: today's live brief for a session, or a stored past brief when
 * `date` is set. `session` selects which of the day's three briefs (defaults to
 * the live session by PT clock on the backend). */
export function useCommandBrief(date?: string, session?: BriefSession) {
  const isHistory = !!date;
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (session) params.set("session", session);
  const qs = params.toString();
  return useQuery<CommandBrief>({
    queryKey: ["command-brief", date || "live", session || "current"],
    queryFn: () =>
      apiClient.get<CommandBrief>(`/command-brief${qs ? `?${qs}` : ""}`).then((r) => r.data),
    staleTime: isHistory ? Infinity : 60_000,
    refetchInterval: isHistory ? false : 5 * 60_000,
    retry: false, // a missing past session is a clean 404, not worth retrying
  });
}

/** Stored brief dates (newest first) for the history dropdown. */
export function useBriefDates() {
  return useQuery<{ dates: BriefDate[] }>({
    queryKey: ["command-brief-dates"],
    queryFn: () =>
      apiClient.get<{ dates: BriefDate[] }>("/command-brief/dates").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

/** Force-regenerate the Read for a session (~3 min claude call). */
export function useRefreshBrief(session?: BriefSession) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient
        .post<CommandBrief>(`/command-brief/refresh${session ? `?session=${session}` : ""}`)
        .then((r) => r.data),
    onSuccess: (data) =>
      qc.setQueryData(["command-brief", "live", session || "current"], data),
  });
}

/** L3 — Ask the desk. Returns {answer, tickers}. */
export function useAskDesk() {
  return useMutation({
    mutationFn: (vars: { question: string; history: AskTurn[] }) =>
      apiClient
        .post<{ answer: string; tickers: string[] }>("/command-brief/ask", vars)
        .then((r) => r.data),
  });
}

/** L4 — mark the current pulse as caught-up so future deltas reset. */
export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/command-brief/seen").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["command-brief", "live"] }),
  });
}

/** L5 — fire-and-forget: log that the user opened a ticker. */
export function trackTicker(ticker: string) {
  if (!ticker) return;
  apiClient.post(`/command-brief/track?ticker=${encodeURIComponent(ticker)}`).catch(() => {});
}
