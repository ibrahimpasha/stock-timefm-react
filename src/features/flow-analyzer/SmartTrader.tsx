import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  Shield,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Flame,
  Network,
  Users,
  Scissors,
  Anchor,
  Clock,
  Target,
  Lightbulb,
  Calendar,
  Layers,
} from "lucide-react";
import apiClient from "../../api/client";
import { formatCurrency, changeColor } from "../../lib/utils";
import { daysFromToday } from "../../lib/dateOnly";
import { useAppStore } from "../../store/useAppStore";
import { GlassPanel, Chip, Stat, Segmented } from "../../components/Glass";
import type { ChipTone } from "../../components/Glass";
import { GexWall } from "../gex/GexWall";

type PersonaName = "smart" | "aggressive" | "builder" | "ruby" | "gemfinder" | "supercycle" | "conviction";

interface PersonaRow {
  name: PersonaName;
  description: string;
  instrument_kind: "option" | "equity";
  return_pct: number;
  open_positions: number;
  total_value: number;
  ml_threshold?: number | null;
  ml_serving_mode?: "disabled" | "rank_only" | "gate_and_rank";
  error?: string;
}

interface RankBreakdown {
  validated?: boolean;
  policy_version?: string;
  base_name: string;
  base_score: number;
  components?: Array<{
    name: string;
    score: number;
    weight: number;
    contribution: number;
  }>;
  ml_score: number | null;
  ml_serving_mode: string;
  setup_score: number | null;
  evidence_score?: number | null;
  evidence_adjustment?: number;
  model_adjustment?: number;
  category_adjustment: number;
  pulse_adjustment: number;
  total: number;
}

interface DecisionReceipt {
  source?: {
    date?: string;
    age_days?: number | null;
    status?: string;
    fallback_used?: boolean;
  };
  intent?: { option_type?: string; action?: string; direction?: string };
  ml?: {
    serving_mode?: string;
    model_version?: string | null;
    score?: number | null;
    gate_applied?: boolean;
  };
  rank?: RankBreakdown;
  research_gate?: { approved: boolean; families: string[]; reasons: string[] };
  execution?: {
    fill_kind?: string;
    quote?: { source?: string; observed_at?: string; bid?: number; ask?: number; data_delay_seconds?: number };
  };
}

interface Position {
  id: number;
  persona: PersonaName;
  instrument: "option" | "equity";
  entry_date: string;
  ticker: string;
  option_type: string | null;
  side: string;
  strike: number | null;
  expiry: string | null;
  dte_at_entry: number | null;
  premium_at_entry: number;
  entry_underlying: number | null;
  contracts: number;
  cost_basis: number;
  ml_score: number | null;
  n_score: number | null;
  graph_score: number | null;
  category: string | null;
  theme: string | null;
  category_hotness: number | null;
  structural_role: string | null;
  theme_accel: number | null;
  current_premium: number | null;
  current_value: number | null;
  current_underlying: number | null;
  pnl_pct: number | null;
  pnl_dollars: number | null;
  status: "open" | "closed";
  exit_date: string | null;
  exit_premium: number | null;
  exit_reason: string | null;
  realized_pnl_pct: number | null;
  realized_pnl_dollars: number | null;
  // AbTrader scale-out bookkeeping (added 2026-06).
  original_contracts: number | null;
  scale_stage: number | null;
  parent_id: number | null;
  peak_pnl_pct: number | null;
  reason: string | null;
  rank_score?: number | null;
  rank_breakdown?: RankBreakdown | null;
  ml_serving_mode?: string | null;
  decision_receipt?: DecisionReceipt | null;
}

interface CategoryTrendItem {
  category: string;
  premium_window: number;
  premium_baseline: number;
  hotness_ratio: number;
  ticker_count: number;
  top_tickers: { ticker: string; premium: number }[];
  themes: { theme: string; premium: number }[];
  window_days: number;
  baseline_days: number;
  dates_in_window: string[];
}

interface CategoriesResponse {
  trend: CategoryTrendItem[];
  window: "today" | "7d" | "30d";
  window_days: number;
  baseline_days: number;
  note: string | null;
}

type CategoryWindow = "today" | "7d" | "30d";

interface Competitor {
  name: string;
  bias?: string | null;
  edge_desc?: string | null;
}

interface ThemePeer {
  ticker: string;
  role?: string | null;
}

interface GraphContext {
  available: boolean;
  reason?: string;
  ticker?: string;
  bias?: string | null;
  bias_reason?: string | null;
  sector?: string | null;
  theme?: string | null;
  competitors?: Competitor[];
  // Richer fields the graphify knowledge graph returns (bias was retired
  // 2026-06; these are what actually carries signal now).
  structural_role?: { role?: string | null; reason?: string | null } | null;
  community?: { id?: number; label?: string | null } | null;
  key_facts?: string[] | null;
  sentiment?: string | null;
  competitors_text?: string | null;
  outlook?: string | null;
  theme_peers?: ThemePeer[] | null;
  intel_as_of?: string | null;
}

interface Summary {
  persona: PersonaName;
  persona_description: string;
  instrument_kind: "option" | "equity";
  starting_capital: number;
  cash: number;
  positions_value: number;
  total_value: number;
  return_pct: number;
  realized_pnl: number;
  unrealized_pnl: number;
  open_positions: number;
  closed_positions: number;
  win_rate: number;
  banked_from_trims?: number;
  positions: Position[];
  closed: Position[];
}

interface RejectedEntry {
  ticker: string;
  option_type: string | null;
  strike: number | null;
  dte: number | null;
  ml_score: number | null;
  reason: string;
  rule_id: number;
}

interface TodayResponse {
  date: string;
  picked: Position[];
  rejected_count: number;
  rejected_by_rule: Record<string, RejectedEntry[]>;
}

interface HistoryPoint {
  date: string;
  value: number;
  return_pct: number;
  open: number;
  realized: number;
  unrealized: number;
}

// Hooks — every query is keyed on persona so switching the dropdown
// invalidates cached data automatically.
function useSummary(persona: PersonaName) {
  return useQuery<Summary>({
    queryKey: ["smart-trader-summary", persona],
    queryFn: () =>
      apiClient
        .get(`/smart-trader/summary?persona=${persona}`)
        .then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function useToday(persona: PersonaName) {
  return useQuery<TodayResponse>({
    queryKey: ["smart-trader-today", persona],
    queryFn: () =>
      apiClient
        .get(`/smart-trader/today?persona=${persona}`)
        .then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function useHistory(persona: PersonaName) {
  return useQuery<HistoryPoint[]>({
    queryKey: ["smart-trader-history", persona],
    queryFn: () =>
      apiClient
        .get(`/smart-trader/history?days=60&persona=${persona}`)
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

function usePersonaList() {
  return useQuery<{ personas: PersonaRow[] }>({
    queryKey: ["smart-trader-personas"],
    queryFn: () => apiClient.get("/smart-trader/personas").then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// Persona watchlist — LIVING WL-A / WL-B: rows persist across days, marked
// to market from their add-date premium; breakouts promote, dead drop.
interface WatchlistRow {
  id?: number;
  ticker: string;
  option_type: string;
  strike: number | null;
  expiry: string;
  dte: number | null;
  ml_score: number | null;
  n_score: number | null;
  note: string;
  added: string;
  pnl_pct: number | null;
  peak_pnl_pct: number | null;
  status: string;
  drop_reason: string | null;
  promoted_at: string | null;
  current_dte?: number | null;
  decision_state?: "watching" | "triggered" | "eligible" | "blocked" | "entered" | "invalidated";
  block_reason?: string | null;
  last_evaluated_at?: string | null;
  triggered_at?: string | null;
  added_at?: string | null;
  source_date?: string | null;
  last_marked_at?: string | null;
}

interface WatchlistActivity {
  daily: { date: string; added: number; scans: number }[];
  last_scan_at: string | null;
  last_added_date: string | null;
  last_added_at: string | null;
  last_evaluated_at: string | null;
  last_marked_at: string | null;
  latest_source_date: string | null;
  last_reset_at: string | null;
}

function usePersonaWatchlist(persona: PersonaName, enabled: boolean) {
  return useQuery<{
    date: string | null;
    wla: WatchlistRow[];
    wlb: WatchlistRow[];
    history: WatchlistRow[];
    activity?: WatchlistActivity;
  }>({
    queryKey: ["smart-trader-watchlist", persona],
    queryFn: () =>
      apiClient.get(`/smart-trader/watchlist?persona=${persona}`).then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 300_000,
    enabled,
  });
}

function daysOn(added: string): number {
  return Math.max(0, -daysFromToday(added));
}

function watchlistTime(value?: string | null): string {
  if (!value) return "Not recorded";
  if (value.length === 10) return value;
  const parsed = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function WatchlistPanel({ persona }: { persona: PersonaName }) {
  const { data, isPending, isError, isFetching, refetch } = usePersonaWatchlist(persona, true);
  const queryClient = useQueryClient();
  const [mobileSection, setMobileSection] = useState<"wla" | "wlb" | "history" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState("newest");
  const [addedFilter, setAddedFilter] = useState("all");
  const reset = useMutation({
    mutationFn: (target: PersonaName) => apiClient.post(
      `/smart-trader/watchlist/reset?persona=${target}`, { confirm_persona: target },
    ),
    onSuccess: (_response, target) => queryClient.invalidateQueries({
      queryKey: ["smart-trader-watchlist", target],
    }),
  });
  const activity = data?.activity;
  const activeCount = (data?.wla.length ?? 0) + (data?.wlb.length ?? 0);
  const filterAndSort = (rows: WatchlistRow[]) => rows.filter((r) => {
    if (addedFilter === "all") return true;
    const days = activity?.daily.slice(addedFilter === "today" ? -1 : -7) ?? [];
    return days.some((d) => d.date === r.added);
  }).sort((a, b) => {
    if (sort === "ticker") return a.ticker.localeCompare(b.ticker) || b.added.localeCompare(a.added);
    if (sort === "pnl") return (b.pnl_pct ?? -Infinity) - (a.pnl_pct ?? -Infinity);
    if (sort === "checked") return (b.last_evaluated_at ?? "").localeCompare(a.last_evaluated_at ?? "");
    if (sort === "source") return (b.source_date ?? "").localeCompare(a.source_date ?? "");
    const order = (b.added_at ?? b.added).localeCompare(a.added_at ?? a.added) || (b.id ?? 0) - (a.id ?? 0);
    return sort === "oldest" ? -order : order;
  });
  const wla = filterAndSort(data?.wla ?? []);
  const wlb = filterAndSort(data?.wlb ?? []);
  const visibleSection = mobileSection ?? (wla.length || !wlb.length ? "wla" : "wlb");
  const contract = (r: WatchlistRow) =>
    `$${r.strike ?? "?"}${["C", "CALL"].includes(r.option_type) ? "C" : "P"} ${r.expiry}${
      (r.current_dte ?? r.dte) != null ? ` · ${r.current_dte ?? r.dte}d` : ""
    }`;
  const Row = ({ r }: { r: WatchlistRow }) => (
    <>
      <details className="group rounded-[var(--radius-control)] border border-border md:hidden">
        <summary className="flex min-h-11 list-none items-center gap-2 px-3 py-2 text-xs marker:content-none">
          <ChevronRight
            size={13}
            className="shrink-0 text-text-muted transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          <span className="w-12 shrink-0 font-mono font-semibold text-text-primary">
            {r.ticker}
          </span>
          <span className="num min-w-0 flex-1 truncate text-text-muted">
            {contract(r)}
          </span>
          {r.pnl_pct != null && (
            <span
              className="num shrink-0 font-semibold"
              style={{ color: changeColor(r.pnl_pct) }}
            >
              {r.pnl_pct >= 0 ? "+" : ""}{r.pnl_pct.toFixed(0)}%
            </span>
          )}
        </summary>
        <div className="space-y-2 px-3 pb-3 pl-10 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={r.decision_state === "eligible" ? "green" : "neutral"}>
              {r.decision_state ?? "watching"}
            </Chip>
            {r.triggered_at && <Chip tone="blue">Price trigger</Chip>}
            {r.ml_score != null && <Chip tone="blue">ML {r.ml_score}</Chip>}
            {r.peak_pnl_pct != null && r.peak_pnl_pct >= 30 && (
              <Chip tone="neutral" className="num">
                peak +{r.peak_pnl_pct.toFixed(0)}%
              </Chip>
            )}
            <span className="text-text-muted">{daysOn(r.added)}d on list</span>
          </div>
          <p className="break-words leading-relaxed text-text-secondary">
            {r.block_reason || (r.last_evaluated_at ? r.note : "Legacy observation; eligibility not evaluated.")}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-muted">
            <dt>Added</dt><dd>{watchlistTime(r.added_at ?? r.added)}</dd>
            <dt>Flow date</dt><dd>{r.source_date ?? "Not recorded"}</dd>
            <dt>Evaluated</dt><dd>{watchlistTime(r.last_evaluated_at)}</dd>
            <dt>Mark cycle</dt><dd>{watchlistTime(r.last_marked_at)}</dd>
          </dl>
        </div>
      </details>
      <div className="hidden items-center gap-2 text-xs md:flex md:flex-wrap">
        <span className="w-14 font-mono font-semibold">{r.ticker}</span>
        <span className="num text-text-muted">{contract(r)}</span>
        {r.pnl_pct != null && (
          <span className="num font-semibold" style={{ color: changeColor(r.pnl_pct) }}>
            {r.pnl_pct >= 0 ? "+" : ""}{r.pnl_pct.toFixed(0)}%
          </span>
        )}
        {r.peak_pnl_pct != null && r.peak_pnl_pct >= 30 && (
          <span className="num text-text-muted">peak +{r.peak_pnl_pct.toFixed(0)}%</span>
        )}
        <Chip tone={r.decision_state === "eligible" ? "green" : "neutral"}>
          {r.decision_state ?? "watching"}
        </Chip>
        {r.triggered_at && <Chip tone="blue">Price trigger</Chip>}
        {r.ml_score != null && <Chip tone="blue">ML {r.ml_score}</Chip>}
        <span className="text-text-muted">{daysOn(r.added)}d on list</span>
        <span className="text-text-secondary">Added {watchlistTime(r.added_at ?? r.added)}</span>
        <span className="text-text-muted">Flow {r.source_date ?? "unknown"}</span>
        <span className="text-text-muted">Evaluated {watchlistTime(r.last_evaluated_at)}</span>
        <span className="text-text-muted">
          {r.block_reason || (r.last_evaluated_at ? r.note : "Legacy observation; eligibility not evaluated.")}
        </span>
      </div>
    </>
  );
  return (
    <GlassPanel title="Watchlist">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 items-center gap-2 text-xs text-text-muted">
          Sort
          <select aria-label="Sort watchlist" value={sort} onChange={(e) => setSort(e.target.value)}
            className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary">
            <option value="newest">Newest added</option><option value="oldest">Oldest added</option>
            <option value="checked">Recently evaluated</option><option value="source">Latest flow date</option>
            <option value="ticker">Ticker A-Z</option><option value="pnl">Modeled gain</option>
          </select>
        </label>
        <select aria-label="Watchlist additions period" value={addedFilter} onChange={(e) => setAddedFilter(e.target.value)}
          disabled={!activity} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary">
          <option value="all">All additions</option><option value="today">Added today (PT)</option><option value="week">Added last 7 days (PT)</option>
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title="Reload watchlist" aria-label="Reload watchlist" disabled={isFetching}
            onClick={() => void refetch()} className="flex size-11 items-center justify-center text-text-muted disabled:opacity-50">
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button type="button" disabled={!activeCount || reset.isPending || isError} onClick={() => {
            if (window.confirm(`Reset the ${persona} watchlist?\n\nArchive ${activeCount} active observations. Positions, cash and history stay unchanged. These contracts can return when a newer flow date is observed. No scan or trade is started.`)) reset.mutate(persona);
          }} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-xs text-text-secondary disabled:opacity-50">
            <RotateCcw size={14} />{reset.isPending ? "Resetting..." : "Reset watchlist"}
          </button>
        </div>
      </div>
      {reset.isError && <p role="alert" className="mb-3 text-xs text-accent-red">Reset failed. Reload the list before trying again.</p>}
      {reset.isSuccess && <p role="status" className="mb-3 text-xs text-text-secondary">{reset.data.data.archived_count} observations archived. Positions and cash unchanged.</p>}
      {isError && <p role="alert" className="mb-3 text-xs text-accent-red">Watchlist could not be reloaded. Displayed data may be out of date.</p>}
      {isPending && <p role="status" className="py-3 text-xs text-text-muted">Loading watchlist...</p>}
      {activity && <div className="mb-4 space-y-3 border-b border-border pb-3 text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-text-muted lg:grid-cols-4">
          <div>Added today (PT)<div className="num mt-1 font-semibold text-text-primary">{activity.daily.at(-1)?.added ?? 0}</div></div>
          <div>Added in 7 days<div className="num mt-1 font-semibold text-text-primary">{activity.daily.slice(-7).reduce((sum, d) => sum + d.added, 0)}</div></div>
          <div>Last addition<div className="mt-1 text-text-primary">{watchlistTime(activity.last_added_at ?? activity.last_added_date)}</div></div>
          <div>Last recorded scan<div className="mt-1 text-text-primary">{watchlistTime(activity.last_scan_at)}</div></div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-text-muted">
          <span>Latest observed flow: {activity.latest_source_date ?? "Not recorded"}</span>
          <span>Last mark cycle: {watchlistTime(activity.last_marked_at)}</span>
        </div>
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-text-secondary"><Clock size={14} />Daily activity (14 days, PT)</summary>
          <table className="w-full text-left text-xs">
            <thead className="text-text-muted"><tr><th className="py-2 font-medium">Date</th><th className="font-medium">Added</th><th className="font-medium">Recorded scans</th></tr></thead>
            <tbody>{[...activity.daily].reverse().map((day) => <tr key={day.date} className="border-t border-border">
              <td className="py-2 num">{day.date}</td><td className="num text-accent-blue">+{day.added}</td><td className="num">{day.scans}</td>
            </tr>)}</tbody>
          </table>
        </details>
      </div>}
      {data && !activeCount && <p className="mb-3 py-3 text-sm text-text-muted">No active observations for {persona}.</p>}
      <Segmented<"wla" | "wlb" | "history">
        className="mobile-horizontal-strip mb-3 w-full md:hidden"
        ariaLabel="Choose watchlist section"
        value={visibleSection}
        onChange={setMobileSection}
        options={[
          { value: "wla", label: "Screened", badge: <span className="num">{wla.length}</span> },
          { value: "wlb", label: "Monitoring", badge: <span className="num">{wlb.length}</span> },
          { value: "history", label: "Moves", badge: <span className="num">{(data?.history ?? []).length}</span> },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${visibleSection === "wla" ? "space-y-1.5" : "hidden"} md:block md:space-y-1.5`}>
          <div className="text-xs font-semibold text-text-muted">
            Screened observations ({wla.length})
          </div>
          <div className="space-y-1.5">
            {wla.slice(0, showAll ? undefined : 12).map((r, i) => <Row key={r.id ?? `a${i}`} r={r} />)}
            {!wla.length && <div className="py-3 text-center text-sm text-text-muted">No screened observations in this period.</div>}
          </div>
        </div>
        <div className={`${visibleSection === "wlb" ? "space-y-1.5" : "hidden"} md:block md:space-y-1.5`}>
          <div className="text-xs font-semibold text-text-muted">
            Monitoring / blocked ({wlb.length})
          </div>
          <div className="space-y-1.5">
            {wlb.slice(0, showAll ? undefined : 12).map((r, i) => <Row key={r.id ?? `b${i}`} r={r} />)}
            {!wlb.length && <div className="py-3 text-center text-sm text-text-muted">No monitored observations in this period.</div>}
          </div>
        </div>
      </div>
      {(wla.length > 12 || wlb.length > 12) && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 min-h-11 text-xs text-accent">
          {showAll ? "Show fewer" : "Show all observations"}
        </button>
      )}
      <div className={`${visibleSection === "history" ? "mt-3 space-y-1.5" : "hidden"} md:mt-3 ${(data?.history ?? []).length > 0 ? "md:block" : "md:hidden"} md:space-y-1`}>
          <div className="text-xs font-semibold text-text-muted">Recent moves</div>
          {(data?.history ?? []).slice(0, 8).map((r, i) => (
            <div key={`h${i}`} className="flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 py-2 text-xs text-text-muted md:min-h-0 md:rounded-none md:border-0 md:p-0">
              <Chip tone={r.status === "entered" ? "green" : "neutral"}>
                {r.status.toUpperCase()}
              </Chip>
              <span className="font-mono">{r.ticker}</span>
              <span className="num">{contract(r)}</span>
              {r.pnl_pct != null && (
                <span className="num">{r.pnl_pct >= 0 ? "+" : ""}{r.pnl_pct.toFixed(0)}%</span>
              )}
              <span>{r.drop_reason ?? ""}</span>
            </div>
          ))}
          {(data?.history ?? []).length === 0 && (
            <div className="py-3 text-center text-sm text-text-muted">No recent watchlist moves.</div>
          )}
      </div>
    </GlassPanel>
  );
}

// Ruby Desk Log — per-cycle desk notes from the intraday judge.
interface RubyLogEvent {
  ts: string;
  regime?: string;
  frozen?: boolean;
  candidates?: number;
  passed?: number;
  read?: string;
  vetoes?: { ticker: string; type: string; strike: number | null; reason: string }[];
  opened?: { ticker: string; option_type: string; strike: number; expiry: string; contracts: number }[];
  exits?: { ticker: string; reason: string; pnl_pct: number }[];
  trims?: { ticker?: string; reason?: string; pnl_pct?: number }[];
}

function useRubyLog(enabled: boolean) {
  return useQuery<{ events: RubyLogEvent[] }>({
    queryKey: ["smart-trader-ruby-log"],
    queryFn: () => apiClient.get("/smart-trader/ruby-log?limit=40").then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled,
  });
}

function RubyDeskLog() {
  const { data } = useRubyLog(true);
  const events = data?.events ?? [];
  if (!events.length) {
    return (
      <GlassPanel title="Desk Log">
        <div className="text-xs text-text-muted">
          No cycles logged yet — the log fills as the 15-min intraday loop
          enters, vetoes, trims, or freezes. Quiet cycles are not recorded.
        </div>
      </GlassPanel>
    );
  }
  return (
    <GlassPanel title="Desk Log">
      <div className="space-y-3">
        {events.map((e, i) => (
          <div key={`${e.ts}-${i}`} className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="num text-text-muted">
                {new Date(e.ts + (e.ts.endsWith("Z") ? "" : "Z")).toLocaleString([], {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {e.regime && <Chip tone="neutral">{e.regime}</Chip>}
              {e.frozen && <Chip tone="red">FROZEN — daily loss cap</Chip>}
              {(e.opened ?? []).map((o, j) => (
                <Chip key={`o${j}`} tone="green">
                  ENTER {o.ticker} ${o.strike}
                  {o.option_type === "CALL" ? "C" : "P"} x{o.contracts}
                </Chip>
              ))}
              {(e.vetoes ?? []).map((v, j) => (
                <Chip key={`v${j}`} tone="yellow">VETO {v.ticker}</Chip>
              ))}
              {(e.trims ?? []).map((t, j) => (
                <Chip key={`t${j}`} tone="neutral">TRIM {t.ticker ?? ""}</Chip>
              ))}
              {(e.exits ?? []).map((x, j) => (
                <Chip key={`x${j}`} tone={x.pnl_pct >= 0 ? "green" : "red"}>
                  EXIT {x.ticker} {x.pnl_pct >= 0 ? "+" : ""}
                  {x.pnl_pct?.toFixed(0)}%
                </Chip>
              ))}
              <span className="text-text-muted">
                {e.candidates ?? 0} flow → {e.passed ?? 0} passed gate
              </span>
            </div>
            {e.read && <div className="text-sm">{e.read}</div>}
            {(e.vetoes ?? []).length > 0 && (
              <div className="text-xs text-text-muted space-y-0.5">
                {(e.vetoes ?? []).map((v, j) => (
                  <div key={j}>
                    VETO {v.ticker} ${v.strike}
                    {v.type === "CALL" ? "C" : "P"} — {v.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function useCategories(window: CategoryWindow) {
  return useQuery<CategoriesResponse>({
    queryKey: ["smart-trader-categories", window],
    queryFn: () =>
      apiClient
        .get(`/smart-trader/categories?window=${window}`)
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

function useGraphContext(ticker: string, enabled: boolean) {
  return useQuery<GraphContext>({
    queryKey: ["smart-trader-context", ticker],
    queryFn: () =>
      apiClient
        .get(`/smart-trader/context/${ticker}?limit=8`)
        .then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: enabled && !!ticker,
  });
}

function QueryErrorState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 py-2 text-xs text-accent-red">
      <XCircle size={13} />
      <span>{label}</span>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
      >
        <RefreshCw size={11} /> Retry
      </button>
    </div>
  );
}

// Rule meta — labels + plain-English explanations for the transparency panel.
// Labels are persona-agnostic — the exact threshold (e.g. "ml_score 36 < 50",
// "dte=64 outside [1, 45]") lives in each entry's own `reason` string and is
// rendered per-row. Don't hardcode numbers here; they differ per persona
// (aggressive is ML 50 / DTE 1-45, smart is ML 70 / DTE 8-30).
const RULE_LABELS: Record<string, { id: number; label: string; why: string }> = {
  no_0_7_DTE: {
    id: 1,
    label: "Rule 1 — DTE out of range",
    why: "Short-dated and far-dated entries are the dominant loss driver in your history.",
  },
  no_averaging_down: {
    id: 2,
    label: "Rule 2 — already open on ticker",
    why: "Averaging down on options cost the account roughly $129K in the lookback.",
  },
  max_2pct_per_series: {
    id: 4,
    label: "Rule 4 — position over size cap",
    why: "Oversized series caused the deepest single-name drawdowns.",
  },
  no_BTO_3d_after_2k_loss: {
    id: 7,
    label: "Rule 7 — cooldown after a $2K paper loss",
    why: "Post-loss tickets averaged 4.7 times worse P/L than the baseline.",
  },
  no_30d_reentry_after_loss: {
    id: 9,
    label: "Rule 9 — 30-day re-entry block on same ticker",
    why: "Re-entries on losing names compounded the original loss in every prior case.",
  },
  low_ml_score: {
    id: 99,
    label: "ML score below threshold",
    why: "Filter is a quality gate, not a rule from the trade-check skill itself.",
  },
  liquidity_cap: {
    id: 11,
    label: "Rule 11 — contract too illiquid to size",
    why: "Thin open-interest/volume contracts can't absorb an executable size; sizing rejects them.",
  },
};

function ScoreChip({ score, label }: { score: number; label: string }) {
  const tone: ChipTone = score >= 85 ? "green" : score >= 70 ? "blue" : "neutral";
  return (
    <Chip tone={tone} className="num">
      {label} {score}
    </Chip>
  );
}

function SideIcon({ side }: { side: string }) {
  if (side === "Bull") return <TrendingUp size={12} className="text-accent-green" />;
  return <TrendingDown size={12} className="text-accent-red" />;
}

function StopProgressBar({
  pnl,
  stopPct = -40,
}: {
  pnl: number;
  stopPct?: number;
}) {
  // Range is [stopPct, +100]. Bar shows position along that range so the
  // user can eyeball stop proximity. stopPct is negative (e.g. -40, -60, -20).
  const span = 100 - stopPct;
  const pos = Math.max(0, Math.min(100, ((pnl - stopPct) / span) * 100));
  const stopMark = ((0 - stopPct) / span) * 100;
  return (
    <div className="relative h-1.5 rounded-full bg-border overflow-hidden">
      <div
        className="absolute h-full rounded-full transition-all"
        style={{
          width: `${pos}%`,
          background: pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)",
        }}
      />
      <div
        className="absolute h-full w-px bg-text-muted"
        style={{ left: `${stopMark}%` }}
      />
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  ENABLER: "var(--accent-green)",
  PLATFORM: "var(--accent-blue)",
  BOTTLENECK: "var(--accent-orange)",
  CHOKEPOINT: "var(--accent-orange)",
  CONSUMER: "var(--accent-purple)",
  NEUTRAL: "var(--text-muted)",
};
const roleColor = (r?: string | null) =>
  ROLE_COLORS[(r || "").toUpperCase()] || "var(--accent-cyan)";

function GraphContextPanel({ ticker }: { ticker: string }) {
  const { data, isLoading, isError, refetch } = useGraphContext(ticker, true);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  if (isLoading) {
    return (
      <div className="text-text-muted text-xs flex items-center gap-1 py-2">
        <Loader2 size={12} className="animate-spin" />
        loading graph context...
      </div>
    );
  }
  if (isError) {
    return <QueryErrorState label={`Unable to load graph context for ${ticker}.`} onRetry={() => void refetch()} />;
  }
  if (!data || !data.available) {
    return (
      <div className="text-text-muted text-xs italic py-2">
        no graph entry for {ticker}
        {data?.reason ? ` (${data.reason})` : ""}
      </div>
    );
  }
  const role = data.structural_role?.role || null;
  const roleReason = data.structural_role?.reason || null;
  const keyFacts = (data.key_facts || []).filter(Boolean);
  const peers = (data.theme_peers || []).filter((p) => p && p.ticker).slice(0, 12);
  const competitors =
    data.competitors_text ||
    (data.competitors || []).map((c) => c.name).filter(Boolean).join(", ");

  return (
    <div className="space-y-2.5 pt-2 border-t border-border">
      {/* taxonomy + community + freshness */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {data.sector && <Chip tone="blue">{data.sector}</Chip>}
        {data.theme && <Chip tone="cyan">{data.theme}</Chip>}
        {data.community?.label && (
          <Chip tone="purple">{data.community.label}</Chip>
        )}
        {data.intel_as_of && (
          <span className="text-text-muted ml-auto num">
            graph {data.intel_as_of}
          </span>
        )}
      </div>

      {/* structural role in the AI build-out + its reasoning */}
      {role && (
        <div
          className="rounded-md px-2 py-1.5"
          style={{ background: tint(roleColor(role), 8), border: `1px solid ${tint(roleColor(role), 22)}` }}
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <Network size={11} style={{ color: roleColor(role) }} />
            <span className="text-xs font-bold" style={{ color: roleColor(role) }}>
              {role}
            </span>
            <span className="text-xs text-text-muted">in the AI build-out</span>
          </div>
          {roleReason && (
            <div className="text-xs text-text-secondary leading-snug">{roleReason}</div>
          )}
        </div>
      )}

      {/* dated catalysts / key facts */}
      {keyFacts.length > 0 && (
        <div className="text-xs">
          <div className="text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Calendar size={10} /> Catalysts &amp; key facts
          </div>
          <ul className="space-y-1">
            {keyFacts.slice(0, 5).map((f, i) => (
              <li key={i} className="flex items-start gap-1.5 text-text-secondary leading-snug">
                <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: "var(--accent-cyan)" }} />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* analyst / market sentiment narrative */}
      {data.sentiment && (
        <div
          className="text-xs text-text-secondary leading-snug rounded px-2 py-1.5"
          style={{ background: "color-mix(in srgb, var(--bg-card) 50%, transparent)" }}
        >
          <span className="text-text-muted uppercase tracking-wider mr-1">Sentiment</span>
          {data.sentiment}
        </div>
      )}

      {/* outlook (when present) */}
      {data.outlook && (
        <div className="text-xs text-text-secondary leading-snug">
          <span className="text-text-muted uppercase tracking-wider mr-1">Outlook</span>
          {data.outlook}
        </div>
      )}

      {/* competitors */}
      {competitors && (
        <div className="text-xs text-text-secondary leading-snug">
          <span className="text-text-muted uppercase tracking-wider mr-1">Competes with</span>
          {competitors}
        </div>
      )}

      {/* theme peers — clickable, colored by structural role */}
      {peers.length > 0 && (
        <div className="text-xs">
          <div className="text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Layers size={10} /> Theme peers
          </div>
          <div className="flex flex-wrap gap-1.5">
            {peers.map((p, i) => (
              <button
                key={`${p.ticker}-${i}`}
                onClick={() => setActiveTicker(p.ticker)}
                className="font-mono px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
                style={{
                  color: roleColor(p.role),
                  background: tint(roleColor(p.role), 10),
                  border: `1px solid ${tint(roleColor(p.role), 28)}`,
                }}
                title={p.role ? `${p.ticker} — ${p.role}` : p.ticker}
              >
                {p.ticker}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── AbTrader scale-out helpers ──────────────────────────────────────────── */

const tint = (c: string, pct: number) =>
  `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** Days a position has been (or was) held. */
function daysHeld(entry?: string | null, exit?: string | null): number | null {
  if (!entry) return null;
  const e = new Date(entry).getTime();
  const x = (exit ? new Date(exit) : new Date()).getTime();
  if (Number.isNaN(e) || Number.isNaN(x)) return null;
  return Math.max(0, Math.round((x - e) / 86_400_000));
}

/** Option breakeven at expiry: strike ± entry premium (CALL +, PUT −). */
function breakeven(p: Position): number | null {
  if (p.instrument === "equity" || p.strike == null) return null;
  const prem = p.premium_at_entry ?? 0;
  return p.option_type === "PUT" ? p.strike - prem : p.strike + prem;
}

/** Is this closed row a scale-out trim (vs a full position exit)? */
const isTrim = (p: Position) =>
  p.parent_id != null && (p.exit_reason || "").startsWith("scale");

/** "scale1_+50pct" -> "+50%" ; "scale2_+400pct" -> "+400%". */
function rungLabel(reason: string | null): string {
  const m = (reason || "").match(/_\+?(-?\d+)pct/);
  return m ? `+${m[1]}%` : reason || "";
}

/** Small stat chip used in the per-trade info row. */
function InfoChip({
  icon,
  label,
  value,
  color,
  title,
}: {
  icon?: React.ReactNode;
  label?: string;
  value: string;
  color?: string;
  title?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 num"
      style={{ color: color || "var(--text-secondary)" }}
      title={title}
    >
      {icon}
      {label && <span className="text-text-muted">{label}</span>}
      <span className="font-semibold">{value}</span>
    </span>
  );
}

/** Peak → now give-back gauge. The whole bar is the peak P/L; the filled part
 *  is what the position is still holding. A big unfilled gap = round-tripping
 *  gains — exactly the "missed unrealized opportunity" the user flagged. */
function GivebackBar({ peak, now }: { peak: number; now: number }) {
  if (peak <= 0) return null;
  const held = Math.max(0, Math.min(1, now / peak));
  const gaveBack = Math.max(0, peak - Math.max(0, now));
  const color =
    held >= 0.8 ? "var(--accent-green)" : held >= 0.5 ? "var(--accent-orange)" : "var(--accent-red)";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-text-muted shrink-0 inline-flex items-center gap-1 num">
        <Flame size={10} /> peak +{peak.toFixed(0)}%
      </span>
      <div
        className="relative h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: tint("var(--text-muted)", 22) }}
        title={`Holding ${(held * 100).toFixed(0)}% of a +${peak.toFixed(0)}% peak${
          gaveBack > 1 ? ` — gave back ${gaveBack.toFixed(0)} pts` : ""
        }`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${held * 100}%`, background: color }}
        />
      </div>
      <span className="num shrink-0" style={{ color }}>
        now {now >= 0 ? "+" : ""}
        {now.toFixed(0)}%
      </span>
    </div>
  );
}

/** Renders the scale-out trims booked on an open runner (or under a closed
 *  trade) as a compact banked-gains timeline. */
function ScaleTimeline({
  trims,
  original,
  remaining,
}: {
  trims: Position[];
  original: number | null;
  remaining?: number | null;
}) {
  if (!trims.length) return null;
  const banked = trims.reduce((s, t) => s + (t.realized_pnl_dollars ?? 0), 0);
  const soldCt = trims.reduce((s, t) => s + (t.contracts ?? 0), 0);
  const purple = "var(--accent-purple)";
  return (
    <div
      className="mt-2 rounded-md px-2 py-1.5 space-y-1"
      style={{ background: tint(purple, 8), border: `1px solid ${tint(purple, 22)}` }}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 font-semibold" style={{ color: purple }}>
          <Scissors size={11} /> Scaled out {trims.length}x
        </span>
        <span className="num font-bold" style={{ color: "var(--accent-green)" }}>
          banked +${banked.toFixed(0)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {trims
          .slice()
          .sort((a, b) => (a.scale_stage ?? 0) - (b.scale_stage ?? 0))
          .map((t) => (
            <Chip
              key={t.id}
              tone="purple"
              className="num"
              title={`Sold ${t.contracts} ct at ${rungLabel(t.exit_reason)} on ${t.exit_date} — banked $${(
                t.realized_pnl_dollars ?? 0
              ).toFixed(0)}`}
            >
              {rungLabel(t.exit_reason)}
              <span className="text-text-muted">x{t.contracts}</span>
            </Chip>
          ))}
        {remaining != null && original != null && remaining > 0 && (
          <Chip
            tone="cyan"
            className="num"
            title="Runner still open — rides with the stop trailed to breakeven (house money)"
          >
            <Anchor size={10} /> runner {remaining}/{original}
          </Chip>
        )}
      </div>
      {remaining != null && remaining > 0 && (
        <div className="text-xs text-text-muted">
          {soldCt} of {original} ct booked · stop now at breakeven — runner can&apos;t turn into a loss
        </div>
      )}
    </div>
  );
}

/** "Why this pick" — the entry rationale the persona acted on, rendered as a
 *  lead sentence + the scoring/convergence clauses as chips. */
function WhyPick({ reason, compact = false }: { reason: string | null; compact?: boolean }) {
  if (!reason) return null;
  const blue = "var(--accent-blue)";
  const [lead, ...rest] = reason.split(" · ");
  if (compact) {
    return (
      <div className="flex items-start gap-1 text-xs text-text-muted leading-snug pt-0.5">
        <Lightbulb size={10} style={{ color: blue, marginTop: 1 }} className="shrink-0" />
        <span>{reason}</span>
      </div>
    );
  }
  return (
    <div
      className="mt-2 rounded-md px-2 py-1.5"
      style={{ background: tint(blue, 7), border: `1px solid ${tint(blue, 18)}` }}
    >
      <div className="flex items-start gap-1.5">
        <Lightbulb size={11} style={{ color: blue, marginTop: 1 }} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-semibold" style={{ color: blue }}>
            Why this pick
          </div>
          <div className="text-xs text-text-secondary leading-snug">{lead}</div>
          {rest.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {rest.map((c, i) => (
                <Chip key={i} tone="neutral" className="num">
                  {c}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionAudit({ p }: { p: Position }) {
  const rank = p.rank_breakdown ?? p.decision_receipt?.rank;
  const source = p.decision_receipt?.source;
  const mode = p.ml_serving_mode ?? p.decision_receipt?.ml?.serving_mode;
  const quote = p.decision_receipt?.execution?.quote;
  const quality = p.decision_receipt?.research_gate;
  if (!rank && !source && !mode && !quote) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-text-muted">
      {rank?.validated === false && <Chip tone="neutral">Experimental policy</Chip>}
      {quote && (
        <span className="num">
          {quote.data_delay_seconds ? `${quote.data_delay_seconds / 60}m delayed quote` : "Indicative quote"}
          {" · simulated ask fill"}
        </span>
      )}
      {quality && <Chip tone={quality.approved ? "green" : "neutral"}>
        {quality.approved ? `Evidence checked: ${quality.families.join(", ")}` : "Evidence blocked"}
      </Chip>}
      {rank && (
        <span className="num text-text-secondary">
          Decision rank <strong className="text-text-primary">{rank.total.toFixed(1)}</strong>
          {` = ${rank.base_name} ${rank.base_score.toFixed(1)}`}
          {` ${(rank.model_adjustment ?? 0) >= 0 ? "+" : ""}${(rank.model_adjustment ?? 0).toFixed(1)} model`}
          {` ${rank.category_adjustment >= 0 ? "+" : ""}${rank.category_adjustment.toFixed(1)} category`}
          {` ${rank.pulse_adjustment >= 0 ? "+" : ""}${rank.pulse_adjustment.toFixed(1)} pulse`}
        </span>
      )}
      {rank?.components?.map((component) => (
        <Chip key={component.name} tone="neutral" className="num">
          {component.name.toLowerCase()} {Math.round(component.weight * 100)}%
        </Chip>
      ))}
      {mode && (
        <Chip tone={mode === "gate_and_rank" ? "green" : "blue"}>
          ML {mode === "gate_and_rank" ? "gate + rank" : mode.replaceAll("_", " ")}
        </Chip>
      )}
      {source?.date && (
        <span className="num">
          source {source.date}
          {source.fallback_used ? ` · fallback ${source.age_days ?? "?"}d old` : ""}
        </span>
      )}
    </div>
  );
}

function PositionCard({
  p,
  stopPct,
  trims = [],
}: {
  p: Position;
  stopPct: number;
  trims?: Position[];
}) {
  const [open, setOpen] = useState(false);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const isEquity = p.instrument === "equity";
  const pnl = p.pnl_pct ?? 0;
  const pnlDollars = p.pnl_dollars ?? 0;
  // Floor arms when the first ladder rung was CROSSED (scale_stage >= 1) —
  // mirror the backend. A 1-lot can't spare a contract to trim, but it still
  // earns the breakeven floor by crossing +30%; keying off the trim left
  // every 1-lot position (most of a $20K book) showing/riding the -60 stop.
  const scaled = (p.scale_stage ?? 0) >= 1;
  const held = daysHeld(p.entry_date);
  const be = breakeven(p);
  const peak = p.peak_pnl_pct;
  const entryU = p.entry_underlying;
  const curU = p.current_underlying;
  const uMove = entryU && curU ? ((curU - entryU) / entryU) * 100 : null;
  // Once the position has been trimmed, its floor is breakeven (house money).
  const effStop = scaled ? 0 : stopPct;
  const sideColor = isEquity
    ? "var(--accent-blue)"
    : p.side === "Bull"
    ? "var(--accent-green)"
    : "var(--accent-red)";
  const pnlColor = changeColor(pnl);
  // For equity, "premium" is per-share price. Format accordingly.
  const unitLabel = isEquity ? "share" : "contract";
  const unitWord = p.contracts === 1 ? unitLabel : `${unitLabel}s`;
  return (
    <div className="card" style={{ borderColor: tint(sideColor, 35) }}>
      <div className="flex items-center justify-between gap-2 max-md:flex-col max-md:items-stretch">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {!isEquity && <SideIcon side={p.side} />}
          <button
            onClick={() => setActiveTicker(p.ticker)}
            className="font-mono text-base font-extrabold text-text-primary hover:text-accent-blue transition-colors"
            title={`Open ${p.ticker} in the detail panel`}
          >
            {p.ticker}
          </button>
          {isEquity ? (
            <span className="num text-sm text-text-primary">
              ${p.premium_at_entry.toFixed(2)} entry
            </span>
          ) : (
            <>
              <span className="num text-sm text-text-primary">
                ${p.strike} {p.option_type}
              </span>
              <span className="text-text-muted text-xs num">
                exp {p.expiry} ({p.dte_at_entry}d)
              </span>
            </>
          )}
          <span className="text-text-muted text-xs num">
            x{p.contracts} {unitWord}
          </span>
          {p.ml_score != null && <ScoreChip score={p.ml_score} label="ML" />}
          {p.rank_score != null && <Chip tone="blue" className="num">rank {p.rank_score.toFixed(1)}</Chip>}
          {p.n_score != null && <ScoreChip score={p.n_score} label="N" />}
          {p.graph_score != null && (
            <Chip tone="purple" className="num" title="graph composite score">
              G {p.graph_score.toFixed(0)}
            </Chip>
          )}
          {p.structural_role &&
            !p.structural_role.startsWith("kw") && (
              <Chip
                tone="green"
                title="structural position in the AI build-out"
              >
                {p.structural_role}
              </Chip>
            )}
          {p.theme_accel != null && p.theme_accel > 1 && (
            <Chip
              tone="orange"
              className="num"
              title="theme option-premium acceleration (window / baseline)"
            >
              {p.theme_accel.toFixed(1)}x
            </Chip>
          )}
          {p.theme && (
            <Chip tone="cyan" title={p.category || ""}>
              {p.theme}
            </Chip>
          )}
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-3 text-xs max-md:w-full md:flex md:items-center">
          <div className="max-md:text-left md:text-right">
            <div className="text-text-muted">Cost</div>
            <div className="num text-text-primary">
              {formatCurrency(p.cost_basis)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-text-muted">Value</div>
            <div className="num text-text-primary">
              {formatCurrency(p.current_value ?? p.cost_basis)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-text-muted">P/L</div>
            <div
              className="num text-sm font-extrabold"
              style={{ color: pnlColor }}
            >
              {pnl >= 0 ? "+" : ""}
              {pnl.toFixed(1)}%
            </div>
            <div className="text-text-muted text-xs num">
              {pnlDollars >= 0 ? "+" : ""}${pnlDollars.toFixed(0)}
            </div>
          </div>
        </div>
      </div>
      {/* Why this pick — the entry rationale. */}
      <WhyPick reason={p.reason} />
      <DecisionAudit p={p} />

      {/* Per-trade context row — days held, underlying move, breakeven. */}
      <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs">
        {held != null && (
          <InfoChip
            icon={<Clock size={10} />}
            value={`${held}d held`}
            title={`Opened ${p.entry_date}`}
          />
        )}
        {uMove != null && entryU != null && curU != null && (
          <InfoChip
            icon={isEquity ? undefined : <TrendingUp size={10} />}
            label={isEquity ? "" : "stock"}
            value={`$${entryU.toFixed(2)} → $${curU.toFixed(2)} (${uMove >= 0 ? "+" : ""}${uMove.toFixed(1)}%)`}
            color={changeColor(uMove)}
            title="Underlying move since entry"
          />
        )}
        {be != null && (
          <InfoChip
            icon={<Target size={10} />}
            label="BE"
            value={`$${be.toFixed(2)}`}
            title={`Breakeven at expiry (strike ${p.option_type === "PUT" ? "−" : "+"} entry premium)`}
          />
        )}
      </div>

      {/* Peak vs now — the give-back gauge. */}
      {peak != null && peak >= 15 && (
        <div className="mt-2">
          <GivebackBar peak={peak} now={pnl} />
        </div>
      )}

      {/* Scale-out trims booked on this runner. */}
      {trims.length > 0 && (
        <ScaleTimeline
          trims={trims}
          original={p.original_contracts}
          remaining={p.contracts}
        />
      )}

      <div className="mt-2 flex items-center gap-2 text-xs">
        {scaled ? (
          <Chip
            tone="green"
            className="shrink-0"
            title="Stop trailed to breakeven after first scale-out"
          >
            <Anchor size={10} /> stop BE
          </Chip>
        ) : (
          <span className="text-text-muted shrink-0 num">stop {stopPct}%</span>
        )}
        <div className="flex-1">
          <StopProgressBar pnl={pnl} stopPct={effStop} />
        </div>
        <span className="text-text-muted num shrink-0">
          ${(p.current_premium ?? p.premium_at_entry).toFixed(2)} /{" "}
          ${p.premium_at_entry.toFixed(2)}
        </span>
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex min-h-11 items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent-blue md:min-h-0"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Network size={10} />
        {open ? "hide graph context" : "show graph context"}
      </button>
      {open && <GraphContextPanel ticker={p.ticker} />}
    </div>
  );
}

const WINDOW_TABS: { id: CategoryWindow; label: string; sub: string }[] = [
  { id: "today", label: "Today", sub: "1d vs prior 7d" },
  { id: "7d",    label: "7d",    sub: "vs prior 30d" },
  { id: "30d",   label: "30d",   sub: "vs prior 60d" },
];

function CategoryTrendPanel() {
  const [window, setWindow] = useState<CategoryWindow>("today");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, isError, refetch } = useCategories(window);
  const trend = data?.trend ?? [];
  const visible = showAll ? trend : trend.slice(0, 8);
  const maxRatio = Math.max(...trend.map((t) => t.hotness_ratio), 1);

  return (
    <GlassPanel
      title={
        <span className="inline-flex items-center gap-1">
          <Flame size={11} className="text-accent-orange" />
          Hot Categories
        </span>
      }
      actions={
        <Segmented<CategoryWindow>
          options={WINDOW_TABS.map((w) => ({ value: w.id, label: w.label }))}
          value={window}
          onChange={(w) => {
            setWindow(w);
            setExpanded(null);
          }}
        />
      }
    >
      <div className="text-xs text-text-muted mb-2">
        {data
          ? `${trend.length} categories with activity · ${
              WINDOW_TABS.find((w) => w.id === window)?.sub
            }`
          : ""}
      </div>
      {isLoading && !data && (
        <div className="text-text-muted text-xs flex items-center gap-1 py-2">
          <Loader2 size={12} className="animate-spin" />
          loading...
        </div>
      )}
      {isError && !data && (
        <QueryErrorState label="Unable to load category activity." onRetry={() => void refetch()} />
      )}
      {!isLoading && !isError && trend.length === 0 && (
        <div className="text-text-muted text-xs italic py-2">
          No category activity for this window.
        </div>
      )}
      <div className="space-y-1.5">
        {visible.map((t) => {
          const isExpanded = expanded === t.category;
          const heat =
            t.hotness_ratio >= 1.5
              ? "var(--accent-red)"
              : t.hotness_ratio >= 1.0
              ? "var(--accent-orange)"
              : "var(--text-muted)";
          const barPct = Math.min(100, (t.hotness_ratio / maxRatio) * 100);
          return (
            <div
              key={t.category}
              className="rounded-md text-xs"
              style={{
                background: "color-mix(in srgb, var(--bg-card) 50%, transparent)",
                border: `1px solid ${tint(heat, 30)}`,
              }}
            >
              <button
                onClick={() =>
                  setExpanded(isExpanded ? null : t.category)
                }
                className="flex min-h-11 w-full flex-col items-stretch justify-between gap-1 px-3 py-2 text-left sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown size={11} />
                  ) : (
                    <ChevronRight size={11} />
                  )}
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: heat }}
                    aria-hidden="true"
                  />
                  <span className="font-mono font-bold text-text-primary">
                    {t.category}
                  </span>
                  <span className="text-text-muted">
                    {t.ticker_count} tickers
                  </span>
                </div>
                <div className="flex w-full shrink-0 items-center justify-between gap-3 pl-5 sm:w-auto sm:justify-start sm:pl-0">
                  <div className="hidden sm:block w-20 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barPct}%`, background: heat }}
                    />
                  </div>
                  <span
                    className="num font-bold"
                    style={{ color: heat }}
                  >
                    {t.hotness_ratio.toFixed(2)}x
                  </span>
                  <span className="num text-right text-text-secondary sm:w-24">
                    ${(t.premium_window / 1e6).toFixed(1)}M
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-2 pt-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-text-muted">top tickers:</span>
                    {t.top_tickers.map((tt) => (
                      <Chip key={tt.ticker} tone="blue" className="num">
                        {tt.ticker}{" "}
                        <span className="text-text-muted">
                          ${(tt.premium / 1e6).toFixed(1)}M
                        </span>
                      </Chip>
                    ))}
                  </div>
                  {t.themes.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-text-muted">themes:</span>
                      {t.themes.map((th) => (
                        <Chip key={th.theme} tone="cyan" className="num">
                          {th.theme}{" "}
                          <span className="text-text-muted">
                            ${(th.premium / 1e6).toFixed(1)}M
                          </span>
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {trend.length > 8 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 text-xs text-accent-blue hover:underline"
        >
          {showAll ? "show less" : `show all ${trend.length}`}
        </button>
      )}
      {/* Honest footer about the historical gap */}
      <div
        className="mt-3 pt-2 text-xs text-text-muted border-t border-border italic"
      >
        Year-over-year cyclical view not yet available — iFlow corpus begins
        2026-03-16 (~2.5 months). Full 12-month "last year this time"
        comparison unlocks ~March 2027.
        {data?.note && <div className="mt-1">{data.note}</div>}
      </div>
    </GlassPanel>
  );
}

function ClosedRow({ p, trims = [] }: { p: Position; trims?: Position[] }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const pnl = p.realized_pnl_pct ?? 0;
  const pnlDollars = p.realized_pnl_dollars ?? 0;
  const bankedTrims = trims.reduce((s, t) => s + (t.realized_pnl_dollars ?? 0), 0);
  const tradeDollars = pnlDollars + bankedTrims; // runner + its scale-out trims
  const color = changeColor(pnl);
  const isEquity = p.instrument === "equity";
  // Exit reason tones — red for stop-out, neutral for expiration,
  // green for win-trigger / breakeven-after-scale, blue for trail / other.
  const reason = p.exit_reason || "";
  const reasonTone: ChipTone = (() => {
    if (reason.startsWith("stop_")) return "red";
    if (reason === "expiration") return "neutral";
    if (reason.startsWith("tp_") || reason === "manual_win") return "green";
    if (reason === "breakeven_after_scale") return "green";
    return "blue";
  })();
  const trailPeak = reason.match(/_off_(\d+)pct_peak/);
  const reasonLabel =
    reason === "breakeven_after_scale"
      ? "runner @ breakeven"
      : trailPeak
      ? `trailed off +${trailPeak[1]}% peak`
      : reason;
  // Hold days = exit - entry
  let holdDays: number | null = null;
  try {
    if (p.entry_date && p.exit_date) {
      const e = new Date(p.entry_date).getTime();
      const x = new Date(p.exit_date).getTime();
      holdDays = Math.max(0, Math.round((x - e) / 86_400_000));
    }
  } catch { /* ignore */ }
  return (
    <div
      className="px-3 py-2 rounded-md text-xs space-y-1"
      style={{
        background: "color-mix(in srgb, var(--border) 10%, transparent)",
        border: `1px solid ${tint(color, 28)}`,
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            onClick={() => setActiveTicker(p.ticker)}
            className="font-mono font-bold text-text-primary hover:text-accent-blue transition-colors"
            title={`Open ${p.ticker} in the detail panel`}
          >
            {p.ticker}
          </button>
          {!isEquity ? (
            <span className="num text-text-primary">
              ${p.strike} {p.option_type}
            </span>
          ) : (
            <span className="font-mono text-text-muted">equity</span>
          )}
          <span className="text-text-muted num">
            x{p.contracts} {isEquity ? "sh" : "ct"}
          </span>
          <Chip
            tone={reasonTone}
            className="uppercase tracking-wider"
            title={`Exit reason: ${p.exit_reason}`}
          >
            {reasonLabel}
          </Chip>
          {trims.length > 0 && (
            <Chip
              tone="purple"
              className="num"
              title={`Scaled out ${trims.length}x before the runner closed`}
            >
              <Scissors size={10} /> {trims.length}x
            </Chip>
          )}
          {p.theme && <Chip tone="cyan">{p.theme}</Chip>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="num font-bold" style={{ color }}>
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(1)}%
          </span>
          <span className="num text-text-muted">
            {pnlDollars >= 0 ? "+" : ""}${pnlDollars.toFixed(0)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-text-muted text-xs num">
        <span>
          entry {p.entry_date} @ ${p.premium_at_entry.toFixed(2)}
        </span>
        <span>→</span>
        <span>
          exit {p.exit_date} @ ${(p.exit_premium ?? 0).toFixed(2)}
        </span>
        {holdDays != null && (
          <span className="text-text-muted">· held {holdDays}d</span>
        )}
        {p.ml_score != null && (
          <span className="text-text-muted">· ML {p.ml_score}</span>
        )}
      </div>
      <WhyPick reason={p.reason} compact />
      {trims.length > 0 && (
        <>
          <ScaleTimeline trims={trims} original={p.original_contracts} />
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-text-muted uppercase tracking-wider">
              Trade total (trims + runner)
            </span>
            <span
              className="num font-bold"
              style={{ color: changeColor(tradeDollars) }}
            >
              {tradeDollars >= 0 ? "+" : ""}${tradeDollars.toFixed(0)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function RejectionBlock({
  ruleKey,
  entries,
}: {
  ruleKey: string;
  entries: RejectedEntry[];
}) {
  const [open, setOpen] = useState(false);
  const meta = RULE_LABELS[ruleKey] ?? {
    id: 0,
    label: ruleKey,
    why: "",
  };
  return (
    <div
      className="rounded-md text-xs"
      style={{ background: "color-mix(in srgb, var(--accent-red) 4%, transparent)", border: "1px solid var(--border)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <XCircle size={12} className="text-accent-red" />
          <span className="min-w-0 font-semibold text-text-primary max-md:line-clamp-2">{meta.label}</span>
          <span className="shrink-0 text-text-muted max-md:hidden">
            blocked {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <Chip tone="red" className="num md:hidden">{entries.length}</Chip>
      </button>
      {open && (
        <div className="px-3 pb-2 space-y-1">
          {meta.why && (
            <div className="text-text-muted italic mb-2">{meta.why}</div>
          )}
          {entries.slice(0, 30).map((e, i) => (
            <div
              key={i}
              className="num flex min-w-0 flex-col items-start gap-1 rounded px-2 py-2 text-xs md:flex-row md:items-center md:justify-between md:py-1"
              style={{ background: "color-mix(in srgb, var(--bg-card) 40%, transparent)" }}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-bold text-text-primary">{e.ticker}</span>
                {e.strike != null && (
                  <span className="text-text-primary">
                    ${e.strike} {e.option_type}
                  </span>
                )}
                {e.dte != null && (
                  <span className="text-text-muted">{e.dte}d</span>
                )}
                {e.ml_score != null && (
                  <span className="text-text-muted">ml={e.ml_score}</span>
                )}
              </div>
              <span className="break-words text-text-muted md:ml-2 md:min-w-0 md:flex-1 md:truncate">{e.reason}</span>
            </div>
          ))}
          {entries.length > 30 && (
            <div className="text-text-muted text-center pt-1">
              {entries.length - 30} more not shown
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EquityCurve({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return null;
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 600;
  const H = 80;
  const points = history
    .map((h, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - ((h.value - min) / span) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = history[history.length - 1];
  const color =
    last.return_pct >= 0 ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <GlassPanel
      title={`Equity Curve (${history.length}d)`}
      actions={
        <span className="text-xs text-text-muted num">
          {history[0].date} → {last.date}
        </span>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          points={points}
        />
      </svg>
    </GlassPanel>
  );
}

function TradeDecisionHistory({
  closed,
  trimsByParent,
  expanded,
  onToggle,
}: {
  closed: Position[];
  trimsByParent: Map<number, Position[]>;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Logical trades only — scale-out trim children are nested under their parent
  // runner (or, if the runner is still open, shown on the open card above), so
  // a position that scaled out 3x reads as one trade here, not four rows.
  const logical = closed.filter((p) => !isTrim(p));
  const tradeRealized = (p: Position) =>
    (p.realized_pnl_dollars ?? 0) +
    (trimsByParent.get(p.id) ?? []).reduce((s, t) => s + (t.realized_pnl_dollars ?? 0), 0);

  // Today's exits highlighted up top. Everything else falls under "earlier".
  const today = new Date().toISOString().slice(0, 10);
  const todayExits = logical.filter((p) => p.exit_date === today);
  const earlier = logical.filter((p) => p.exit_date !== today);

  // Aggregates — total realized counts EVERY closed row (incl. trims); win-rate
  // judges each logical trade by its combined runner + trims outcome.
  const totalRealized = closed.reduce(
    (s, p) => s + (p.realized_pnl_dollars ?? 0),
    0,
  );
  const wins = logical.filter((p) => tradeRealized(p) > 0).length;
  const winRate = logical.length > 0 ? (wins / logical.length) * 100 : 0;
  const stopped = logical.filter(
    (p) => (p.exit_reason || "").startsWith("stop_"),
  ).length;
  const expired = logical.filter((p) => p.exit_reason === "expiration").length;
  const realizedColor = changeColor(totalRealized);

  return (
    <section className="card">
      <button
        onClick={onToggle}
        className="flex min-h-11 w-full flex-col items-stretch justify-between gap-2 text-xs font-semibold uppercase tracking-[0.08em] transition-colors hover:text-text-primary md:flex-row md:items-center"
      >
        <div className="flex min-w-0 items-center gap-2 text-left">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="text-text-secondary">
            Trade Decision History ({logical.length})
          </span>
          {todayExits.length > 0 && (
            <Chip tone="orange" className="num normal-case tracking-normal">
              {todayExits.length} closed today
            </Chip>
          )}
        </div>
        <div className="num flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-left text-xs normal-case tracking-normal md:justify-end md:pl-0">
          {logical.length > 0 ? (
            <>
              <span className="text-text-muted">
                {wins}W / {logical.length - wins}L · {winRate.toFixed(0)}% win
              </span>
              {stopped > 0 && (
                <span className="text-accent-red">stopped {stopped}</span>
              )}
              {expired > 0 && (
                <span className="text-text-muted">expired {expired}</span>
              )}
              <span style={{ color: realizedColor }}>
                {totalRealized >= 0 ? "+" : ""}
                {formatCurrency(totalRealized)}
              </span>
            </>
          ) : (
            <span className="text-text-muted">no exits yet</span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 mt-3">
          {logical.length === 0 && (
            <div
              className="text-xs text-text-muted text-center py-4 rounded-md"
              style={{ background: "color-mix(in srgb, var(--bg-card) 50%, transparent)" }}
            >
              No closed trades yet — positions exit when they hit the persona's
              stop (-40% / -60% / -20%) or expire. The cron MTM runs at 06:30 /
              10:30 / 13:30 PT each market day.
            </div>
          )}
          {todayExits.length > 0 && (
            <div className="space-y-1">
              <div
                className="text-xs font-mono pl-1 flex items-center gap-2 pb-1"
                style={{ color: "var(--accent-orange)" }}
              >
                <span className="uppercase tracking-wider font-semibold">
                  Today
                </span>
                <span className="text-text-muted normal-case tracking-normal">
                  · {todayExits.length}{" "}
                  {todayExits.length === 1 ? "exit" : "exits"}
                </span>
              </div>
              {todayExits.map((p) => (
                <ClosedRow key={p.id} p={p} trims={trimsByParent.get(p.id) || []} />
              ))}
            </div>
          )}
          {earlier.length > 0 && (
            <div className="space-y-1">
              {todayExits.length > 0 && (
                <div className="text-xs font-mono text-text-muted pl-1 pb-1 uppercase tracking-wider">
                  Earlier
                </div>
              )}
              {earlier.map((p) => (
                <ClosedRow key={p.id} p={p} trims={trimsByParent.get(p.id) || []} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

type PosSortKey = "entry_date" | "pnl" | "pnl_dollars" | "value" | "peak" | "ticker" | "entry_px";
type AddedWindow = "all" | "7d" | "30d";

function PositionSortHeader({
  column,
  activeSort,
  ascending,
  onSort,
  children,
  right = true,
}: {
  column?: PosSortKey;
  activeSort: PosSortKey;
  ascending: boolean;
  onSort: (key: PosSortKey) => void;
  children: ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap px-2 py-1.5 font-semibold text-text-muted ${right ? "text-right" : "text-left"} ${column ? "cursor-pointer select-none hover:text-text-primary" : ""}`}
      onClick={column ? () => onSort(column) : undefined}
      title={column ? "Sort" : undefined}
    >
      {children}
      {column && activeSort === column && (
        <span className="ml-0.5">{ascending ? "▲" : "▼"}</span>
      )}
    </th>
  );
}

/** Dense sortable table of open positions — the "when did I add what, at
 *  what price" view the grouped cards bury. One row per position, sortable
 *  by added-date / entry price / P/L / value, quick added-window filter. */
function PositionsTable({
  positions,
  stopPct,
  trimsByParent,
}: {
  positions: Position[];
  stopPct: number;
  trimsByParent: Map<number, Position[]>;
}) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const [sortKey, setSortKey] = useState<PosSortKey>("entry_date");
  const [asc, setAsc] = useState(false);
  const [added, setAdded] = useState<AddedWindow>("all");

  const cutoff = useMemo(() => {
    if (added === "all") return "";
    const d = new Date();
    d.setDate(d.getDate() - (added === "7d" ? 7 : 30));
    return d.toISOString().slice(0, 10);
  }, [added]);

  const rows = useMemo(() => {
    const list = positions.filter((p) => !cutoff || p.entry_date >= cutoff);
    const val = (p: Position): number | string => {
      switch (sortKey) {
        case "entry_date": return p.entry_date;
        case "ticker":     return p.ticker;
        case "entry_px":   return p.premium_at_entry;
        case "pnl":        return p.pnl_pct ?? -Infinity;
        case "pnl_dollars":return p.pnl_dollars ?? -Infinity;
        case "value":      return p.current_value ?? p.cost_basis;
        case "peak":       return p.peak_pnl_pct ?? -Infinity;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      const cmp = typeof va === "string"
        ? String(va).localeCompare(String(vb))
        : (va as number) - (vb as number);
      return asc ? cmp : -cmp;
    });
  }, [positions, cutoff, sortKey, asc]);

  const toggle = (k: PosSortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else { setSortKey(k); setAsc(k === "ticker" || k === "entry_date" ? false : false); }
  };

  return (
    <div>
      <div className="mb-2 flex min-h-11 items-center gap-1.5 text-xs md:min-h-0">
        <span className="text-text-muted">Added:</span>
        {(["all", "7d", "30d"] as AddedWindow[]).map((w) => (
          <button key={w} type="button" onClick={() => setAdded(w)} className="inline-flex min-h-11 items-center rounded-full md:min-h-0">
            <Chip tone={added === w ? "blue" : "neutral"}>{w === "all" ? "All" : `last ${w}`}</Chip>
          </button>
        ))}
        <span className="ml-auto text-text-muted num">{rows.length} of {positions.length}</span>
      </div>
      <Segmented<PosSortKey>
        className="mobile-horizontal-strip mb-2 w-full md:hidden"
        ariaLabel="Sort open positions"
        value={sortKey}
        onChange={toggle}
        options={[
          { value: "entry_date", label: "Added" },
          { value: "ticker", label: "Ticker" },
          { value: "entry_px", label: "Entry" },
          { value: "pnl", label: "P/L %" },
          { value: "pnl_dollars", label: "P/L $" },
          { value: "value", label: "Value" },
          { value: "peak", label: "Peak" },
        ]}
      />
      <div className="space-y-1.5 md:hidden">
        {rows.map((p) => {
          const isEquity = p.instrument === "equity";
          const scaled = (p.scale_stage ?? 0) >= 1;
          const held = daysHeld(p.entry_date);
          const pnl = p.pnl_pct ?? 0;
          const trimmed = (trimsByParent.get(p.id)?.length ?? 0) > 0;
          return (
            <details key={p.id} className="group rounded-[var(--radius-control)] border border-border">
              <summary className="flex min-h-11 list-none items-center gap-2 px-3 py-2 marker:content-none">
                <ChevronRight
                  size={13}
                  className="shrink-0 text-text-muted transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                <span className="w-12 shrink-0 font-mono text-xs font-bold text-text-primary">
                  {p.ticker}
                </span>
                <span className="num min-w-0 flex-1 truncate text-xs text-text-secondary">
                  {isEquity ? "shares" : `$${p.strike} ${p.option_type} ${p.expiry ?? ""}`}
                </span>
                <span className="num shrink-0 text-sm font-bold" style={{ color: changeColor(pnl) }}>
                  {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
                </span>
              </summary>
              <div className="space-y-3 px-3 pb-3 pl-10">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Stat label="Added" value={p.entry_date} sub={held != null ? `${held}d held` : undefined} />
                  <Stat label="Quantity" value={p.contracts} sub={isEquity ? "shares" : "contracts"} />
                  <Stat label="Entry" value={`$${p.premium_at_entry.toFixed(2)}`} />
                  <Stat label="Now" value={p.current_premium != null ? `$${p.current_premium.toFixed(2)}` : "—"} />
                  <Stat label="Cost" value={formatCurrency(p.cost_basis)} />
                  <Stat label="Value" value={formatCurrency(p.current_value ?? p.cost_basis)} />
                  <Stat label="P/L" value={`${(p.pnl_dollars ?? 0) >= 0 ? "+" : ""}$${(p.pnl_dollars ?? 0).toFixed(0)}`} tone={(p.pnl_dollars ?? 0) >= 0 ? "green" : "red"} />
                  <Stat label="Peak" value={p.peak_pnl_pct != null ? `+${p.peak_pnl_pct.toFixed(0)}%` : "—"} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={scaled ? "green" : "neutral"} className="num">
                    floor {scaled ? "BE" : `${stopPct}%`}
                  </Chip>
                  {trimmed && <Chip tone="green">booked trims</Chip>}
                  {p.ml_score != null && <Chip tone="blue" className="num">ML {p.ml_score}</Chip>}
                  {p.n_score != null && <Chip tone="neutral" className="num">N {p.n_score}</Chip>}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTicker(p.ticker)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-control)] border border-border text-xs font-semibold text-accent-blue transition-colors hover:bg-bg-card-hover"
                >
                  Open {p.ticker} analysis
                </button>
              </div>
            </details>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-xs num border-collapse">
          <thead>
            <tr className="border-b border-border">
              <PositionSortHeader column="ticker" activeSort={sortKey} ascending={asc} onSort={toggle} right={false}>Ticker</PositionSortHeader>
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle} right={false}>Contract</PositionSortHeader>
              <PositionSortHeader column="entry_date" activeSort={sortKey} ascending={asc} onSort={toggle} right={false}>Added</PositionSortHeader>
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle}>Days</PositionSortHeader>
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle}>Qty</PositionSortHeader>
              <PositionSortHeader column="entry_px" activeSort={sortKey} ascending={asc} onSort={toggle}>Entry</PositionSortHeader>
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle}>Now</PositionSortHeader>
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle}>Cost</PositionSortHeader>
              <PositionSortHeader column="value" activeSort={sortKey} ascending={asc} onSort={toggle}>Value</PositionSortHeader>
              <PositionSortHeader column="pnl" activeSort={sortKey} ascending={asc} onSort={toggle}>P/L%</PositionSortHeader>
              <PositionSortHeader column="pnl_dollars" activeSort={sortKey} ascending={asc} onSort={toggle}>P/L$</PositionSortHeader>
              <PositionSortHeader column="peak" activeSort={sortKey} ascending={asc} onSort={toggle}>Peak</PositionSortHeader>
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle}>Floor</PositionSortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const isEquity = p.instrument === "equity";
              const scaled = (p.scale_stage ?? 0) >= 1;
              const held = daysHeld(p.entry_date);
              const pnl = p.pnl_pct ?? 0;
              const trimmed = (trimsByParent.get(p.id)?.length ?? 0) > 0;
              return (
                <tr key={p.id} className="border-b border-border/50 hover:bg-bg-card-hover">
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => setActiveTicker(p.ticker)}
                      className="font-mono font-bold text-text-primary hover:text-accent-blue"
                    >
                      {p.ticker}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      {isEquity ? "shares" : `$${p.strike} ${p.option_type} ${p.expiry ?? ""}`}
                      {!isEquity && (
                        <GexWall ticker={p.ticker} strike={Number(p.strike) || null} width={40} />
                      )}
                      {trimmed && <span className="text-accent-green" title="has booked trims">✂</span>}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-text-secondary">{p.entry_date}</td>
                  <td className="px-2 py-1.5 text-right text-text-muted">{held ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">{p.contracts}</td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">${p.premium_at_entry.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">
                    {p.current_premium != null ? `$${p.current_premium.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-text-secondary">{formatCurrency(p.cost_basis)}</td>
                  <td className="px-2 py-1.5 text-right text-text-primary">{formatCurrency(p.current_value ?? p.cost_basis)}</td>
                  <td className="px-2 py-1.5 text-right font-bold" style={{ color: changeColor(pnl) }}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
                  </td>
                  <td className="px-2 py-1.5 text-right" style={{ color: changeColor(p.pnl_dollars ?? 0) }}>
                    {(p.pnl_dollars ?? 0) >= 0 ? "+" : ""}${(p.pnl_dollars ?? 0).toFixed(0)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-text-muted">
                    {p.peak_pnl_pct != null ? `+${p.peak_pnl_pct.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {scaled
                      ? <span className="text-accent-green">BE</span>
                      : <span className="text-text-muted">{stopPct}%</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpenPositionsGrouped({
  positions,
  stopPct,
  trimsByParent,
}: {
  positions: Position[];
  stopPct: number;
  trimsByParent: Map<number, Position[]>;
}) {
  // Group by category, then by theme. Stable iteration order via insertion.
  const grouped = new Map<string, Map<string, Position[]>>();
  for (const p of positions) {
    const cat = p.category || "Uncategorized";
    const theme = p.theme || "—";
    if (!grouped.has(cat)) grouped.set(cat, new Map());
    const themeMap = grouped.get(cat)!;
    if (!themeMap.has(theme)) themeMap.set(theme, []);
    themeMap.get(theme)!.push(p);
  }

  // Categories with more positions first; deterministic for same-count.
  const cats = Array.from(grouped.entries()).sort((a, b) => {
    const aN = Array.from(a[1].values()).reduce((s, ps) => s + ps.length, 0);
    const bN = Array.from(b[1].values()).reduce((s, ps) => s + ps.length, 0);
    if (bN !== aN) return bN - aN;
    return a[0].localeCompare(b[0]);
  });

  // Default-collapsed for any category with > 5 positions to keep the
  // top of the tab scannable. User can toggle each individually.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const [cat, themeMap] of cats) {
      const n = Array.from(themeMap.values()).reduce(
        (s, ps) => s + ps.length,
        0,
      );
      if (n > 5) init[cat] = true;
    }
    return init;
  });

  return (
    <GlassPanel
      title={
        <span className="inline-flex items-center gap-1 text-accent-blue">
          <CheckCircle2 size={11} />
          Open Positions ({positions.length}) — grouped by category
        </span>
      }
    >
      <div className="space-y-3">
      {cats.map(([cat, themeMap]) => {
        const allInCat = Array.from(themeMap.values()).flat();
        const catCount = allInCat.length;
        const catCost = allInCat.reduce((s, p) => s + p.cost_basis, 0);
        const catValue = allInCat.reduce(
          (s, p) => s + (p.current_value ?? p.cost_basis),
          0,
        );
        const catPnl = catValue - catCost;
        const catPnlPct = catCost > 0 ? (catPnl / catCost) * 100 : 0;
        const pnlColor = changeColor(catPnlPct);
        const isCollapsed = collapsed[cat];
        return (
          <div key={cat} className="space-y-2">
            <button
              onClick={() =>
                setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))
              }
              className="flex min-h-11 w-full flex-col items-stretch justify-between gap-1 rounded-[var(--radius-control)] px-2 py-1.5 text-xs font-semibold transition-colors hover:bg-bg-card-hover md:flex-row md:items-center"
            >
              <div className="flex min-w-0 items-center gap-2 text-left">
                {isCollapsed ? (
                  <ChevronRight size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                <span className="min-w-0 break-words text-accent-cyan uppercase tracking-wider">
                  {cat}
                </span>
                <span className="text-text-muted normal-case max-md:hidden">
                  · {catCount} {catCount === 1 ? "position" : "positions"} ·{" "}
                  {themeMap.size} {themeMap.size === 1 ? "theme" : "themes"}
                </span>
              </div>
              <div className="num flex w-full items-center justify-between gap-3 pl-5 text-xs md:w-auto md:justify-start md:pl-0">
                <span className="text-text-muted md:hidden">
                  {catCount} {catCount === 1 ? "position" : "positions"} · {themeMap.size} {themeMap.size === 1 ? "theme" : "themes"}
                </span>
                <span className="text-text-muted">
                  {formatCurrency(catValue)}
                </span>
                <span style={{ color: pnlColor }}>
                  {catPnlPct >= 0 ? "+" : ""}
                  {catPnlPct.toFixed(2)}%
                </span>
              </div>
            </button>
            {!isCollapsed && (
              <div className="space-y-3">
                {Array.from(themeMap.entries())
                  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
                  .map(([theme, posList]) => (
                    <div key={theme} className="space-y-1.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 pl-1 font-mono text-xs text-text-muted">
                        <span className="min-w-0 break-words text-accent-cyan/70">{theme}</span>
                        <span>· {posList.length}</span>
                        <span className="min-w-0 break-words text-text-muted/60">
                          {posList.map((p) => p.ticker).join(" · ")}
                        </span>
                      </div>
                      <div className="space-y-2 md:pl-2 md:border-l md:border-border/40">
                        {posList.map((p) => (
                          <PositionCard
                            key={p.id}
                            p={p}
                            stopPct={stopPct}
                            trims={trimsByParent.get(p.id) || []}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </GlassPanel>
  );
}

const PERSONA_META: Record<
  PersonaName,
  { label: string; tagline: string; stopPct: number }
> = {
  smart: {
    label: "Smart",
    tagline: "Rule-compliant options. DTE 8-30, 5% size, -40% stop, multi-signal rank, 70% deployment.",
    stopPct: -40,
  },
  aggressive: {
    label: "Aggressive",
    tagline: "Volume book. DTE 1-45 (lottos allowed), 8% size, -60% stop, no regime gate.",
    stopPct: -60,
  },
  builder: {
    label: "Builder",
    tagline: "Monthlies DTE 25-70, with the market regime, ranked by SETUP + ML + bounded evidence, scale-in tranches, trims, breakeven floor, runners.",
    stopPct: -50,
  },
  ruby: {
    label: "Ruby",
    tagline: "Intraday options (ruby-trader v7). Smart's gates but enters TODAY's flow on a 15-min cycle, Sonnet judgment veto, E1 ladder + BE floor, -7% daily loss cap.",
    stopPct: -40,
  },
  gemfinder: {
    label: "Gem Finder",
    tagline: "Equity-only from knowledge graph. BULLISH bias + 2 bullish competitors + hot theme.",
    stopPct: -20,
  },
  supercycle: {
    label: "Supercycle",
    tagline: "Leading edge of the AI build-out. Small-cap, upstream enabler/bottleneck, quiet, in accelerating themes. Inverse of Gem Finder.",
    stopPct: -25,
  },
  conviction: {
    label: "Conviction",
    tagline: "Hand-curated 30-name AI supply-chain chokepoint book. Conviction-tiered $20K (ANCHOR/CORE/SATELLITE/LOTTERY). Not algorithmic; no auto-stop, long hold.",
    stopPct: -100,
  },
};

export function SmartTrader() {
  const queryClient = useQueryClient();
  const [persona, setPersona] = useState<PersonaName>("smart");
  const [showClosed, setShowClosed] = useState(false);
  // Open-positions layout: grouped cards (rich) vs dense sortable table
  // ("when was it added, at what price" — 2026-08-07 user ask).
  const [posView, setPosView] = useState<"table" | "grouped">("table");
  const summaryQuery = useSummary(persona);
  const todayQuery = useToday(persona);
  const historyQuery = useHistory(persona);
  const personaQuery = usePersonaList();
  const { data: summary, isLoading } = summaryQuery;
  const { data: today } = todayQuery;
  const { data: history } = historyQuery;
  const { data: personaList } = personaQuery;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["smart-trader-summary"] });
    queryClient.invalidateQueries({ queryKey: ["smart-trader-today"] });
    queryClient.invalidateQueries({ queryKey: ["smart-trader-history"] });
    queryClient.invalidateQueries({ queryKey: ["smart-trader-categories"] });
    queryClient.invalidateQueries({ queryKey: ["smart-trader-personas"] });
  };

  // Note: there is intentionally no manual "Run Picks" trigger — the daily
  // cron is the single source of new positions. A manual re-pick would stack
  // duplicate positions on top of the existing book, and is a no-op for the
  // curated Conviction persona.
  const markMutation = useMutation({
    mutationFn: () =>
      apiClient.post(
        `/smart-trader/mark?persona=${persona}`,
        {},
        { timeout: 60_000 },
      ),
    onSuccess: invalidate,
  });
  const resetMutation = useMutation({
    mutationFn: (capital: number) =>
      apiClient.post(
        `/smart-trader/reset?persona=${persona}&capital=${capital}`,
      ),
    onSuccess: invalidate,
  });
  const [resetCapital, setResetCapital] = useState("20000");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-muted text-sm gap-2">
        <Loader2 size={16} className="animate-spin" />
        Loading smart trader...
      </div>
    );
  }

  if (summaryQuery.isError || !summary) {
    return (
      <div className="card flex items-center justify-center py-10">
        <QueryErrorState label="Unable to load smart trader." onRetry={() => void summaryQuery.refetch()} />
      </div>
    );
  }

  const ret = summary.return_pct;
  const retColor = changeColor(ret);

  // Group scale-out trim children by their parent runner id so open positions
  // can render their banked-gains timeline, and so the closed history can nest
  // resolved trims under the trade they came from instead of as loose rows.
  const trimsByParent = new Map<number, Position[]>();
  for (const c of summary.closed) {
    if (c.parent_id != null && (c.exit_reason || "").startsWith("scale")) {
      const arr = trimsByParent.get(c.parent_id) ?? [];
      arr.push(c);
      trimsByParent.set(c.parent_id, arr);
    }
  }

  const rejected = today?.rejected_by_rule ?? {};
  const rejectedRules = Object.entries(rejected).sort(
    (a, b) => b[1].length - a[1].length,
  );

  const personas: PersonaName[] = ["smart", "aggressive", "builder", "ruby", "gemfinder", "supercycle", "conviction"];
  const personaRows = personaList?.personas ?? [];
  return (
    <div className="max-w-full space-y-4 overflow-x-clip pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Persona selector — five paper books at the same starting capital */}
      <div className="mobile-workspace-controls glass-strong sticky z-20 space-y-1.5 p-2 md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-text-muted shrink-0">
            <Users size={11} />
            Persona
          </div>
          <Segmented<PersonaName>
            className="mobile-horizontal-strip w-full flex-nowrap md:w-auto md:flex-wrap"
            options={personas.map((p) => {
              const row = personaRows.find((r) => r.name === p);
              const pRet = row?.return_pct ?? 0;
              return {
                value: p,
                label: PERSONA_META[p].label,
                badge: row ? (
                  <span className="num" style={{ color: changeColor(pRet) }}>
                    {pRet >= 0 ? "+" : ""}
                    {pRet.toFixed(2)}%
                  </span>
                ) : undefined,
              };
            })}
            value={persona}
            onChange={setPersona}
          />
        </div>
        {/* Active book at a glance — tagline + size, replaces the old per-button sublines */}
        <div className="line-clamp-2 text-xs leading-relaxed text-text-muted md:line-clamp-none">
          {PERSONA_META[persona].tagline}
          {(() => {
            const row = personaRows.find((r) => r.name === persona);
            return row ? (
              <span className="num">
                {" "}
                · {row.open_positions} open · ${(row.total_value / 1000).toFixed(1)}K
                {row.ml_serving_mode === "gate_and_rank"
                  ? ` · ML gate ${row.ml_threshold ?? "?"}+ active`
                  : row.ml_serving_mode === "rank_only"
                    ? " · ML research rank only; no ML rejection"
                    : ""}
              </span>
            ) : null;
          })()}
        </div>
        {personaQuery.isError && !personaList && (
          <QueryErrorState label="Unable to load persona summaries." onRetry={() => void personaQuery.refetch()} />
        )}
      </div>

      {/* Action buttons — no manual "Run Picks": the cron is the only source
          of new positions (a manual re-pick would stack duplicates). */}
      <div className="flex min-w-0 flex-wrap gap-2">
        <button
          onClick={() => markMutation.mutate()}
          disabled={markMutation.isPending}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-card-hover disabled:opacity-40 sm:flex-none"
        >
          {markMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Mark to Market
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
          <span className="text-text-muted text-sm">$</span>
          <input
            type="number"
            inputMode="numeric"
            min={1000}
            step={1000}
            value={resetCapital}
            onChange={(e) => setResetCapital(e.target.value)}
            aria-label="Reset starting capital"
            className="num min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 py-2 text-sm text-text-primary focus:border-accent-blue/50 focus:outline-none sm:w-24 sm:flex-none"
          />
          <button
            onClick={() => {
              const amt = Math.round(Number(resetCapital));
              if (!Number.isFinite(amt) || amt < 1000) {
                alert("Enter a starting balance of at least $1,000.");
                return;
              }
              if (
                confirm(
                  `Reset ${PERSONA_META[persona].label} book to $${amt.toLocaleString()}? All picks and history will be erased.`,
                )
              )
                resetMutation.mutate(amt);
            }}
            disabled={resetMutation.isPending}
            className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-accent-red/40 hover:text-accent-red disabled:opacity-40"
          >
            {resetMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RotateCcw size={12} />
            )}
            Reset
          </button>
        </div>
      </div>

      {/* Portfolio Summary */}
      <GlassPanel title="TraderJoe Portfolio">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="num text-2xl font-extrabold text-text-primary">
            {formatCurrency(summary.total_value)}
          </div>
          <div className="text-right">
            <div className="text-xs text-text-muted">
              Return vs ${(summary.starting_capital / 1000).toFixed(0)}K
            </div>
            <div
              className="num text-lg font-extrabold"
              style={{ color: retColor }}
            >
              {ret >= 0 ? "+" : ""}
              {ret.toFixed(2)}%
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 min-[400px]:grid-cols-3 md:grid-cols-6">
          <Stat label="Cash" value={formatCurrency(summary.cash)} />
          <Stat label="Positions" value={formatCurrency(summary.positions_value)} />
          <Stat
            label="Realized"
            tone={summary.realized_pnl >= 0 ? "green" : "red"}
            value={`${summary.realized_pnl >= 0 ? "+" : ""}${formatCurrency(summary.realized_pnl)}`}
            sub={
              (summary.banked_from_trims ?? 0) > 0 ? (
                <span
                  className="num inline-flex items-center gap-1"
                  style={{ color: "var(--accent-purple)" }}
                  title="Realized gains banked from AbTrader-style scale-out trims"
                >
                  <Scissors size={9} /> +{formatCurrency(summary.banked_from_trims ?? 0)} trims
                </span>
              ) : undefined
            }
          />
          <Stat
            label="Unrealized"
            tone={summary.unrealized_pnl >= 0 ? "green" : "red"}
            value={`${summary.unrealized_pnl >= 0 ? "+" : ""}${formatCurrency(summary.unrealized_pnl)}`}
          />
          <Stat label="Open" value={summary.open_positions} />
          <Stat
            label="Win Rate"
            value={
              summary.closed_positions > 0
                ? `${summary.win_rate.toFixed(0)}%`
                : "—"
            }
          />
        </div>
      </GlassPanel>

      {/* Why this works — explainer adapts to active persona */}
      <div
        className="card text-xs text-text-secondary leading-relaxed"
        style={{ borderColor: "color-mix(in srgb, var(--accent-blue) 30%, var(--glass-border))" }}
      >
        {summary.persona_description}
      </div>

      {/* Equity Curve */}
      {historyQuery.isError && !history && (
        <div className="card">
          <QueryErrorState label="Unable to load equity history." onRetry={() => void historyQuery.refetch()} />
        </div>
      )}
      {history && history.length >= 2 && <EquityCurve history={history} />}

      {/* Hot categories — Today / 7d / 30d windows, self-fetches */}
      <CategoryTrendPanel />

      {/* Open Positions — dense table (default) or grouped cards */}
      {summary.positions.length > 0 && (
        posView === "table" ? (
          <GlassPanel
            title={
              <span className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-accent-blue">
                  <CheckCircle2 size={11} />
                  Open Positions ({summary.positions.length})
                </span>
                <Segmented
                  className="mobile-horizontal-strip max-w-full"
                  options={[{ value: "table", label: "Table" }, { value: "grouped", label: "Cards" }]}
                  value={posView}
                  onChange={(v) => setPosView(v as "table" | "grouped")}
                />
              </span>
            }
          >
            <PositionsTable
              positions={summary.positions}
              stopPct={PERSONA_META[persona].stopPct}
              trimsByParent={trimsByParent}
            />
          </GlassPanel>
        ) : (
          <div>
            <div className="mb-1 flex justify-end">
              <Segmented
                className="mobile-horizontal-strip max-w-full"
                options={[{ value: "table", label: "Table" }, { value: "grouped", label: "Cards" }]}
                value={posView}
                onChange={(v) => setPosView(v as "table" | "grouped")}
              />
            </div>
            <OpenPositionsGrouped
              positions={summary.positions}
              stopPct={PERSONA_META[persona].stopPct}
              trimsByParent={trimsByParent}
            />
          </div>
        )
      )}

      {/* Ruby — the intraday desk log (judge reads, entries, vetoes, freezes) */}
      {persona === "ruby" && <RubyDeskLog />}

      {/* iFlow-Trader-style WL-A / WL-B for every persona (options books) */}
      <WatchlistPanel key={persona} persona={persona} />

      {/* Today — what got rejected, grouped by rule */}
      {todayQuery.isError && !today && (
        <div className="card">
          <QueryErrorState label="Unable to load today's decisions." onRetry={() => void todayQuery.refetch()} />
        </div>
      )}
      {today && (
        <GlassPanel
          title={
            <span className="inline-flex items-center gap-1">
              <Shield size={11} />
              Today ({today.date}) — picks {today.picked.length} · rejections{" "}
              {today.rejected_count}
            </span>
          }
        >
          {today.picked.length === 0 && today.rejected_count === 0 ? (
            <div className="text-sm text-text-muted text-center py-4">
              No candidates yet today. Picks fire at 06:30 PT — or click Run
              Picks above.
            </div>
          ) : (
            <div className="space-y-2">
              {rejectedRules.length > 0 ? (
                rejectedRules.map(([rk, entries]) => (
                  <RejectionBlock key={rk} ruleKey={rk} entries={entries} />
                ))
              ) : (
                <div className="text-sm text-text-muted text-center py-2">
                  No rejected entries logged for {today.date}.
                </div>
              )}
            </div>
          )}
        </GlassPanel>
      )}

      {/* Trade Decision History — always visible, even when empty */}
      <TradeDecisionHistory
        closed={summary.closed}
        trimsByParent={trimsByParent}
        expanded={showClosed}
        onToggle={() => setShowClosed((v) => !v)}
      />

      {/* Empty state — only when nothing has ever been picked */}
      {summary.positions.length === 0 && summary.closed.length === 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          Book is empty. The daily cron opens positions automatically at
          06:30 PT — check back after the next run.
        </div>
      )}
    </div>
  );
}
