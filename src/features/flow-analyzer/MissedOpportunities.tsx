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
    <div>
      <h3 className="section-title flex items-baseline gap-2"><Eye size={16} className="self-center text-text-muted" />Unfilled observations <span className="num text-base font-normal text-text-muted">{candidates.length}</span></h3>
      <p className="section-sub max-w-[72ch]">Recorded premium change from reference, not an executed return. WL-A and WL-B score 7+. Marks may be modeled or stale.</p>
    </div>
    {query.isLoading && <p className="text-sm text-text-muted">Loading watchlist...</p>}
    {!query.isPending && !query.isError && query.fetchStatus !== "paused" && !candidates.length && <p className="text-sm text-text-muted">No matching observations.</p>}
    <div className="divide-y divide-border">
    {candidates.map((e, i) => <div key={e.id ?? `${e.ticker}-${e.expiry}-${e.strike}-${i}`} className="data-row flex items-center gap-3 px-2 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="ticker text-sm">{e.ticker}</span>
          <span className="num truncate text-xs text-text-secondary">${e.strike} {e.option_type} {e.expiry}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
          <span className="tag">WL-{e.list ?? e.tier}</span>
          <span>Score <span className="num">{e.score}</span></span>
          <MarkFreshness at={e.last_marked_at} />
        </div>
      </div>
      <span className={`text-lg font-semibold ${e.markChange == null ? "num text-text-muted" : e.markChange >= 0 ? "delta-up" : "delta-down"}`}>{signedPercent(e.markChange)}</span>
    </div>)}
    </div>
  </div>;
}
