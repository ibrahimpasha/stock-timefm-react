import { WeekdayBehavior } from "./WeekdayBehavior";
import { useMemo, useState } from "react";
import { useAdminAnalysis, type AdminCall } from "../../../api/alerts";
import { useFlowPicks } from "../../../api/flow";
import { BullBearBar } from "../../../components/BullBearBar";
import { Stat } from "../../../components/Glass";
import { PickCard } from "../../../components/PickCard";
import { formatDate } from "../../../lib/utils";
import type { TrackedTicker } from "../../../lib/types";
import { matchesDte, normExpiry, parsePremium } from "./utils";
import { useIFlowEntries, useIFlowHistory, useStockPrice, useTickerEarnings } from "./hooks";
import { EntryRow } from "./EntryRow";
import { EarningsBadge } from "./TickerCard";
import type { DteFilter, TraderMatch } from "./types";
import { TraderEventRow } from "./TraderEventRow";

/** What the server-admin desk said about this ticker (14d #admin-analysis
 *  digest) — levels and dealer-positioning context right next to the flow.
 *  Renders nothing when no admin mentioned the ticker. */
function AdminDeskBlock({ ticker }: { ticker: string }) {
  const { data } = useAdminAnalysis();
  const calls = useMemo(() => {
    const out: (AdminCall & { author: string })[] = [];
    for (const a of data?.authors ?? [])
      for (const c of a.calls)
        if (c.tickers.includes(ticker.toUpperCase())) out.push({ ...c, author: a.author });
    return out.sort((x, y) => (y.ts || "").localeCompare(x.ts || "")).slice(0, 6);
  }, [data, ticker]);
  if (!calls.length) return null;
  const dirColor = (d: string) =>
    d === "bull" ? "var(--accent-green)" : d === "bear" ? "var(--accent-red)"
    : d === "macro" ? "var(--accent-blue)" : "var(--text-muted)";
  return (
    <section>
      <h3 className="section-title">Admin desk</h3>
      <p className="section-sub mb-2">
        {calls.length} mention{calls.length > 1 ? "s" : ""} in #admin-analysis · last 14 days
      </p>
      <div className="divide-y divide-border">
        {calls.map((c) => (
          <div key={c.msg_id} className="max-w-[72ch] py-2.5">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="num text-text-muted">{c.ts.slice(5, 10)}</span>
              <span className="font-medium" style={{ color: dirColor(c.direction) }}>
                {c.direction.charAt(0).toUpperCase() + c.direction.slice(1)}
              </span>
              <span className="text-text-muted">{c.author}</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {c.thesis}
              {c.levels && (
                <span className="num text-text-primary"> · {c.levels}</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

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
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="ticker text-3xl tracking-tight">{ticker}</h2>
          <EarningsBadge
            isoDate={earningsData?.earnings_date ?? null}
            session={earningsData?.earnings_session ?? null}
          />
        </div>
        <div className="grid grid-cols-3 gap-x-6 gap-y-3">
          <Stat label="Net premium" value={trackedData.net_premium} />
          <Stat label="Entries" value={trackedData.total_entries.toLocaleString()} />
          <Stat
            label="Bull / bear"
            value={
              <>
                <span className="delta-up">{trackedData.bullish}</span>
                <span className="text-text-muted"> / </span>
                <span className="delta-down">{trackedData.bearish}</span>
              </>
            }
          />
        </div>
        <BullBearBar bull={trackedData.bullish} total={total} />
      </header>

      <AdminDeskBlock ticker={ticker} />

      <WeekdayBehavior ticker={ticker} />

      {tickerPicks.length > 0 && (
        <section>
          <h3 className="section-title mb-3 flex items-baseline gap-2">
            Picks <span className="num text-sm font-normal text-text-muted">{tickerPicks.length}</span>
          </h3>
          <div className="space-y-3">
            {tickerPicks.map((p) => (
              <PickCard key={p.id} pick={p} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title">
          {tradersOnly
            ? "Trader positions"
            : isAllDates
            ? "Flow history"
            : isSingleDate
            ? `Flow on ${formatDate(singleDate)}`
            : `Flow across ${selectedDates.size} dates`}
        </h3>
        <p className="section-sub mb-3">
          {tradersOnly ? (
            <>
              <span className="num">{totalTraderPositions}</span> position{totalTraderPositions === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <span className="num">{totalEntries}</span> entr{totalEntries === 1 ? "y" : "ies"}, largest premium first
              {totalTraderPositions > 0 && (
                <span className="text-accent-purple">
                  {" "}+ <span className="num">{totalTraderPositions}</span> trader position{totalTraderPositions === 1 ? "" : "s"}
                </span>
              )}
            </>
          )}
        </p>
        {loading ? (
          <div className="animate-pulse text-sm text-text-muted">Loading…</div>
        ) : dateKeys.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-muted">
            No entries match filters
          </div>
        ) : (
          <div className="space-y-6">
            {dateKeys.map((date) => (
              <div key={date}>
                {!isSingleDate && (
                  <div className="mb-1 border-b border-border pb-1.5 text-sm font-medium text-text-primary">
                    {formatDate(date)}
                  </div>
                )}
                <div className="min-w-0 divide-y divide-border">
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
      </section>
    </div>
  );
}
