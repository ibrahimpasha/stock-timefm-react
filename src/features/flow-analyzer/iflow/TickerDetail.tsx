import { WeekdayBehavior } from "./WeekdayBehavior";
import { useMemo, useState } from "react";
import { useAdminAnalysis, type AdminCall } from "../../../api/alerts";
import { useFlowPicks } from "../../../api/flow";
import { BullBearBar } from "../../../components/BullBearBar";
import { BarRow, Kpi, Tile } from "../../../components/Cockpit";
import { optionIntent } from "../../../lib/optionContract";
import { PickCard } from "../../../components/PickCard";
import { formatDate, formatPremium } from "../../../lib/utils";
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
    <Tile
      title="Admin desk"
      meta={`${calls.length} mention${calls.length > 1 ? "s" : ""} in #admin-analysis · last 14 days`}
    >
      <div className="divide-y divide-border">
        {calls.map((c) => (
          <div key={c.msg_id} className="max-w-[72ch] py-2.5 first:pt-0">
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
    </Tile>
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
  // Signed (bull +, bear -) premium per visible flow date — the cockpit bar
  // view of the history below. Pure derivation from `grouped`.
  const dayNet = useMemo(() => {
    const rows = Object.keys(grouped)
      .sort()
      .reverse()
      .slice(0, 12)
      .map((d) => {
        let net = 0;
        for (const e of grouped[d]) {
          const side = optionIntent(e).side;
          const p = parsePremium(e.premium || "$0");
          net += side === "Bull" ? p : side === "Bear" ? -p : 0;
        }
        return { d, net, n: grouped[d].length };
      });
    return { rows, max: Math.max(1, ...rows.map((r) => Math.abs(r.net))) };
  }, [grouped]);
  const bullPct = trackedData.bullish + trackedData.bearish > 0
    ? Math.round((trackedData.bullish / (trackedData.bullish + trackedData.bearish)) * 100)
    : null;
  const netBull = trackedData.bullish > trackedData.bearish;
  const total = trackedData.bullish + trackedData.bearish;
  const toggle = (k: string) => setExpanded(expanded === k ? null : k);

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <Tile
        title={<span className="ticker text-2xl tracking-tight">{ticker}</span>}
        actions={
          <EarningsBadge
            isoDate={earningsData?.earnings_date ?? null}
            session={earningsData?.earnings_session ?? null}
          />
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Kpi
            label="Net premium"
            value={trackedData.net_premium}
            size="md"
            delta={netBull ? "Bull" : "Bear"}
            tone={netBull ? "up" : "down"}
          />
          <Kpi label="Entries" value={trackedData.total_entries.toLocaleString()} size="md" />
          <Kpi
            label="Bull / bear"
            size="md"
            value={
              <>
                <span className="delta-up">{trackedData.bullish}</span>
                <span className="text-text-muted"> / </span>
                <span className="delta-down">{trackedData.bearish}</span>
              </>
            }
          />
          <Kpi
            label="Bull share"
            size="md"
            value={bullPct != null ? `${bullPct}%` : "—"}
            tone={bullPct == null ? "neutral" : bullPct >= 50 ? "up" : "down"}
          />
        </div>
        <BullBearBar bull={trackedData.bullish} total={total} />
      </Tile>

      {dayNet.rows.length >= 2 && (
        <Tile title="Net premium by day" meta="bull minus bear, visible flow">
          <div className="flex flex-col gap-1">
            {dayNet.rows.map((r) => (
              <BarRow
                key={r.d}
                label={r.d.slice(5)}
                value={r.net}
                max={dayNet.max}
                diverging
                display={`${r.net < 0 ? "-" : ""}${formatPremium(Math.abs(r.net))}`}
                trailing={r.n}
                title={`${formatDate(r.d)}: ${r.n} entries`}
              />
            ))}
          </div>
        </Tile>
      )}

      <AdminDeskBlock ticker={ticker} />

      <WeekdayBehavior ticker={ticker} />

      {/* PickCard is itself a bordered card, so picks sit directly in the
          column (not inside a Tile) to avoid nested cards. */}
      {tickerPicks.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="m-0 px-1 text-[0.9375rem] font-semibold text-text-primary">
            Picks <span className="num text-xs font-normal text-text-muted">{tickerPicks.length}</span>
          </h2>
          <div className="flex flex-col gap-3.5">
            {tickerPicks.map((p) => (
              <PickCard key={p.id} pick={p} />
            ))}
          </div>
        </section>
      )}

      <Tile
        title={
          tradersOnly
            ? "Trader positions"
            : isAllDates
            ? "Flow history"
            : isSingleDate
            ? `Flow on ${formatDate(singleDate)}`
            : `Flow across ${selectedDates.size} dates`
        }
        meta={
          tradersOnly ? (
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
          )
        }
      >
        {loading ? (
          <div className="animate-pulse text-sm text-text-muted">Loading…</div>
        ) : dateKeys.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-muted">
            No entries match filters
          </div>
        ) : (
          <div className="space-y-5">
            {dateKeys.map((date) => (
              <div key={date}>
                {!isSingleDate && (
                  <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-border pb-1.5 text-xs">
                    <span className="font-semibold text-text-primary">{formatDate(date)}</span>
                    <span className="num text-text-muted">{(grouped[date] || []).length}</span>
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
      </Tile>
    </div>
  );
}
