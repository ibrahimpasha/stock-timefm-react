import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { QueryNotice } from "../../components/QueryNotice";
import { MarkFreshness } from "../../components/MarkFreshness";
import { premiumChange, signedPercent } from "../../lib/markFreshness";
import { Eye } from "lucide-react";

interface WatchlistEntry {
  id?: number;
  ticker: string;
  strike: number | string;
  option_type: string;
  expiry: string;
  ref_premium: number;
  current_premium?: number | null;
  last_marked_at?: string | null;
  score: number;
  list?: string;
  tier?: string;
}

export function MissedOpportunities() {
  const query = useQuery<WatchlistEntry[]>({
    queryKey: ["flow-paper-watchlist"],
    queryFn: () => apiClient.get("/flow-paper/watchlist").then(r => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const candidates = (query.data ?? []).filter(e => {
    const list = e.list ?? e.tier;
    return list === "A" || (list === "B" && e.score >= 7);
  }).map(e => ({ ...e, markChange: premiumChange(e.current_premium, e.ref_premium, e.last_marked_at) }))
    .sort((a, b) => (b.markChange ?? -Infinity) - (a.markChange ?? -Infinity) || b.score - a.score);

  return <div className="space-y-3">
    <QueryNotice queries={[query]} label="Watchlist observations" />
    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary"><Eye size={14} className="text-text-muted" />Unfilled observations <span className="num font-normal text-text-muted">{candidates.length}</span></h4>
    <p className="text-xs text-text-muted max-w-[72ch]">Recorded premium change from reference, not an executed return. WL-A and WL-B score 7+. Marks may be modeled or stale.</p>
    {query.isLoading && <p className="text-xs text-text-muted">Loading watchlist...</p>}
    {!query.isPending && !query.isError && query.fetchStatus !== "paused" && !candidates.length && <p className="text-xs text-text-muted">No matching observations.</p>}
    <div className="divide-y divide-border">
    {candidates.map((e, i) => <div key={e.id ?? `${e.ticker}-${e.expiry}-${e.strike}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 px-1 text-xs hover:bg-bg-card-hover">
      <span className="text-text-muted">WL-{e.list ?? e.tier}</span>
      <span className="num font-semibold text-text-primary">{e.ticker}</span>
      <span className="num">${e.strike} {e.option_type} {e.expiry}</span>
      <span className="text-text-muted">Score <span className="num">{e.score}</span></span>
      <span className="num" style={{ color: e.markChange == null ? "var(--text-muted)" : e.markChange >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{signedPercent(e.markChange)}</span>
      <MarkFreshness at={e.last_marked_at} />
    </div>)}
    </div>
  </div>;
}
