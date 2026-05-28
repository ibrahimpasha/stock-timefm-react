import { TrendingUp } from "lucide-react";
import { formatDate } from "../../../lib/utils";
import { classifySide, dteTag, matchesDte, parsePremium, scoreEntry } from "./utils";
import { useIFlowEntries } from "./hooks";
import type { DteFilter } from "./types";

/**
 * Top conviction entries for a single date. Renders nothing unless at least
 * one entry scores >=6.0 (see `scoreEntry` for the bucket boundaries).
 */
export function TopPicks({ date, dteFilter }: { date: string; dteFilter: DteFilter }) {
  const { data } = useIFlowEntries(date);
  if (!data?.entries?.length) return null;
  const scored = data.entries
    .filter((e: any) => e.ticker && (e.vol_oi_ratio > 0 || e.ask_pct > 0))
    .filter((e: any) => matchesDte(e.dte, dteFilter))
    .map((e: any) => ({ ...e, _score: scoreEntry(e) }))
    .filter((e: any) => e._score >= 6.0)
    .sort((a: any, b: any) => b._score - a._score)
    .slice(0, 15);
  if (!scored.length) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-accent-green uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <TrendingUp size={12} /> Top Conviction Flow — {formatDate(date)} ({scored.length})
      </h4>
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
                background: mega ? "rgba(63,185,80,0.08)" : "rgba(48,54,61,0.12)",
                border: mega ? "1px solid rgba(63,185,80,0.25)" : "1px solid transparent",
              }}
            >
              <span className="font-mono text-xs font-bold text-accent-cyan w-6">
                {e._score.toFixed(1)}
              </span>
              <span className="font-mono font-bold text-text-primary w-14">{e.ticker}</span>
              <span className="font-mono text-text-primary">
                ${e.strike} {e.type || e.option_type}
              </span>
              <span style={{ color }} className="font-semibold">
                {side}
              </span>
              <span className="text-text-muted italic">{action}</span>
              <span className="text-text-muted">{e.expiry}</span>
              {dl && (
                <span
                  className="font-mono px-1 rounded"
                  style={{ color: dl.color, background: dl.bg }}
                >
                  {dl.text}
                </span>
              )}
              {e.vol_oi_ratio > 0 && (
                <span className="text-accent-cyan font-mono">
                  {Number(e.vol_oi_ratio).toFixed(1)}x
                </span>
              )}
              {e.ask_pct > 0 && (
                <span className="text-accent-orange font-mono">{e.ask_pct}%ask</span>
              )}
              <span className="text-text-secondary ml-auto font-mono">{e.premium}</span>
              {mega && <span className="text-xs font-bold text-accent-green">MEGA</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
