import { useMemo } from "react";
import { formatDate } from "../../../lib/utils";
import { dteTag, matchesDte, parsePremium, scoreEntry } from "./utils";
import { optionIntent, canonicalExpiry } from "../../../lib/optionContract";
import { useIFlowEntries, useTickerPricesBatch } from "./hooks";
import { estimateOptionPnl } from "./estimator";
import type { DteFilter } from "./types";
import { GexWall, GexWallLegend } from "../../gex/GexWall";

/** Est. P/L badge shared by the digest cards — same estimator as EntryRow. */
export function entryPnl(
  e: any,
  priceMap: Record<string, number>,
  flowDate: string,
): number | null {
  const intent = optionIntent(e);
  if (intent.side === "Unknown" || intent.action.includes("to close")) return null;
  const cur = priceMap[String(e.ticker || "").toUpperCase()] || 0;
  const uf = Number(e.underlying_price) || 0;
  const optFill = Number(e.avg_price) || 0;
  const strike = Number(e.strike) || 0;
  if (cur <= 0 || uf <= 0) return null;
  if (optFill > 0 && strike > 0) {
    return estimateOptionPnl(
      uf, cur, optFill, strike, e.dte ?? 30, e.type || e.option_type || "", flowDate,
      intent.action.includes("selling"),
    );
  }
  return null;
}

export function PnlBadge({ pnl }: { pnl: number | null }) {
  if (pnl == null) return null;
  const color = pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <span
      className="num w-14 shrink-0 text-right text-sm font-semibold"
      title="Estimated option P/L since the print (delta+theta model)"
      style={{ color }}
    >
      {pnl >= 0 ? "+" : ""}{pnl.toFixed(0)}%
    </span>
  );
}

/**
 * Top conviction entries for a single date. Renders nothing unless at least
 * one entry scores >=6.0 (see `scoreEntry` for the bucket boundaries).
 */
export function TopPicks({ date, dteFilter }: { date: string; dteFilter: DteFilter }) {
  const { data } = useIFlowEntries(date);
  const scored = useMemo(() => {
    if (!data?.entries?.length) return [];
    return data.entries
      .filter((e: any) => e.ticker && (e.vol_oi_ratio > 0 || e.ask_pct > 0))
      .filter((e: any) => matchesDte(e.dte, dteFilter))
      .map((e: any) => ({ ...e, _score: scoreEntry(e) }))
      .filter((e: any) => e._score >= 6.0)
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 15);
  }, [data, dteFilter]);
  const { data: priceData } = useTickerPricesBatch(
    scored.map((e: any) => String(e.ticker).toUpperCase()),
  );
  const priceMap = priceData?.prices ?? {};
  if (!scored.length) return null;
  return (
    <section className="min-w-0">
      <h3 className="section-title flex items-baseline gap-2">
        Top conviction flow
        <span className="num text-sm font-normal text-text-muted">{scored.length}</span>
      </h3>
      <p className="section-sub mb-3">
        {formatDate(date)} · ranked by premium, ask% and vol/OI
      </p>
      <GexWallLegend />
      <div className="divide-y divide-border">
        {scored.map((e: any, i: number) => {
          const { side, action } = optionIntent(e);
          const color = side === "Unknown" ? "var(--text-muted)" : side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          const mega =
            parsePremium(e.premium || "$0") >= 1e6 &&
            (e.vol_oi_ratio || 0) >= 10 &&
            (e.ask_pct || 0) >= 95;
          const dl = dteTag(e.dte);
          const pnl = entryPnl(e, priceMap, date);
          return (
            <div
              key={i}
              className="data-row flex items-center gap-3 px-2 py-2.5 text-xs"
            >
              <span className="num w-8 shrink-0 text-right text-text-muted" title="Conviction score">
                {e._score.toFixed(1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="ticker w-14 shrink-0 text-sm">{e.ticker}</span>
                  <span className="num truncate text-sm" style={{ color }} title={`${side} · ${action}`}>
                    ${e.strike} {e.type || e.option_type}
                  </span>
                  {mega && (
                    <span
                      className="tag shrink-0"
                      style={{ "--tag": "var(--accent-green)" } as React.CSSProperties}
                      title="≥$1M premium, vol/OI ≥10, ≥95% at ask"
                    >
                      mega
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-text-muted">
                  <span>{action}</span>
                  <span className="num">{canonicalExpiry(e.expiry, e._date ?? date, e.dte) ?? `${e.expiry} (year unknown)`}</span>
                  {dl && <span>{dl.text.toLowerCase()}</span>}
                  {e.vol_oi_ratio > 0 && (
                    <span className="num" title="Volume / open interest">
                      {Number(e.vol_oi_ratio).toFixed(1)}x
                    </span>
                  )}
                  {e.ask_pct > 0 && (
                    <span className="num" title="Filled at ask">{e.ask_pct}% ask</span>
                  )}
                  <GexWall ticker={e.ticker} strike={Number(e.strike) || null} showLabel />
                </div>
              </div>
              <span className="num w-16 shrink-0 text-right text-sm font-semibold text-text-primary">{e.premium}</span>
              {pnl != null ? <PnlBadge pnl={pnl} /> : <span className="w-14 shrink-0" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
