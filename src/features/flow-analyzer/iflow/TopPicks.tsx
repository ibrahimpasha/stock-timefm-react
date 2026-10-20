import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
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
      className="num shrink-0 font-semibold"
      title="Estimated option P/L since the print (delta+theta model)"
      style={{ color }}
    >
      Est. {pnl >= 0 ? "+" : ""}{pnl.toFixed(0)}%
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
    <div className="mb-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <TrendingUp size={13} className="text-text-muted" />
        Top conviction flow
        <span className="text-xs font-normal text-text-muted">
          {formatDate(date)} · <span className="num">{scored.length}</span>
        </span>
      </h4>
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
          return (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-2 text-xs transition-colors hover:bg-bg-card-hover"
            >
              <span className="num w-7 shrink-0 font-semibold text-text-primary" title="Conviction score">
                {e._score.toFixed(1)}
              </span>
              <span className="num w-14 shrink-0 text-sm font-semibold text-text-primary">{e.ticker}</span>
              <span className="num text-text-primary">
                ${e.strike} {e.type || e.option_type}
              </span>
              <span style={{ color }} className="font-medium">
                {side}
              </span>
              <span className="text-text-muted">{action}</span>
              <span className="num text-text-muted">{canonicalExpiry(e.expiry, e._date ?? date, e.dte) ?? `${e.expiry} (year unknown)`}</span>
              {dl && (
                <span className="text-text-muted">{dl.text.toLowerCase()}</span>
              )}
              {e.vol_oi_ratio > 0 && (
                <span className="num text-text-secondary" title="Volume / open interest">
                  {Number(e.vol_oi_ratio).toFixed(1)}x
                </span>
              )}
              {e.ask_pct > 0 && (
                <span className="num text-text-secondary" title="Filled at ask">{e.ask_pct}% ask</span>
              )}
              <GexWall ticker={e.ticker} strike={Number(e.strike) || null} showLabel />
              <span className="text-text-secondary ml-auto num">{e.premium}</span>
              <PnlBadge pnl={entryPnl(e, priceMap, date)} />
              {mega && (
                <span
                  className="text-xs font-medium text-accent-green"
                  title="≥$1M premium, vol/OI ≥10, ≥95% at ask"
                >
                  mega
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
