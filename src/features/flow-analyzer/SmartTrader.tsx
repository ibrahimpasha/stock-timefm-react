import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Flame,
  Network,
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
import { expiryDte, optionType } from "../../lib/optionContract";
import { marketDate } from "../../lib/liveFeeds";
import { daysFromToday, parseLocalDate, todayLocalDate, toLocalDateOnly } from "../../lib/dateOnly";
import { activityWindow, markedExposure, signedPercent } from "../../lib/markFreshness";
import { observationAge, observationGain, observationHasEvaluation, sortObservations } from "../../lib/watchlist";
import type { WatchlistSort } from "../../lib/watchlist";
import { MarkFreshness } from "../../components/MarkFreshness";
import { QueryNotice } from "../../components/QueryNotice";
import { useAppStore } from "../../store/useAppStore";
import { GlassPanel, Chip, Stat, Segmented } from "../../components/Glass";
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
  last_marked_at?: string | null;
  mark_status?: string | null;
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

// Price observations and recorded eligibility are separate lifecycle states.
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
  decision_state?: "watching" | "triggered" | "eligible" | "ready" | "blocked" | "entered" | "invalidated" | "needs_review";
  block_reason?: string | null;
  last_evaluated_at?: string | null;
  triggered_at?: string | null;
  added_at?: string | null;
  source_date?: string | null;
  last_marked_at?: string | null;
  decision_receipt?: DecisionReceipt | null;
  archived_at?: string | null;
  current_premium?: number | null;
  mark_quality?: string | null;
  provenance_status?: string | null;
  days_on_list?: number;
}

interface WatchlistActivity {
  timezone?: string;
  daily: { date: string; added: number; scans: number }[];
  last_scan_at: string | null;
  last_added_date: string | null;
  last_added_at: string | null;
  last_evaluated_at: string | null;
  last_marked_at: string | null;
  latest_source_date: string | null;
  last_reset_at: string | null;
  last_maintenance_at?: string | null;
  maintenance?: { reviewed: number; retained: number; archived: { id: number; reason: string }[] };
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
    refetchInterval: 60_000,
    enabled,
  });
}

function watchlistTime(value?: string | null): string {
  if (!value) return "Not recorded";
  if (value.length === 10) return value;
  const parsed = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : parsed.toLocaleString();
}

function WatchlistPanel({ persona }: { persona: PersonaName }) {
  const watchlistQuery = usePersonaWatchlist(persona, true);
  const { data, isPending, isError, isFetching, refetch } = watchlistQuery;
  const queryClient = useQueryClient();
  const [mobileSection, setMobileSection] = useState<"wla" | "wlb" | "history" | null>(null);
  const [pages, setPages] = useState({ wla: 0, wlb: 0 });
  const [pageSize, setPageSize] = useState(12);
  const [sort, setSort] = useState<WatchlistSort>("newest");
  const [addedFilter, setAddedFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState("evaluated");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const reset = useMutation({
    mutationFn: (target: PersonaName) => apiClient.post(
      `/smart-trader/watchlist/reset?persona=${target}`, { confirm_persona: target },
    ),
    onSuccess: (_response, target) => queryClient.invalidateQueries({
      queryKey: ["smart-trader-watchlist", target],
    }),
  });
  const activity = data?.activity;
  const activityTimezone = activity?.timezone ?? "America/New_York";
  const zoneLabel = activityTimezone === "America/New_York" ? "ET" : activityTimezone === "America/Los_Angeles" ? "PT" : activityTimezone;
  const activityDates = activityWindow(activity?.daily ?? [], new Date(), activityTimezone);
  const activeCount = (data?.wla.length ?? 0) + (data?.wlb.length ?? 0);
  const unverifiedCount = [...(data?.wla ?? []), ...(data?.wlb ?? [])].filter(row => !observationHasEvaluation(row)).length;
  const filterAndSort = (rows: WatchlistRow[]) => rows.filter((r) => {
    const evaluated = observationHasEvaluation(r);
    if (evidenceFilter === "evaluated" && !evaluated || evidenceFilter === "unverified" && evaluated) return false;
    if (addedFilter === "all") return true;
    const added = r.added;
    return addedFilter === "today" ? added === activityDates.today : added >= activityDates.cutoff && added <= activityDates.today;
  });
  const wla = sortObservations(filterAndSort(data?.wla ?? []), sort);
  const wlb = sortObservations(filterAndSort(data?.wlb ?? []), sort);
  const visibleSection = mobileSection ?? (wla.length || !wlb.length ? "wla" : "wlb");
  const windowFor = (section: "wla" | "wlb", rows: WatchlistRow[]) => {
    const page = Math.min(pages[section], Math.max(0, Math.ceil(rows.length / pageSize) - 1));
    return { page, rows: rows.slice(page * pageSize, (page + 1) * pageSize) };
  };
  const pager = (section: "wla" | "wlb", rows: WatchlistRow[]) => {
    if (!rows.length) return null;
    const { page } = windowFor(section, rows);
    const name = section === "wla" ? "screened" : "monitoring";
    return <div className="flex min-h-11 items-center justify-between gap-2 border-t border-border pt-1 text-xs text-text-muted">
      <span className="num">{page * pageSize + 1}-{Math.min((page + 1) * pageSize, rows.length)} of {rows.length}</span>
      <div className="flex items-center gap-1">
        <button type="button" title={`Previous ${name} page`} aria-label={`Previous ${name} page`} disabled={page === 0}
          onClick={() => setPages(previous => ({ ...previous, [section]: page - 1 }))}
          className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-border disabled:opacity-40"><ChevronLeft size={16} /></button>
        <button type="button" title={`Next ${name} page`} aria-label={`Next ${name} page`} disabled={(page + 1) * pageSize >= rows.length}
          onClick={() => setPages(previous => ({ ...previous, [section]: page + 1 }))}
          className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-border disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>
    </div>;
  };
  const contract = (r: WatchlistRow) => {
    const type = optionType(r.option_type);
    const dte = expiryDte(r.expiry, activityDates.today);
    return `$${r.strike ?? "?"}${type === "CALL" ? "C" : type === "PUT" ? "P" : "?"} ${r.expiry} · ${dte == null ? "DTE unknown" : `${dte}d`}`;
  };
  const info = (r: WatchlistRow) => {
    const gain = observationGain(r);
    const age = observationAge(r.added, activityDates.today);
    const evaluatedAt = observationHasEvaluation(r) ? r.last_evaluated_at : null;
    const state = !evaluatedAt
      ? "needs review" : (r.decision_state ?? "blocked").replaceAll("_", " ");
    const note = `${r.block_reason || r.note || "No decision note recorded."}${!evaluatedAt ? " Eligibility unverified." : ""}`;
    const peak = gain != null && r.peak_pnl_pct != null && r.peak_pnl_pct >= 30 ? r.peak_pnl_pct : null;
    return { gain, age, evaluatedAt, state, note, peak };
  };
  const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;
  const stateText = (r: WatchlistRow, state: string) => (
    <span className={r.decision_state === "eligible" ? "text-accent-green" : "text-text-secondary"}>
      {state}{r.triggered_at ? " · price trigger" : ""}
    </span>
  );
  const mobileRow = (r: WatchlistRow, key: string) => {
    const { gain, age, evaluatedAt, state, note, peak } = info(r);
    return (
      <details key={key} className="group">
        <summary className="flex min-h-11 list-none items-center gap-2 py-2 text-xs marker:content-none">
          <ChevronRight size={13} className="shrink-0 text-text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
          <span className="w-12 shrink-0 text-sm ticker">{r.ticker}</span>
          <span className="num min-w-0 flex-1 truncate text-text-muted">{contract(r)}</span>
          {gain != null && (
            <span className="num shrink-0 font-semibold" style={{ color: changeColor(gain) }}>{signedPct(gain)}</span>
          )}
        </summary>
        <div className="space-y-2 pb-3 pl-5 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
            {stateText(r, state)}
            {r.ml_score != null && <span>ML <span className="num">{r.ml_score}</span></span>}
            {peak != null && <span className="num">peak +{peak.toFixed(0)}%</span>}
            <span>{age == null ? "Age unknown" : `${age}d on list`}</span>
            <span>{gain == null ? "No verified mark" : "Modeled gain"}</span>
          </div>
          <p className="break-words text-sm leading-relaxed text-text-secondary">{note}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-text-muted">
            <dt>Added</dt><dd>{watchlistTime(r.added_at ?? r.added)}</dd>
            <dt>Flow date</dt><dd>{r.source_date ?? "Not recorded"}</dd>
            <dt>Evaluated</dt><dd>{watchlistTime(evaluatedAt)}</dd>
            <dt>Mark</dt><dd><MarkFreshness at={r.last_marked_at} quality={r.mark_quality} /></dd>
          </dl>
        </div>
      </details>
    );
  };
  const desktopTable = (rows: WatchlistRow[], prefix: string) => (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-xs">
        <thead className="text-text-muted">
          <tr className="border-b border-border">
            <th className="py-2 pl-2 pr-3 font-medium">Ticker</th>
            <th className="py-2 pr-3 font-medium">Contract</th>
            <th className="py-2 pr-3 text-right font-medium" title="Modeled gain since added">P/L %</th>
            <th className="py-2 pr-3 text-right font-medium">Peak</th>
            <th className="py-2 pr-3 font-medium">State</th>
            <th className="py-2 pr-3 text-right font-medium">ML</th>
            <th className="py-2 pr-3 text-right font-medium">On list</th>
            <th className="py-2 pr-3 font-medium">Added</th>
            <th className="py-2 pr-3 font-medium">Flow</th>
            <th className="py-2 pr-3 font-medium">Evaluated</th>
            <th className="py-2 pr-3 font-medium">Mark</th>
            <th className="py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => {
            const { gain, age, evaluatedAt, state, note, peak } = info(r);
            return (
              <tr key={r.id ?? `${prefix}${i}`} className="data-row">
                <td className="py-2.5 pl-2 pr-3 text-sm ticker">{r.ticker}</td>
                <td className="whitespace-nowrap py-2 pr-3 num text-text-secondary">{contract(r)}</td>
                <td className="py-2.5 pr-3 text-right text-sm num font-semibold" style={gain != null ? { color: changeColor(gain) } : undefined}>
                  {gain != null ? signedPct(gain) : <span className="text-text-muted">—</span>}
                </td>
                <td className="py-2 pr-3 text-right num text-text-muted">{peak != null ? `+${peak.toFixed(0)}%` : "—"}</td>
                <td className="whitespace-nowrap py-2 pr-3">{stateText(r, state)}</td>
                <td className="py-2 pr-3 text-right num text-text-secondary">{r.ml_score ?? "—"}</td>
                <td className="py-2 pr-3 text-right num text-text-muted">{age == null ? "—" : `${age}d`}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-text-secondary">{watchlistTime(r.added_at ?? r.added)}</td>
                <td className="whitespace-nowrap py-2 pr-3 num text-text-muted">{r.source_date ?? "—"}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-text-muted">{watchlistTime(evaluatedAt)}</td>
                <td className="whitespace-nowrap py-2 pr-3"><MarkFreshness at={r.last_marked_at} quality={r.mark_quality} /></td>
                <td className="max-w-[32ch] truncate py-2 text-text-muted" title={note}>{note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  const section = (key: "wla" | "wlb", title: string, rows: WatchlistRow[], empty: string) => {
    const windowRows = windowFor(key, rows).rows;
    return (
      <div className={`${visibleSection === key ? "block" : "hidden"} md:block`}>
        <h3 className="mb-2 text-base font-semibold text-text-primary">
          {title} <span className="num text-sm font-normal text-text-muted">{rows.length}</span>
        </h3>
        <div className="divide-y divide-border md:hidden">
          {windowRows.map((r, i) => mobileRow(r, String(r.id ?? `${key}${i}`)))}
        </div>
        {rows.length > 0 && desktopTable(windowRows, key)}
        {!rows.length && <div className="py-3 text-sm text-text-muted">{empty}</div>}
        {pager(key, rows)}
      </div>
    );
  };
  return (
    <section className="space-y-4">
      <SectionHead
        title={<>Watchlist <span className="num text-base text-text-muted">{activeCount}</span></>}
        sub="Contracts this book is screening or monitoring, with modeled P/L since added."
        actions={<>
          <button type="button" title="Reload watchlist" aria-label="Reload watchlist" disabled={isFetching}
            onClick={() => void refetch()} className="flex size-11 items-center justify-center text-text-muted hover:text-text-primary disabled:opacity-50 md:size-8">
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
          <button type="button" disabled={!activeCount || reset.isPending || isError} onClick={() => {
            if (window.confirm(`Reset the ${persona} watchlist?\n\nArchive ${activeCount} active observations. Positions, cash and history stay unchanged. These contracts can return when a newer flow date is observed. No scan or trade is started.`)) reset.mutate(persona);
          }} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 md:min-h-8">
            <RotateCcw size={14} />{reset.isPending ? "Resetting..." : "Reset watchlist"}
          </button>
        </>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 items-center gap-2 text-xs text-text-muted">
          Sort
          <select aria-label="Sort watchlist" value={sort} onChange={(e) => { setSort(e.target.value as WatchlistSort); setPages({ wla: 0, wlb: 0 }); }}
            className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary">
            <option value="newest">Newest added</option><option value="oldest">Oldest added</option>
            <option value="checked">Recently evaluated</option><option value="source">Latest flow date</option>
            <option value="ticker">Ticker A-Z</option><option value="pnl">Modeled gain</option>
          </select>
        </label>
        <select aria-label="Watchlist evidence status" value={evidenceFilter}
          onChange={event => { setEvidenceFilter(event.target.value); setPages({ wla: 0, wlb: 0 }); }}
          className="min-h-11 min-w-0 max-w-full rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary">
          <option value="evaluated">Recorded evaluations</option>
          <option value="unverified">Needs review ({unverifiedCount})</option>
          <option value="all">All observations ({activeCount})</option>
        </select>
        <select aria-label="Watchlist additions period" value={addedFilter} onChange={(e) => { setAddedFilter(e.target.value); setPages({ wla: 0, wlb: 0 }); }}
          className="min-h-11 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary">
          <option value="all">All additions</option><option value="today">Added today ({zoneLabel})</option><option value="week">Added last 7 days ({zoneLabel})</option>
        </select>
        <label className="flex min-h-11 items-center gap-2 text-xs text-text-muted">Rows
          <select aria-label="Watchlist rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPages({ wla: 0, wlb: 0 }); }}
            className="min-h-11 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary">
            <option value={12}>12</option><option value={24}>24</option><option value={48}>48</option>
          </select>
        </label>
      </div>
      {reset.isError && <p role="alert" className="callout" style={{ "--callout": "var(--accent-red)" } as React.CSSProperties}>Reset failed. Reload the list before trying again.</p>}
      {reset.isSuccess && reset.data.data.persona === persona && <p role="status" className="text-xs text-text-secondary">{reset.data.data.archived_count} observations archived at {watchlistTime(reset.data.data.reset_at)}. Positions and cash unchanged.</p>}
      <QueryNotice queries={[watchlistQuery]} label="Watchlist" />
      {isPending && watchlistQuery.fetchStatus !== "paused" && <p role="status" className="py-3 text-xs text-text-muted">Loading watchlist...</p>}
      {activity && <div className="space-y-3 text-xs">
        <div className="md:hidden">
          <button type="button" aria-label="Toggle watchlist activity" title="Watchlist activity"
            aria-expanded={activityExpanded} aria-controls={`watchlist-activity-${persona}`}
            onClick={() => setActivityExpanded(previous => !previous)}
            className="flex min-h-11 w-full items-center justify-between gap-2 text-text-secondary">
            <span>Added today ({zoneLabel}): <span className="num text-text-primary">{activityDates.todayAdded}</span></span>
            <ChevronDown size={14} className={activityExpanded ? "rotate-180" : ""} />
          </button>
          <p className="text-text-muted">Last scan: {watchlistTime(activity.last_scan_at)}</p>
          <p className="mt-1 text-text-muted">Latest observed flow: {activity.latest_source_date ?? "Not recorded"}</p>
        </div>
        <div id={`watchlist-activity-${persona}`} className={`${activityExpanded ? "block" : "hidden"} space-y-3 md:block`}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-text-muted lg:grid-cols-4">
          <div>Added today ({zoneLabel})<div className="num mt-1 text-lg font-semibold text-text-primary">{activityDates.todayAdded}</div></div>
          <div>Added in 7 days<div className="num mt-1 text-lg font-semibold text-text-primary">{activityDates.weekAdded}</div></div>
          <div>Last addition<div className="mt-1 text-sm text-text-primary">{watchlistTime(activity.last_added_at ?? activity.last_added_date)}</div></div>
          <div>Last recorded scan<div className="mt-1 text-sm text-text-primary">{watchlistTime(activity.last_scan_at)}</div></div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-text-muted">
          <span>Latest observed flow: {activity.latest_source_date ?? "Not recorded"}</span>
          <span>Last mark cycle: {watchlistTime(activity.last_marked_at)}</span>
          <span>Last cleanup: {watchlistTime(activity.last_maintenance_at)}</span>
        </div>
        {!activity.last_scan_at && <p role="status" className="callout">No scan receipt available. Eligibility is unverified.</p>}
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-text-secondary"><Clock size={14} />Daily activity (14 days, {zoneLabel})</summary>
          <table className="w-full text-left text-xs">
            <thead className="text-text-muted"><tr><th className="py-2 font-medium">Date</th><th className="font-medium">Added</th><th className="font-medium">Recorded scans</th></tr></thead>
            <tbody>{[...activity.daily].reverse().map((day) => <tr key={day.date} className="border-t border-border">
              <td className="py-2 num">{day.date}</td><td className="num text-accent-blue">+{day.added}</td><td className="num">{day.scans}</td>
            </tr>)}</tbody>
          </table>
        </details>
        </div>
      </div>}
      {data && !activeCount && <p className="py-3 text-sm text-text-muted">No active observations for {persona}.</p>}
      {unverifiedCount > 0 && <p className="callout">Unverified legacy observations: <span className="num">{unverifiedCount}</span>. Pick "Needs review" to see them.</p>}
      <Segmented<"wla" | "wlb" | "history">
        className="mobile-horizontal-strip w-full md:hidden"
        ariaLabel="Choose watchlist section"
        value={visibleSection}
        onChange={setMobileSection}
        options={[
          { value: "wla", label: "Screened", badge: <span className="num">{wla.length}</span> },
          { value: "wlb", label: "Monitoring", badge: <span className="num">{wlb.length}</span> },
          { value: "history", label: "Moves", badge: <span className="num">{(data?.history ?? []).length}</span> },
        ]}
      />
      <div className="card space-y-8">
        {section("wla", "Screened", wla, "No screened observations in this period.")}
        {section("wlb", "Monitoring / blocked", wlb, "No monitored observations in this period.")}
        <div className={`${visibleSection === "history" ? "block" : "hidden"} ${(data?.history ?? []).length > 0 ? "md:block" : "md:hidden"}`}>
          <h3 className="mb-2 text-base font-semibold text-text-primary">Recent moves</h3>
          <div className="divide-y divide-border">
            {(data?.history ?? []).slice(0, 8).map((r, i) => (
              <div key={`h${i}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs text-text-muted md:min-h-0">
                <span className={r.status === "entered" ? "text-accent-green" : "text-text-secondary"}>{r.status}</span>
                <span className="num font-semibold text-text-primary">{r.ticker}</span>
                <span className="num">{contract(r)}</span>
                {r.pnl_pct != null && (
                  <span className="num" style={{ color: changeColor(r.pnl_pct) }}>{signedPct(r.pnl_pct)}</span>
                )}
                <span>{r.drop_reason ?? ""}</span>
              </div>
            ))}
          </div>
          {(data?.history ?? []).length === 0 && (
            <div className="py-3 text-sm text-text-muted">No recent watchlist moves.</div>
          )}
        </div>
      </div>
    </section>
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
      <section className="space-y-2">
        <SectionHead title="Desk log" sub="Ruby's intraday judge, one entry per eventful 15-min cycle" />
        <p className="text-sm text-text-muted">
          No cycles logged yet — the log fills as the 15-min intraday loop
          enters, vetoes, trims, or freezes. Quiet cycles are not recorded.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <SectionHead title="Desk log" sub="Ruby's intraday judge, one entry per eventful 15-min cycle" />
      <div className="divide-y divide-border">
        {events.map((e, i) => (
          <div key={`${e.ts}-${i}`} className="space-y-2 py-4 first:pt-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
              <span className="num">
                {new Date(e.ts + (e.ts.endsWith("Z") ? "" : "Z")).toLocaleString([], {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {e.regime && <span className="text-text-secondary">{e.regime}</span>}
              {e.frozen && <Chip tone="red">Frozen: daily loss cap</Chip>}
              {(e.opened ?? []).map((o, j) => (
                <span key={`o${j}`} className="text-text-secondary">
                  Enter <span className="num text-text-primary">{o.ticker} ${o.strike}{o.option_type === "CALL" ? "C" : "P"} x{o.contracts}</span>
                </span>
              ))}
              {(e.vetoes ?? []).map((v, j) => (
                <span key={`v${j}`}>Veto <span className="num text-text-secondary">{v.ticker}</span></span>
              ))}
              {(e.trims ?? []).map((t, j) => (
                <span key={`t${j}`}>Trim <span className="num text-text-secondary">{t.ticker ?? ""}</span></span>
              ))}
              {(e.exits ?? []).map((x, j) => (
                <span key={`x${j}`} className="text-text-secondary">
                  Exit <span className="num">{x.ticker}</span>{" "}
                  <span className="num" style={{ color: changeColor(x.pnl_pct ?? 0) }}>
                    {x.pnl_pct >= 0 ? "+" : ""}{x.pnl_pct?.toFixed(0)}%
                  </span>
                </span>
              ))}
              <span>
                <span className="num">{e.candidates ?? 0}</span> flow, <span className="num">{e.passed ?? 0}</span> passed gate
              </span>
            </div>
            {e.read && <p className="prose-read max-w-[72ch] text-text-secondary">{e.read}</p>}
            {(e.vetoes ?? []).length > 0 && (
              <div className="space-y-0.5 text-xs text-text-muted">
                {(e.vetoes ?? []).map((v, j) => (
                  <div key={j}>
                    Veto <span className="num">{v.ticker} ${v.strike}{v.type === "CALL" ? "C" : "P"}</span>: {v.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
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

  const label = (t: string) => <span className="mr-1 font-medium text-text-muted">{t}</span>;
  return (
    <div className="space-y-2 border-t border-border pt-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
        {data.sector && <span>{data.sector}</span>}
        {data.theme && <span>{data.theme}</span>}
        {data.community?.label && <span>{data.community.label}</span>}
        {data.intel_as_of && <span className="ml-auto text-text-muted">graph <span className="num">{data.intel_as_of}</span></span>}
      </div>

      {role && (
        <p className="leading-relaxed text-text-secondary">
          <span className="inline-flex items-center gap-1.5 font-semibold text-text-primary">
            <span className="h-2 w-2 rounded-full" style={{ background: roleColor(role) }} aria-hidden="true" />
            {role}
          </span>{" "}
          <span className="text-text-muted">in the AI build-out.</span>{" "}
          {roleReason}
        </p>
      )}

      {keyFacts.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 font-medium text-text-muted">
            <Calendar size={12} /> Catalysts and key facts
          </div>
          <ul className="list-disc space-y-1 pl-4 leading-relaxed text-text-secondary">
            {keyFacts.slice(0, 5).map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {data.sentiment && <p className="leading-relaxed text-text-secondary">{label("Sentiment")}{data.sentiment}</p>}
      {data.outlook && <p className="leading-relaxed text-text-secondary">{label("Outlook")}{data.outlook}</p>}
      {competitors && <p className="leading-relaxed text-text-secondary">{label("Competes with")}{competitors}</p>}

      {peers.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 font-medium text-text-muted">
            <Layers size={12} /> Theme peers
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {peers.map((p, i) => (
              <button
                key={`${p.ticker}-${i}`}
                onClick={() => setActiveTicker(p.ticker)}
                className="num text-text-secondary hover:text-accent-blue"
                title={p.role ? `${p.ticker}: ${p.role}` : p.ticker}
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
  // Date-only strings parse as LOCAL dates (UTC parse is +1 day in PT).
  const held = exit
    ? Math.round((parseLocalDate(exit).getTime() - parseLocalDate(entry).getTime()) / 86_400_000)
    : -daysFromToday(entry);
  return Number.isNaN(held) ? null : Math.max(0, held);
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
  return (
    <div className="mt-2 space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
        <span className="inline-flex items-center gap-1 font-medium text-text-secondary">
          <Scissors size={12} /> Scaled out <span className="num">{trims.length}x</span>
        </span>
        {trims
          .slice()
          .sort((a, b) => (a.scale_stage ?? 0) - (b.scale_stage ?? 0))
          .map((t) => (
            <span
              key={t.id}
              className="num"
              title={`Sold ${t.contracts} ct at ${rungLabel(t.exit_reason)} on ${t.exit_date}, banked $${(
                t.realized_pnl_dollars ?? 0
              ).toFixed(0)}`}
            >
              {rungLabel(t.exit_reason)} x{t.contracts}
            </span>
          ))}
        {remaining != null && original != null && remaining > 0 && (
          <span
            className="inline-flex items-center gap-1 num"
            title="Runner still open, rides with the stop trailed to breakeven (house money)"
          >
            <Anchor size={12} /> runner {remaining}/{original}
          </span>
        )}
        <span className="ml-auto num font-semibold" style={{ color: "var(--accent-green)" }}>
          banked +${banked.toFixed(0)}
        </span>
      </div>
      {remaining != null && remaining > 0 && (
        <div className="text-text-muted">
          <span className="num">{soldCt}</span> of <span className="num">{original}</span> ct booked; breakeven exit threshold armed, execution may differ
        </div>
      )}
    </div>
  );
}

/** "Why this pick" — the entry rationale the persona acted on, rendered as a
 *  lead sentence + the scoring/convergence clauses as chips. */
function WhyPick({ reason, compact = false }: { reason: string | null; compact?: boolean }) {
  if (!reason) return null;
  const [lead, ...rest] = reason.split(" · ");
  if (compact) {
    return (
      <p className="flex items-start gap-1 pt-0.5 text-xs leading-relaxed text-text-muted">
        <Lightbulb size={12} className="mt-0.5 shrink-0" />
        <span>{reason}</span>
      </p>
    );
  }
  return (
    <div className="prose-read mt-2 max-w-[72ch] text-text-secondary">
      <span className="font-medium text-text-primary">Why this pick: </span>
      {lead}
      {rest.length > 0 && (
        <div className="mt-0.5 font-sans text-xs text-text-muted">{rest.join(" · ")}</div>
      )}
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
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
      {rank?.validated === false && <span>Experimental policy</span>}
      {quote && (
        <span>
          {quote.data_delay_seconds ? <><span className="num">{quote.data_delay_seconds / 60}m</span> delayed quote</> : "Indicative quote"}
          {", simulated ask fill"}
        </span>
      )}
      {quality && (
        <span className={quality.approved ? "text-accent-green" : undefined}>
          {quality.approved ? `Evidence checked: ${quality.families.join(", ")}` : "Evidence blocked"}
        </span>
      )}
      {rank && (
        <span className="text-text-secondary">
          Decision rank <strong className="num text-text-primary">{rank.total.toFixed(1)}</strong>
          <span className="num">
            {` = ${rank.base_name} ${rank.base_score.toFixed(1)}`}
            {` ${(rank.model_adjustment ?? 0) >= 0 ? "+" : ""}${(rank.model_adjustment ?? 0).toFixed(1)} model`}
            {` ${rank.category_adjustment >= 0 ? "+" : ""}${rank.category_adjustment.toFixed(1)} category`}
            {` ${rank.pulse_adjustment >= 0 ? "+" : ""}${rank.pulse_adjustment.toFixed(1)} pulse`}
          </span>
        </span>
      )}
      {rank?.components && rank.components.length > 0 && (
        <span className="num">
          {rank.components.map((c) => `${c.name.toLowerCase()} ${Math.round(c.weight * 100)}%`).join(" · ")}
        </span>
      )}
      {mode && <span>ML {mode === "gate_and_rank" ? "gate + rank" : mode.replaceAll("_", " ")}</span>}
      {source?.date && (
        <span>
          source <span className="num">{source.date}</span>
          {source.fallback_used ? <>, fallback <span className="num">{source.age_days ?? "?"}d</span> old</> : ""}
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
  const pnlColor = changeColor(pnl);
  // For equity, "premium" is per-share price. Format accordingly.
  const unitLabel = isEquity ? "share" : "contract";
  const unitWord = p.contracts === 1 ? unitLabel : `${unitLabel}s`;
  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-3 max-md:flex-col max-md:items-stretch">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {!isEquity && <SideIcon side={p.side} />}
            <button
              onClick={() => setActiveTicker(p.ticker)}
              className="ticker text-base transition-colors hover:text-accent-blue"
              title={`Open ${p.ticker} in the detail panel`}
            >
              {p.ticker}
            </button>
            {isEquity ? (
              <span className="num text-sm text-text-primary">${p.premium_at_entry.toFixed(2)} entry</span>
            ) : (
              <>
                <span className="num text-sm text-text-primary">${p.strike} {p.option_type}</span>
                <span className="text-xs text-text-muted">
                  exp <span className="num">{p.expiry}</span> (<span className="num">{expiryDte(p.expiry, marketDate()) ?? "?"}d</span> now, <span className="num">{p.dte_at_entry ?? "?"}d</span> entry)
                </span>
              </>
            )}
            <span className="text-xs text-text-muted"><span className="num">x{p.contracts}</span> {unitWord}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
            {p.ml_score != null && <span>ML <span className="num text-text-secondary">{p.ml_score}</span></span>}
            {p.rank_score != null && <span>rank <span className="num text-text-secondary">{p.rank_score.toFixed(1)}</span></span>}
            {p.n_score != null && <span>N <span className="num text-text-secondary">{p.n_score}</span></span>}
            {p.graph_score != null && (
              <span title="graph composite score">G <span className="num text-text-secondary">{p.graph_score.toFixed(0)}</span></span>
            )}
            {p.structural_role && !p.structural_role.startsWith("kw") && (
              <span title="structural position in the AI build-out">{p.structural_role}</span>
            )}
            {p.theme_accel != null && p.theme_accel > 1 && (
              <span title="theme option-premium acceleration (window / baseline)">
                theme accel <span className="num text-text-secondary">{p.theme_accel.toFixed(1)}x</span>
              </span>
            )}
            {p.theme && <span title={p.category || ""}>{p.theme}</span>}
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-4 text-xs max-md:w-full md:flex md:items-start">
          <div className="max-md:text-left md:text-right">
            <div className="text-text-muted">Cost</div>
            <div className="num text-sm text-text-primary">{formatCurrency(p.cost_basis)}</div>
          </div>
          <div className="text-right">
            <div className="text-text-muted">Value</div>
            <div className="num text-sm text-text-primary">{formatCurrency(p.current_value ?? p.cost_basis)}</div>
          </div>
          <div className="text-right">
            <div className="text-text-muted">P/L</div>
            <div className="num text-lg font-semibold" style={{ color: pnlColor }}>{signedPercent(p.pnl_pct)}</div>
            <div className="num" style={{ color: p.pnl_dollars == null ? "var(--text-muted)" : pnlColor }}>
              {p.pnl_dollars == null ? "Unknown" : `${pnlDollars >= 0 ? "+" : ""}$${pnlDollars.toFixed(0)}`}
            </div>
          </div>
        </div>
      </div>
      {/* Why this pick — the entry rationale. */}
      <MarkFreshness at={p.last_marked_at} status={p.mark_status} />
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
          <span
            className="inline-flex shrink-0 items-center gap-1 text-accent-green"
            title="Stop trailed to breakeven after first scale-out"
          >
            <Anchor size={12} /> stop BE
          </span>
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
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Network size={12} />
        {open ? "Hide graph context" : "Show graph context"}
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
    <section className="space-y-3">
      <SectionHead
        title="Hot categories"
        sub={data
          ? `${trend.length} categories with option-flow activity · ${
              WINDOW_TABS.find((w) => w.id === window)?.sub
            }`
          : "Option-premium heat by category"}
        actions={
          <Segmented<CategoryWindow>
            ariaLabel="Category window"
            options={WINDOW_TABS.map((w) => ({ value: w.id, label: w.label }))}
            value={window}
            onChange={(w) => {
              setWindow(w);
              setExpanded(null);
            }}
          />
        }
      />
      <div className="card">
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
      <div className="divide-y divide-border">
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
            <div key={t.category} className="text-xs">
              <button
                onClick={() => setExpanded(isExpanded ? null : t.category)}
                className="flex min-h-11 w-full flex-col items-stretch justify-between gap-1 py-2 text-left hover:bg-bg-card-hover sm:flex-row sm:items-center md:min-h-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {isExpanded ? <ChevronDown size={12} className="text-text-muted" /> : <ChevronRight size={12} className="text-text-muted" />}
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: heat }} aria-hidden="true" />
                  <span className="text-sm font-medium text-text-primary">{t.category}</span>
                  <span className="text-text-muted"><span className="num">{t.ticker_count}</span> tickers</span>
                </div>
                <div className="flex w-full shrink-0 items-center justify-between gap-3 pl-5 sm:w-auto sm:justify-start sm:pl-0">
                  <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-border sm:block">
                    <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: heat }} />
                  </div>
                  <span className="num w-12 text-right font-semibold text-text-primary">{t.hotness_ratio.toFixed(2)}x</span>
                  <span className="num text-right text-text-secondary sm:w-16">${(t.premium_window / 1e6).toFixed(1)}M</span>
                </div>
              </button>
              {isExpanded && (
                <div className="space-y-1 pb-2 pl-5 leading-relaxed text-text-secondary">
                  <p>
                    <span className="text-text-muted">Top tickers: </span>
                    {t.top_tickers.map((tt, i) => (
                      <span key={tt.ticker}>
                        {i > 0 && ", "}
                        <span className="num text-text-primary">{tt.ticker}</span>{" "}
                        <span className="num text-text-muted">${(tt.premium / 1e6).toFixed(1)}M</span>
                      </span>
                    ))}
                  </p>
                  {t.themes.length > 0 && (
                    <p>
                      <span className="text-text-muted">Themes: </span>
                      {t.themes.map((th, i) => (
                        <span key={th.theme}>
                          {i > 0 && ", "}
                          {th.theme} <span className="num text-text-muted">${(th.premium / 1e6).toFixed(1)}M</span>
                        </span>
                      ))}
                    </p>
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
      <div className="mt-3 max-w-[72ch] border-t border-border pt-2 text-xs leading-relaxed text-text-muted">
        Year-over-year cyclical view not yet available — iFlow corpus begins
        2026-03-16 (~2.5 months). Full 12-month "last year this time"
        comparison unlocks ~March 2027.
        {data?.note && <div className="mt-1">{data.note}</div>}
      </div>
      </div>
    </section>
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
  const reasonColor = reason.startsWith("stop_")
    ? "var(--accent-red)"
    : reason.startsWith("tp_") || reason === "manual_win" || reason === "breakeven_after_scale"
    ? "var(--accent-green)"
    : "var(--text-secondary)";
  const trailPeak = reason.match(/_off_(\d+)pct_peak/);
  const reasonLabel =
    reason === "breakeven_after_scale"
      ? "runner @ breakeven"
      : trailPeak
      ? `trailed off +${trailPeak[1]}% peak`
      : reason;
  const holdDays = p.exit_date ? daysHeld(p.entry_date, p.exit_date) : null;
  return (
    <div className="space-y-1 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button
            onClick={() => setActiveTicker(p.ticker)}
            className="ticker text-sm transition-colors hover:text-accent-blue"
            title={`Open ${p.ticker} in the detail panel`}
          >
            {p.ticker}
          </button>
          {!isEquity ? (
            <span className="num text-text-primary">${p.strike} {p.option_type}</span>
          ) : (
            <span className="text-text-muted">equity</span>
          )}
          <span className="text-text-muted"><span className="num">x{p.contracts}</span> {isEquity ? "sh" : "ct"}</span>
          <span style={{ color: reasonColor }} title={`Exit reason: ${p.exit_reason}`}>{reasonLabel}</span>
          {trims.length > 0 && (
            <span className="inline-flex items-center gap-1 text-text-muted" title={`Scaled out ${trims.length}x before the runner closed`}>
              <Scissors size={12} /> <span className="num">{trims.length}x</span>
            </span>
          )}
          {p.theme && <span className="text-text-muted">{p.theme}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="num text-base font-semibold" style={{ color }}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(1)}%
          </span>
          <span className="num w-16 text-right" style={{ color }}>
            {pnlDollars >= 0 ? "+" : ""}${pnlDollars.toFixed(0)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-muted">
        <span>entry <span className="num">{p.entry_date}</span> @ <span className="num">${p.premium_at_entry.toFixed(2)}</span></span>
        <span>exit <span className="num">{p.exit_date}</span> @ <span className="num">${(p.exit_premium ?? 0).toFixed(2)}</span></span>
        {holdDays != null && <span>held <span className="num">{holdDays}d</span></span>}
        {p.ml_score != null && <span>ML <span className="num">{p.ml_score}</span></span>}
      </div>
      <WhyPick reason={p.reason} compact />
      {trims.length > 0 && (
        <>
          <ScaleTimeline trims={trims} original={p.original_contracts} />
          <div className="flex items-center justify-between pt-1">
            <span className="text-text-muted">Trade total (trims + runner)</span>
            <span className="num font-semibold" style={{ color: changeColor(tradeDollars) }}>
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
  const meta = RULE_LABELS[ruleKey] ?? {
    id: 0,
    label: ruleKey,
    why: "",
  };
  return (
    <details className="group text-xs">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 marker:content-none hover:bg-bg-card-hover md:min-h-0">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight size={12} className="shrink-0 text-text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
          <span className="min-w-0 text-sm font-medium text-text-primary max-md:line-clamp-2">{meta.label}</span>
        </span>
        <span className="shrink-0 text-text-muted">
          <span className="num text-text-primary">{entries.length}</span> {entries.length === 1 ? "entry" : "entries"}
        </span>
      </summary>
      <div className="pb-2 pl-5">
        {meta.why && <p className="mb-1 max-w-[72ch] text-sm leading-relaxed text-text-secondary">{meta.why}</p>}
        <div className="divide-y divide-border">
          {entries.slice(0, 30).map((e, i) => (
            <div key={i} className="flex min-w-0 flex-col items-start gap-1 py-2 md:flex-row md:items-center md:gap-3">
              <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 num md:w-56">
                <span className="font-semibold text-text-primary">{e.ticker}</span>
                {e.strike != null && <span className="text-text-secondary">${e.strike} {e.option_type}</span>}
                {e.dte != null && <span className="text-text-muted">{e.dte}d</span>}
                {e.ml_score != null && <span className="text-text-muted">ml {e.ml_score}</span>}
              </div>
              <span className="min-w-0 break-words text-text-muted md:flex-1 md:truncate" title={e.reason}>{e.reason}</span>
            </div>
          ))}
        </div>
        {entries.length > 30 && (
          <div className="pt-1 text-text-muted"><span className="num">{entries.length - 30}</span> more not shown</div>
        )}
      </div>
    </details>
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
    <figure className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label={`Equity curve over ${history.length} days`}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          points={points}
        />
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-text-muted">
        <span>Equity curve, <span className="num">{history.length}</span>d</span>
        <span className="num">{history[0].date} → {last.date}</span>
      </figcaption>
    </figure>
  );
}

/** v2 section heading: serif title, optional sub, actions to the right. */
function SectionHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
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
  const today = todayLocalDate();
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
    <section className="space-y-3">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-11 w-full flex-col items-stretch justify-between gap-2 text-left transition-colors md:min-h-0 md:flex-row md:items-end"
      >
        <div className="flex min-w-0 items-center gap-2">
          {expanded ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
          <h2 className="section-title">
            Closed trades <span className="num text-base text-text-muted">{logical.length}</span>
          </h2>
          {todayExits.length > 0 && (
            <span className="text-sm text-text-muted"><span className="num">{todayExits.length}</span> closed today</span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pl-6 text-sm md:justify-end md:pl-0">
          {logical.length > 0 ? (
            <>
              <span className="text-text-muted">
                <span className="num text-text-secondary">{wins}W / {logical.length - wins}L</span>, <span className="num text-text-secondary">{winRate.toFixed(0)}%</span> win
              </span>
              {stopped > 0 && <span className="text-text-muted">stopped <span className="num">{stopped}</span></span>}
              {expired > 0 && <span className="text-text-muted">expired <span className="num">{expired}</span></span>}
              <span className="num text-xl font-semibold" style={{ color: realizedColor }}>
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
        <div className="card space-y-5">
          {logical.length === 0 && (
            <p className="py-4 text-center text-sm text-text-muted">
              No closed trades yet. Positions exit when they hit the persona's
              stop (-40% / -60% / -20%) or expire. The cron MTM runs at 06:30 /
              10:30 / 13:30 PT each market day.
            </p>
          )}
          {todayExits.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-text-primary">
                Today <span className="num font-normal text-text-muted">{todayExits.length}</span>
              </h4>
              <div className="divide-y divide-border">
                {todayExits.map((p) => (
                  <ClosedRow key={p.id} p={p} trims={trimsByParent.get(p.id) || []} />
                ))}
              </div>
            </div>
          )}
          {earlier.length > 0 && (
            <div>
              {todayExits.length > 0 && (
                <h4 className="text-sm font-semibold text-text-primary">Earlier</h4>
              )}
              <div className="divide-y divide-border">
                {earlier.map((p) => (
                  <ClosedRow key={p.id} p={p} trims={trimsByParent.get(p.id) || []} />
                ))}
              </div>
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
      className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium text-text-muted ${right ? "text-right" : "text-left"} ${column ? "cursor-pointer select-none hover:text-text-primary" : ""}`}
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
    return toLocalDateOnly(d);
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
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-muted">Added</span>
        <Segmented<AddedWindow>
          ariaLabel="Filter by added date"
          options={[{ value: "all", label: "All" }, { value: "7d", label: "Last 7d" }, { value: "30d", label: "Last 30d" }]}
          value={added}
          onChange={setAdded}
        />
        <span className="ml-auto text-text-muted"><span className="num">{rows.length}</span> of <span className="num">{positions.length}</span></span>
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
      <div className="divide-y divide-border md:hidden">
        {rows.map((p) => {
          const isEquity = p.instrument === "equity";
          const scaled = (p.scale_stage ?? 0) >= 1;
          const held = daysHeld(p.entry_date);
          const pnl = p.pnl_pct ?? 0;
          const trimmed = (trimsByParent.get(p.id)?.length ?? 0) > 0;
          return (
            <details key={p.id} className="group">
              <summary className="flex min-h-11 list-none items-center gap-2 py-2 marker:content-none">
                <ChevronRight
                  size={13}
                  className="shrink-0 text-text-muted transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                <span className="w-14 shrink-0 text-sm ticker">
                  {p.ticker}
                </span>
                <span className="num min-w-0 flex-1 truncate text-xs text-text-secondary">
                  {isEquity ? "shares" : `$${p.strike} ${p.option_type} ${p.expiry ?? ""}`}
                </span>
                <span className="num shrink-0 text-sm font-semibold" style={{ color: changeColor(pnl) }}>
                  {signedPercent(p.pnl_pct)}
                </span>
              </summary>
              <div className="space-y-3 pb-3 pl-5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Stat label="Added" value={p.entry_date} sub={held != null ? `${held}d held` : undefined} />
                  <Stat label="Quantity" value={p.contracts} sub={isEquity ? "shares" : "contracts"} />
                  <Stat label="Entry" value={`$${p.premium_at_entry.toFixed(2)}`} />
                  <Stat label="Now" value={p.current_premium != null ? `$${p.current_premium.toFixed(2)}` : "—"} />
                  <Stat label="Cost" value={formatCurrency(p.cost_basis)} />
                  <Stat label="Value" value={p.current_value == null ? "Unknown" : formatCurrency(p.current_value)} />
                  <Stat label="P/L" value={p.pnl_dollars == null ? "Unknown" : `${p.pnl_dollars >= 0 ? "+" : ""}$${p.pnl_dollars.toFixed(0)}`} tone={p.pnl_dollars == null ? undefined : p.pnl_dollars >= 0 ? "green" : "red"} />
                  <Stat label="Peak" value={p.peak_pnl_pct != null ? `+${p.peak_pnl_pct.toFixed(0)}%` : "—"} />
                </div>
                <MarkFreshness at={p.last_marked_at} status={p.mark_status} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span className={scaled ? "text-accent-green" : undefined}>
                    exit threshold <span className="num">{scaled ? "BE" : `${stopPct}%`}</span>
                  </span>
                  {trimmed && <span className="text-accent-green">booked trims</span>}
                  {p.ml_score != null && <span>ML <span className="num">{p.ml_score}</span></span>}
                  {p.n_score != null && <span>N <span className="num">{p.n_score}</span></span>}
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
        <table className="w-full border-collapse text-sm">
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
              <PositionSortHeader activeSort={sortKey} ascending={asc} onSort={toggle}>Exit threshold</PositionSortHeader>
            </tr>
          </thead>
          <tbody className="num divide-y divide-border">
            {rows.map((p) => {
              const isEquity = p.instrument === "equity";
              const scaled = (p.scale_stage ?? 0) >= 1;
              const held = daysHeld(p.entry_date);
              const pnl = p.pnl_pct ?? 0;
              const trimmed = (trimsByParent.get(p.id)?.length ?? 0) > 0;
              return (
                <tr key={p.id} className="data-row">
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => setActiveTicker(p.ticker)}
                      className="ticker hover:text-accent-blue"
                    >
                      {p.ticker}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-text-secondary">
                    <span className="inline-flex items-center gap-1.5">
                      {isEquity ? "shares" : `$${p.strike} ${p.option_type} ${p.expiry ?? ""}`}
                      {!isEquity && (
                        <GexWall ticker={p.ticker} strike={Number(p.strike) || null} width={40} />
                      )}
                      {trimmed && <span className="text-accent-green" title="has booked trims"><Scissors size={12} aria-label="has booked trims" /></span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-text-secondary">{p.entry_date}</td>
                  <td className="px-3 py-2.5 text-right text-text-muted">{held ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">{p.contracts}</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">${p.premium_at_entry.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">
                    {p.current_premium != null ? `$${p.current_premium.toFixed(2)}` : "—"}
                    <MarkFreshness at={p.last_marked_at} status={p.mark_status} />
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-secondary">{formatCurrency(p.cost_basis)}</td>
                  <td className="px-3 py-2.5 text-right text-text-primary">{p.current_value == null ? "Unknown" : formatCurrency(p.current_value)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold" style={{ color: changeColor(pnl) }}>
                    {signedPercent(p.pnl_pct)}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: changeColor(p.pnl_dollars ?? 0) }}>
                    {p.pnl_dollars == null ? "Unknown" : `${p.pnl_dollars >= 0 ? "+" : ""}$${p.pnl_dollars.toFixed(0)}`}
                  </td>
                  <td className="px-3 py-2.5 text-right text-text-muted">
                    {p.peak_pnl_pct != null ? `+${p.peak_pnl_pct.toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
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
    <GlassPanel>
      <div className="space-y-4">
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
          <div key={cat} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
            <button
              onClick={() =>
                setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))
              }
              className="flex min-h-11 w-full flex-col items-stretch justify-between gap-1 py-1.5 text-xs transition-colors hover:bg-bg-card-hover md:min-h-0 md:flex-row md:items-center"
            >
              <div className="flex min-w-0 items-center gap-2 text-left">
                {isCollapsed ? <ChevronRight size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                <span className="min-w-0 break-words text-sm font-semibold text-text-primary">{cat}</span>
                <span className="text-text-muted">
                  <span className="num">{catCount}</span> {catCount === 1 ? "position" : "positions"},{" "}
                  <span className="num">{themeMap.size}</span> {themeMap.size === 1 ? "theme" : "themes"}
                </span>
              </div>
              <div className="flex items-center gap-3 pl-6 md:pl-0">
                <span className="num text-text-secondary">{formatCurrency(catValue)}</span>
                <span className="num font-semibold" style={{ color: pnlColor }}>
                  {catPnlPct >= 0 ? "+" : ""}
                  {catPnlPct.toFixed(2)}%
                </span>
              </div>
            </button>
            {!isCollapsed && (
              <div>
                {Array.from(themeMap.entries())
                  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
                  .map(([theme, posList]) => (
                    <div key={theme}>
                      <div className="flex min-w-0 flex-wrap items-center gap-2 pt-2 text-xs text-text-muted">
                        <span className="min-w-0 break-words font-medium text-text-secondary">{theme}</span>
                        <span className="num">{posList.length}</span>
                        <span className="num min-w-0 break-words">
                          {posList.map((p) => p.ticker).join(" · ")}
                        </span>
                      </div>
                      <div className="divide-y divide-border">
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
    tagline: "Monthlies DTE 25-70, 6% size, with the market regime, ranked by SETUP + ML + bounded evidence, scale-in tranches, trims, breakeven floor, runners.",
    stopPct: -50,
  },
  ruby: {
    label: "Ruby",
    tagline: "Intraday options (ruby-trader v7). DTE 8-30, 4% size, shared gates but enters TODAY's flow on a 15-min cycle, Sonnet judgment veto, E1 ladder + BE floor, -7% daily loss cap.",
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
    queryClient.invalidateQueries({ queryKey: ["smart-trader-watchlist"] });
  };

  // Scheduled backend selection owns new entries; there is no manual pick action.
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
        <QueryNotice queries={[summaryQuery]} label="Smart trader" />
        <QueryErrorState label="Unable to load smart trader." onRetry={() => void summaryQuery.refetch()} />
      </div>
    );
  }

  const ret = summary.return_pct;
  const retColor = changeColor(ret);
  const pnlTotal = summary.total_value - summary.starting_capital;
  const deployedPct = summary.total_value > 0 ? (summary.positions_value / summary.total_value) * 100 : 0;
  const signedMoney = (v: number) => `${v >= 0 ? "+" : ""}${formatCurrency(v)}`;

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
  const personaRow = personaRows.find((r) => r.name === persona);
  const viewToggle = (
    <Segmented
      ariaLabel="Open positions layout"
      options={[{ value: "table", label: "Table" }, { value: "grouped", label: "Cards" }]}
      value={posView}
      onChange={(v) => setPosView(v as "table" | "grouped")}
    />
  );
  return (
    <div className="max-w-full space-y-8 overflow-x-clip pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Persona selector + active book description */}
      <div
        className="mobile-workspace-controls sticky z-20 space-y-2 p-2 md:static md:z-auto md:p-0"
        style={{ background: "var(--bg-primary)" }}
      >
        <Segmented<PersonaName>
          ariaLabel="Choose paper book"
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
        <p className="line-clamp-2 max-w-[72ch] text-sm leading-relaxed text-text-secondary md:line-clamp-none">
          {personaRow?.description || summary.persona_description || PERSONA_META[persona].tagline}
          {personaRow ? (
            <span className="text-text-muted">
              {" "}
              · <span className="num">{personaRow.open_positions}</span> open · <span className="num">${(personaRow.total_value / 1000).toFixed(1)}K</span>
              {personaRow.ml_serving_mode === "gate_and_rank"
                ? <> · ML gate <span className="num">{personaRow.ml_threshold ?? "?"}+</span> active</>
                : personaRow.ml_serving_mode === "rank_only"
                  ? " · ML research rank only; no ML rejection"
                  : ""}
            </span>
          ) : null}
        </p>
        {personaQuery.isError && !personaList && (
          <QueryErrorState label="Unable to load persona summaries." onRetry={() => void personaQuery.refetch()} />
        )}
      </div>

      {/* Hero: book equity + P/L is the focal point; supporting stats beside it. */}
      <section className="space-y-4" aria-label={`${PERSONA_META[persona].label} book summary`}>
        <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <div className="text-sm text-text-muted">{PERSONA_META[persona].label} book equity</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="num text-3xl font-semibold tracking-tight text-text-primary">
                {formatCurrency(summary.total_value)}
              </span>
              <span className="num text-xl font-semibold" style={{ color: changeColor(pnlTotal) }}>
                {signedMoney(pnlTotal)}
              </span>
              <span className="num text-xl font-semibold" style={{ color: retColor }}>
                {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
              </span>
            </div>
            <div className="mt-1 text-xs text-text-muted">
              from <span className="num">{formatCurrency(summary.starting_capital)}</span> starting capital
            </div>
            {historyQuery.isError && !history && (
              <QueryErrorState label="Unable to load equity history." onRetry={() => void historyQuery.refetch()} />
            )}
            {history && history.length >= 2 && <EquityCurve history={history} />}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 min-[480px]:grid-cols-3">
            <Stat label="Deployed" value={`${deployedPct.toFixed(0)}%`} sub={`${formatCurrency(summary.positions_value)} in positions`} />
            <Stat label="Open" value={summary.open_positions} sub={`${summary.closed_positions} closed`} />
            <Stat label="Cash" value={formatCurrency(summary.cash)} />
            <Stat label="Realized" tone={summary.realized_pnl >= 0 ? "green" : "red"} value={signedMoney(summary.realized_pnl)} />
            <Stat label="Unrealized" tone={summary.unrealized_pnl >= 0 ? "green" : "red"} value={signedMoney(summary.unrealized_pnl)} />
            <Stat label="Win rate" value={summary.closed_positions > 0 ? `${summary.win_rate.toFixed(0)}%` : "—"} />
            {(summary.banked_from_trims ?? 0) > 0 && (
              <div title="Realized gains banked from AbTrader-style scale-out trims">
                <Stat label="Banked from trims" tone="green" value={`+${formatCurrency(summary.banked_from_trims ?? 0)}`} />
              </div>
            )}
          </div>
        </div>

        {(() => { const exposure = markedExposure(summary.positions); return exposure.count > 0 && <p className="callout max-w-[72ch]">Recorded valuation: <span className="num">{exposure.count}</span> positions (<span className="num">{formatCurrency(exposure.value)}</span> carried exposure) have stale or unknown marks. Portfolio return is not a live quote.</p>; })()}
        {summary.persona_description && summary.persona_description !== (personaRow?.description || summary.persona_description) && (
          <p className="prose-read max-w-[72ch] text-text-secondary">{summary.persona_description}</p>
        )}

        {/* Marking and reset actions do not manually select new entries. */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            onClick={() => markMutation.mutate()}
            disabled={markMutation.isPending}
            className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-xs font-medium text-text-primary transition-colors hover:bg-bg-card-hover disabled:opacity-40 md:min-h-8"
          >
            {markMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Mark to market
          </button>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-text-muted marker:content-none hover:text-text-primary md:min-h-8">
              <ChevronRight size={12} className="transition-transform group-open:rotate-90" aria-hidden="true" />
              Reset book
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="text-text-muted">$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  step={1000}
                  value={resetCapital}
                  onChange={(e) => setResetCapital(e.target.value)}
                  aria-label="Reset starting capital"
                  className="num min-h-11 w-24 rounded-[var(--radius-control)] border border-border bg-bg-card px-2 text-xs text-text-primary focus:border-accent-blue/50 focus:outline-none md:min-h-8"
                />
              </span>
              <button
                onClick={() => {
                  const amt = Math.round(Number(resetCapital));
                  if (!Number.isFinite(amt) || amt < 1000) {
                    alert("Enter a starting balance of at least $1,000.");
                    return;
                  }
                  if (
                    confirm(
                      `Reset ${PERSONA_META[persona].label} book to $${amt.toLocaleString()}? All picks and history will be erased. On weekdays the endpoint may automatically run new picks and enter positions.`,
                    )
                  )
                    resetMutation.mutate(amt);
                }}
                disabled={resetMutation.isPending}
                className="flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-xs text-text-secondary transition-colors hover:border-accent-red/40 hover:text-accent-red disabled:opacity-40 md:min-h-8"
              >
                {resetMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Reset
              </button>
            </div>
          </details>
        </div>
        <QueryNotice queries={[summaryQuery, todayQuery, historyQuery, personaQuery]} label="Persona data" />
        {(markMutation.isError || resetMutation.isError) && <p role="alert" className="callout" style={{ "--callout": "var(--accent-red)" } as React.CSSProperties}>Trader action failed. Reload the book before retrying; a timed-out action may have completed.</p>}
        {resetMutation.isSuccess && <p role="status" className="text-xs text-text-secondary">Reset completed. Reloaded positions show any automatic picks returned by the endpoint.</p>}
      </section>

      {/* Open Positions — dense table (default) or grouped cards */}
      {summary.positions.length > 0 && (
        <section className="space-y-3">
          <SectionHead
            title={<>Open positions <span className="num text-base text-text-muted">{summary.positions.length}</span></>}
            sub="Click a ticker to open its analysis."
            actions={viewToggle}
          />
          {posView === "table" ? (
            <div className="card">
              <PositionsTable
                positions={summary.positions}
                stopPct={PERSONA_META[persona].stopPct}
                trimsByParent={trimsByParent}
              />
            </div>
          ) : (
            <OpenPositionsGrouped
              positions={summary.positions}
              stopPct={PERSONA_META[persona].stopPct}
              trimsByParent={trimsByParent}
            />
          )}
        </section>
      )}

      {/* Ruby — the intraday desk log (judge reads, entries, vetoes, freezes) */}
      {persona === "ruby" && <RubyDeskLog />}

      {/* iFlow-Trader-style WL-A / WL-B for every persona (options books) */}
      <WatchlistPanel key={persona} persona={persona} />

      {/* Trade Decision History — always visible, even when empty */}
      <TradeDecisionHistory
        closed={summary.closed}
        trimsByParent={trimsByParent}
        expanded={showClosed}
        onToggle={() => setShowClosed((v) => !v)}
      />

      {/* Today — what got rejected, grouped by rule */}
      {todayQuery.isError && !today && (
        <QueryErrorState label="Unable to load today's decisions." onRetry={() => void todayQuery.refetch()} />
      )}
      {today && (
        <details className="group/today">
          <summary className="flex cursor-pointer list-none flex-wrap items-end justify-between gap-x-4 gap-y-1 marker:content-none">
            <span className="flex items-center gap-2">
              <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform group-open/today:rotate-90" aria-hidden="true" />
              <span className="section-title">Today's decisions</span>
              <span className="num text-sm text-text-muted">{today.date}</span>
            </span>
            <span className="text-sm text-text-muted">
              <span className="num text-text-primary">{today.picked.length}</span> picks, <span className="num text-text-primary">{today.rejected_count}</span> rejected
            </span>
          </summary>
          <div className="card mt-3">
            {today.picked.length === 0 && today.rejected_count === 0 ? (
              <div className="py-4 text-center text-sm text-text-muted">
                No entries or rejections recorded for this market date.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {rejectedRules.length > 0 ? (
                  rejectedRules.map(([rk, entries]) => (
                    <RejectionBlock key={rk} ruleKey={rk} entries={entries} />
                  ))
                ) : (
                  <div className="py-2 text-center text-sm text-text-muted">
                    No rejected entries logged for {today.date}.
                  </div>
                )}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Hot categories — Today / 7d / 30d windows, self-fetches */}
      <CategoryTrendPanel />

      {/* Empty state — only when nothing has ever been picked */}
      {summary.positions.length === 0 && summary.closed.length === 0 && (
        <p className="prose-read py-8 text-center text-text-muted">
          Book is empty. The daily cron opens positions automatically at
          06:30 PT — check back after the next run.
        </p>
      )}
    </div>
  );
}
