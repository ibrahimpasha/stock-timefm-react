import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { QueryNotice } from "../../components/QueryNotice";
import { MarkFreshness } from "../../components/MarkFreshness";
import { premiumChange, signedPercent } from "../../lib/markFreshness";
import { Eye, ChevronRight } from "lucide-react";
import { TileGrid, Tile, KpiTile, BarRow, toneOf } from "../../components/Cockpit";

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

  const marked = candidates.filter((e) => e.markChange != null);
  const avgChange = marked.length ? marked.reduce((t, e) => t + (e.markChange as number), 0) / marked.length : null;
  const upCount = marked.filter((e) => (e.markChange as number) > 0).length;
  const best = marked[0];
  const max = Math.max(1, ...marked.map((e) => Math.abs(e.markChange as number)));
  const contract = (e: WatchlistEntry) => `$${e.strike} ${e.option_type} ${e.expiry}`;

  return <TileGrid>
    <div className="min-w-0 lg:col-span-12"><QueryNotice queries={[query]} label="Watchlist observations" /></div>
    <KpiTile label="Unfilled observations" value={candidates.length} sub="WL-A and WL-B score 7+" />
    <KpiTile label="Avg premium change" value={signedPercent(avgChange)} tone={toneOf(avgChange)} sub={`${marked.length} with a recorded mark`} />
    <KpiTile label="Moved up" value={marked.length ? `${upCount}/${marked.length}` : "—"} sub="premium above reference" />
    <KpiTile label="Biggest mover" value={best?.ticker ?? "—"} delta={best ? signedPercent(best.markChange) : undefined} tone={toneOf(best?.markChange)} />

    <Tile span={12} title={<span className="flex items-center gap-2"><Eye size={15} className="text-text-muted" />Premium change since reference</span>} meta="recorded marks, not executed returns; marks may be modeled or stale">
      {query.isLoading && <p className="text-sm text-text-muted">Loading watchlist...</p>}
      {!query.isPending && !query.isError && query.fetchStatus !== "paused" && !candidates.length && <p className="text-sm text-text-muted">No matching observations.</p>}
      <div className="flex max-h-[44vh] flex-col gap-1 overflow-y-auto">
        {candidates.map((e, i) => <BarRow
          key={e.id ?? `${e.ticker}-${e.expiry}-${e.strike}-${i}`}
          label={e.ticker}
          value={e.markChange ?? 0}
          max={max}
          diverging
          display={<span className={e.markChange == null ? "text-text-muted" : undefined}>{signedPercent(e.markChange)}</span>}
          trailing={e.score}
          title={`${contract(e)} · WL-${e.list ?? e.tier} · score ${e.score}${e.last_marked_at ? ` · marked ${e.last_marked_at}` : " · no mark"}`}
        />)}
      </div>
      {!!candidates.length && <details className="group/contracts text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-text-secondary marker:content-none hover:text-text-primary">
          <ChevronRight size={14} className="transition-transform group-open/contracts:rotate-90" aria-hidden="true" />
          Contracts and mark freshness
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-text-muted">
              <tr className="text-left"><th className="py-1.5 font-medium">Ticker</th><th className="font-medium">Contract</th><th className="font-medium">List</th><th className="text-right font-medium">Score</th><th className="pl-3 font-medium">Mark</th><th className="text-right font-medium">Change</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {candidates.map((e, i) => <tr key={e.id ?? `${e.ticker}-${e.expiry}-${e.strike}-${i}`}>
                <td className="ticker py-1.5">{e.ticker}</td>
                <td className="num text-text-secondary">{contract(e)}</td>
                <td>WL-{e.list ?? e.tier}</td>
                <td className="num text-right">{e.score}</td>
                <td className="pl-3"><MarkFreshness at={e.last_marked_at} /></td>
                <td className={`num text-right ${e.markChange == null ? "text-text-muted" : e.markChange >= 0 ? "delta-up" : "delta-down"}`}>{signedPercent(e.markChange)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </details>}
    </Tile>
  </TileGrid>;
}
