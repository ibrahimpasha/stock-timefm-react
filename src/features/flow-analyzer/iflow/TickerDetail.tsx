import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { useFlowPicks } from "../../../api/flow";
import { BullBearBar } from "../../../components/BullBearBar";
import { PickCard } from "../../../components/PickCard";
import { formatDate } from "../../../lib/utils";
import type { TrackedTicker } from "../../../lib/types";
import { matchesDte, normExpiry, parsePremium } from "./utils";
import { useIFlowEntries, useIFlowHistory, useStockPrice, useTickerEarnings } from "./hooks";
import { EntryRow } from "./EntryRow";
import { EarningsBadge } from "./TickerCard";
import type { DteFilter, TraderMatch } from "./types";
import { TraderEventRow } from "./TraderEventRow";

/**
 * Right-hand detail panel of IFlowTracker. Two modes:
 *   - One date selected: pull entries for date+ticker, filter by DTE.
 *   - All-dates or multi-date: pull history, group by date, filter by DTE.
 */
export function TickerDetail({
  ticker,
  trackedData,
  selectedDates,
  dteFilter,
  tradersOnly = false,
  selectedAuthors,
}: {
  ticker: string;
  trackedData: TrackedTicker;
  selectedDates: Set<string>;
  dteFilter: DteFilter;
  tradersOnly?: boolean;
  selectedAuthors?: Set<string>;
}) {
  const isAllDates = selectedDates.size === 0;
  const isSingleDate = selectedDates.size === 1;
  const singleDate = isSingleDate ? [...selectedDates][0] : "";
  const { data: singleData, isLoading: singleLoading } = useIFlowEntries(singleDate, ticker);
  const { data: historyData, isLoading: historyLoading } = useIFlowHistory(
    !isSingleDate ? ticker : "",
  );
  const { data: priceData } = useStockPrice(ticker);
  const { data: earningsData } = useTickerEarnings(ticker);
  const { data: allPicks } = useFlowPicks("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const price = priceData?.price || 0;
  const loading = isSingleDate ? singleLoading : historyLoading;

  // {date → entries[]} with DTE filter applied. Entries sorted by descending
  // premium within each date.
  const grouped: Record<string, any[]> = useMemo(() => {
    const g: Record<string, any[]> = {};
    const sortEntries = (entries: any[]) =>
      [...entries].sort((a, b) => parsePremium(b.premium || "$0") - parsePremium(a.premium || "$0"));
    const hasTraderMatch = (e: any) => Array.isArray(e.trader_matches) && e.trader_matches.length > 0;
    if (isSingleDate && singleData?.entries) {
      const filtered = singleData.entries.filter(
        (e: any) => matchesDte(e.dte, dteFilter) && (!tradersOnly || hasTraderMatch(e)),
      );
      if (filtered.length) g[singleDate] = sortEntries(filtered);
    } else if (historyData?.by_date) {
      for (const [date, v] of Object.entries(historyData.by_date)) {
        if (!isAllDates && !selectedDates.has(date)) continue;
        const filtered = ((v as any).entries ?? []).filter(
          (e: any) =>
            e.ticker && matchesDte(e.dte, dteFilter) && (!tradersOnly || hasTraderMatch(e)),
        );
        if (filtered.length) g[date] = sortEntries(filtered);
      }
    }
    return g;
  }, [isAllDates, isSingleDate, historyData, singleData, singleDate, selectedDates, dteFilter, tradersOnly]);

  // Collect trader-call rows from `trader_matches` across the visible flow,
  // dedupe by alert_id, then GROUP into positions by (author, strike,
  // opt_type, normalized expiry). Avoids rendering the same position 5
  // times when it has 5 events — one row per position with an event count
  // badge, matching the Traders page row-per-position UX.
  //
  // Bucketed by the LATEST event's day so the row shows up where the
  // trader's most recent action happened (most useful for "what just
  // moved"); the expanded view still shows the full timeline from OPEN.
  type PositionGroup = {
    key: string;
    matches: TraderMatch[];
    representative: TraderMatch;
  };
  const traderByDate: Record<string, PositionGroup[]> = useMemo(() => {
    const seen = new Set<number>();
    const authorFilter = selectedAuthors && selectedAuthors.size > 0 ? selectedAuthors : null;

    // 1. Dedupe by alert_id and bucket by position key.
    const groupsByKey = new Map<string, TraderMatch[]>();
    for (const date of Object.keys(grouped)) {
      for (const e of grouped[date]) {
        const matches: TraderMatch[] = e.trader_matches || [];
        for (const m of matches) {
          if (m.alert_id != null && seen.has(m.alert_id)) continue;
          if (m.alert_id != null) seen.add(m.alert_id);
          if (authorFilter && !authorFilter.has(m.author)) continue;

          // Prefer the backend-resolved position_key (loose-matched via
          // the position grouper) so events with missing strike/expiry —
          // e.g. an ADD with rationale "small add, avg 2.5" and no
          // contract restated — still collapse into the same position.
          // Fall back to the raw match fields, then to per-alert isolation.
          const pk = m.position_key;
          let key: string;
          if (pk && pk.ticker) {
            key = [
              m.author,
              pk.ticker,
              pk.strike ?? "",
              (pk.opt_type ?? "").toLowerCase(),
              normExpiry(pk.expiry) ?? "",
            ].join("|");
          } else {
            const exp = normExpiry(m.call_expiry);
            const hasContract = m.call_strike != null && !!exp;
            key = hasContract
              ? `${m.author}|${m.call_strike}|${(m.call_opt_type ?? "").toLowerCase()}|${exp}`
              : `solo|${m.alert_id ?? m.ts}`;
          }
          if (!groupsByKey.has(key)) groupsByKey.set(key, []);
          groupsByKey.get(key)!.push(m);
        }
      }
    }

    // 2. Build PositionGroup, anchored on the LATEST event.
    const out: Record<string, PositionGroup[]> = {};
    for (const [key, ms] of groupsByKey) {
      ms.sort((a, b) => (a.ts || "").localeCompare(b.ts || ""));
      const representative = ms[ms.length - 1];
      const day = (representative.ts || "").slice(0, 10);
      if (!day) continue;
      (out[day] ||= []).push({ key, matches: ms, representative });
    }

    // 3. Sort each day: contract tier first, then most recent ts.
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => {
        const at = a.representative.tier;
        const bt = b.representative.tier;
        if (at !== bt) return at === "contract" ? -1 : 1;
        return (b.representative.ts || "").localeCompare(a.representative.ts || "");
      });
    }
    return out;
  }, [grouped, selectedAuthors]);

  // Union of flow-dates and trader-call-dates so trader-only days still show.
  // When tradersOnly is on, only trader-call dates count.
  const dateKeys = useMemo(() => {
    const s = new Set<string>(
      tradersOnly
        ? Object.keys(traderByDate)
        : [...Object.keys(grouped), ...Object.keys(traderByDate)],
    );
    return [...s].sort().reverse();
  }, [grouped, traderByDate, tradersOnly]);
  const totalEntries = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
  const totalTraderPositions = Object.values(traderByDate).reduce(
    (n, arr) => n + arr.length, 0,
  );
  const tickerPicks = (allPicks ?? []).filter((p) => p.ticker === ticker);
  const total = trackedData.bullish + trackedData.bearish;
  const toggle = (k: string) => setExpanded(expanded === k ? null : k);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-accent-cyan" />
            <span className="font-mono font-bold text-lg text-text-primary">{ticker}</span>
          </div>
          <span className="text-xs text-text-muted">{trackedData.total_entries} total</span>
        </div>
        <BullBearBar bull={trackedData.bullish} total={total} />
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-text-muted">
            Net Premium:{" "}
            <span className="text-text-secondary font-mono">{trackedData.net_premium}</span>
          </span>
          <EarningsBadge
            isoDate={earningsData?.earnings_date ?? null}
            session={earningsData?.earnings_session ?? null}
          />
        </div>
      </div>

      {tickerPicks.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-text-muted uppercase mb-2">
            Picks ({tickerPicks.length})
          </h4>
          <div className="space-y-2">
            {tickerPicks.map((p) => (
              <PickCard key={p.id} pick={p} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase mb-2">
          {tradersOnly ? (
            <span className="text-accent-purple">
              Trader Positions ({totalTraderPositions})
            </span>
          ) : (
            <>
              {isAllDates
                ? `Flow History (${totalEntries})`
                : isSingleDate
                ? `Flow — ${formatDate(singleDate)} (${totalEntries})`
                : `Flow — ${selectedDates.size} dates (${totalEntries})`}
              {totalTraderPositions > 0 && (
                <span className="ml-2 text-accent-purple">
                  + {totalTraderPositions} trader position{totalTraderPositions === 1 ? "" : "s"}
                </span>
              )}
            </>
          )}
        </h4>
        {loading ? (
          <div className="text-xs text-text-muted animate-pulse">Loading...</div>
        ) : dateKeys.length === 0 ? (
          <div className="text-xs text-text-muted">No entries match filters</div>
        ) : (
          <div className="space-y-3">
            {dateKeys.map((date) => (
              <div key={date}>
                {!isSingleDate && (
                  <div className="text-xs font-semibold text-accent-blue mb-1">
                    {formatDate(date)}
                  </div>
                )}
                <div className="space-y-0.5 pl-2 border-l-2 border-border">
                  {(traderByDate[date] || []).map((g) => (
                    <TraderEventRow
                      key={`t-${g.key}`}
                      match={g.representative}
                      ticker={ticker}
                      eventCount={g.matches.length}
                    />
                  ))}
                  {!tradersOnly &&
                    (grouped[date] || []).map((entry: any, idx: number) => (
                      <EntryRow
                        key={`${date}-${idx}`}
                        entry={entry}
                        ticker={ticker}
                        price={price}
                        expandedKey={expanded}
                        entryKey={`${date}-${idx}`}
                        onToggle={toggle}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
