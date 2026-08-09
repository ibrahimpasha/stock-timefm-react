import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { formatDate } from "../../../lib/utils";
import { classifySide, dteTag, matchesDte, parsePremium, scoreEntry } from "./utils";
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
  const cur = priceMap[String(e.ticker || "").toUpperCase()] || 0;
  const uf = Number(e.underlying_price) || 0;
  const optFill = Number(e.avg_price) || 0;
  const strike = Number(e.strike) || 0;
  if (cur <= 0 || uf <= 0) return null;
  if (optFill > 0 && strike > 0) {
    return estimateOptionPnl(
      uf, cur, optFill, strike, e.dte ?? 30, e.type || e.option_type || "", flowDate,
    );
  }
  const isPut = String(e.type || e.option_type || "").toUpperCase().includes("PUT");
  const raw = ((cur - uf) / uf) * 100 * (isPut ? -1 : 1);
  return Math.max(-100, Math.round(raw));
}

export function PnlBadge({ pnl }: { pnl: number | null }) {
  if (pnl == null) return null;
  const color = pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)";
  return (
    <span
      className="num px-1.5 rounded-full font-semibold"
      title="Estimated option P/L since the print (delta+theta model)"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
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
    <div className="mb-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2 flex items-center gap-1.5">
        <TrendingUp size={12} className="text-accent-green" />
        Top Conviction Flow — {formatDate(date)} ({scored.length})
      </h4>
      <GexWallLegend />
      <div className="space-y-1">
        {scored.map((e: any, i: number) => {
          const { side, action } = classifySide(
            e.type || e.option_type,
            e.ask_pct,
            e.vol_oi_ratio,
            e.side,
          );
          const color = side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          const mega =
            parsePremium(e.premium || "$0") >= 1e6 &&
            (e.vol_oi_ratio || 0) >= 10 &&
            (e.ask_pct || 0) >= 95;
          const dl = dteTag(e.dte);
          return (
            <div
              key={i}
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{
                background: mega ? "color-mix(in srgb, var(--accent-green) 8%, transparent)" : "color-mix(in srgb, var(--bg-card) 70%, transparent)",
                border: mega ? "1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)" : "1px solid transparent",
              }}
            >
              <span className="num text-xs font-bold text-accent-cyan w-6">
                {e._score.toFixed(1)}
              </span>
              <span className="font-mono font-bold text-text-primary w-14">{e.ticker}</span>
              <span className="num text-text-primary">
                ${e.strike} {e.type || e.option_type}
              </span>
              <span style={{ color }} className="font-semibold">
                {side}
              </span>
              <span className="text-text-muted italic">{action}</span>
              <span className="num text-text-muted">{e.expiry}</span>
              {dl && (
                <span
                  className="num px-1 rounded-full"
                  style={{ color: dl.color, background: dl.bg }}
                >
                  {dl.text}
                </span>
              )}
              {e.vol_oi_ratio > 0 && (
                <span className="text-accent-cyan num">
                  {Number(e.vol_oi_ratio).toFixed(1)}x
                </span>
              )}
              {e.ask_pct > 0 && (
                <span className="text-accent-orange num">{e.ask_pct}%ask</span>
              )}
              <GexWall ticker={e.ticker} strike={Number(e.strike) || null} showLabel />
              <span className="text-text-secondary ml-auto num">{e.premium}</span>
              <PnlBadge pnl={entryPnl(e, priceMap, date)} />
              {mega && <span className="text-xs font-bold text-accent-green">MEGA</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
