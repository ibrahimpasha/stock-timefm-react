import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { TrendingUp, TrendingDown, AlertTriangle, Eye } from "lucide-react";

interface WatchlistEntry {
  ticker: string;
  strike: number | string;
  option_type: string;
  expiry: string;
  side: string;
  ref_premium: number;
  gate_price?: number | null;
  score: number;
  source?: string;
  list?: string;
  added_at?: string;
}

interface IFlowWatchlist {
  wla: WatchlistEntry[];
  wlb: WatchlistEntry[];
}

function useWatchlist() {
  return useQuery<IFlowWatchlist>({
    queryKey: ["iflow-trader-watchlist"],
    queryFn: () => apiClient.get("/iflow-trader/watchlist").then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function useTickerPrices(tickers: string[]) {
  return useQuery<Record<string, number>>({
    queryKey: ["missed-prices", tickers.join(",")],
    queryFn: async () => {
      const prices: Record<string, number> = {};
      const fetches = tickers.slice(0, 30).map(async (t) => {
        try {
          const { data } = await apiClient.get(`/market/price?ticker=${t}`);
          prices[t] = data.price || 0;
        } catch { /* skip */ }
      });
      await Promise.all(fetches);
      return prices;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: tickers.length > 0,
  });
}

/**
 * Estimate the "what-if" P/L if we had taken this WL entry.
 * Uses delta approximation based on moneyness + simple time decay.
 */
function estimatePnl(currentPrice: number, strike: number, optionType: string, refPremium: number): number | null {
  if (!currentPrice || !strike || !refPremium) return null;
  const isPut = (optionType || "").toUpperCase().includes("PUT");
  const intrinsic = isPut
    ? Math.max(0, strike - currentPrice)
    : Math.max(0, currentPrice - strike);
  const otmPct = isPut
    ? (currentPrice - strike) / strike
    : (strike - currentPrice) / strike;

  let pnlMultiplier: number;
  if (otmPct < -0.05) {
    pnlMultiplier = (intrinsic + refPremium * 0.15) / refPremium - 1;
  } else if (otmPct < 0.02) {
    pnlMultiplier = -otmPct * 3;
  } else {
    pnlMultiplier = -0.1 - otmPct * 2;
  }
  const pnlPct = pnlMultiplier * 100;
  return Math.round(Math.max(-99, Math.min(pnlPct, 999)));
}

export function MissedOpportunities() {
  const { data: wl, isLoading } = useWatchlist();

  const candidates = useMemo(() => {
    if (!wl) return [];
    // Combine WL-A (didn't fill) + WL-B (didn't promote) with score >= 7
    const wla = (wl.wla || []).map((e) => ({ ...e, list: "WL-A" as const }));
    const wlb = (wl.wlb || [])
      .filter((e) => (e.score || 0) >= 7)
      .map((e) => ({ ...e, list: "WL-B" as const }));
    return [...wla, ...wlb].sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [wl]);

  const tickers = useMemo(() => [...new Set(candidates.map((c) => c.ticker))], [candidates]);
  const { data: prices } = useTickerPrices(tickers);

  if (isLoading) {
    return (
      <div className="text-xs text-text-muted py-8 text-center">
        Loading watchlist...
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="text-xs text-text-muted py-8 text-center">
        No high-conviction missed opportunities right now
      </div>
    );
  }

  // Compute estimated P/L for each
  const enriched = candidates.map((c) => {
    const price = prices?.[c.ticker] || 0;
    const refPrem = typeof c.ref_premium === "number" ? c.ref_premium : parseFloat(String(c.ref_premium)) || 0;
    const strike = typeof c.strike === "number" ? c.strike : parseFloat(String(c.strike)) || 0;
    const pnl = estimatePnl(price, strike, c.option_type, refPrem);
    return { ...c, estimatedPnl: pnl, currentPrice: price };
  }).sort((a, b) => {
    // Prioritize: biggest hypothetical winners first, then by score
    const ap = a.estimatedPnl ?? -200;
    const bp = b.estimatedPnl ?? -200;
    if (Math.abs(bp - ap) > 5) return bp - ap;
    return (b.score || 0) - (a.score || 0);
  });

  const wouldHaveProfited = enriched.filter((e) => e.estimatedPnl !== null && e.estimatedPnl > 20);
  const wouldHaveLost = enriched.filter((e) => e.estimatedPnl !== null && e.estimatedPnl < -20);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs font-semibold text-accent-orange uppercase tracking-wider flex items-center gap-1.5">
          <Eye size={12} /> Missed Opportunities ({enriched.length})
        </h4>
        <div className="flex items-center gap-3 text-xs">
          {wouldHaveProfited.length > 0 && (
            <span>
              <span className="text-text-muted">Big winners missed:</span>{" "}
              <span className="font-mono font-bold text-accent-green">{wouldHaveProfited.length}</span>
            </span>
          )}
          {wouldHaveLost.length > 0 && (
            <span>
              <span className="text-text-muted">Avoided losers:</span>{" "}
              <span className="font-mono font-bold text-accent-red">{wouldHaveLost.length}</span>
            </span>
          )}
        </div>
      </div>

      <div className="text-xs text-text-muted">
        WL-A entries that haven't filled + WL-B entries scoring 7+. Estimated P/L assumes
        we entered at ref premium and shows current "what-if" value.
      </div>

      <div className="space-y-1">
        {enriched.map((e, i) => {
          const isBull = e.option_type === "CALL" || e.option_type === "C";
          const SideIcon = isBull ? TrendingUp : TrendingDown;
          const sideColor = isBull ? "var(--accent-green)" : "var(--accent-red)";
          const pnlColor = (e.estimatedPnl ?? 0) >= 0 ? "var(--accent-green)" : "var(--accent-red)";
          const isHighlighted = (e.estimatedPnl ?? 0) > 50;
          const refPremDisplay = typeof e.ref_premium === "number" ? e.ref_premium.toFixed(2) : e.ref_premium;

          return (
            <div
              key={`${e.ticker}_${e.strike}_${e.expiry}_${i}`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
              style={{
                background: isHighlighted ? "rgba(63,185,80,0.06)" : "rgba(48,54,61,0.12)",
                border: isHighlighted ? "1px solid rgba(63,185,80,0.3)" : "1px solid transparent",
                borderLeft: e.list === "WL-A" ? "3px solid var(--accent-green)" : "3px solid var(--accent-orange)",
              }}
            >
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: e.list === "WL-A" ? "rgba(63,185,80,0.15)" : "rgba(227,127,46,0.15)",
                  color: e.list === "WL-A" ? "var(--accent-green)" : "var(--accent-orange)",
                }}
              >
                {e.list}
              </span>
              <span className="font-mono text-xs font-bold text-accent-cyan w-8">{e.score?.toFixed(1)}</span>
              <SideIcon size={11} style={{ color: sideColor }} />
              <span className="font-mono font-bold text-text-primary w-12">{e.ticker}</span>
              <span className="font-mono text-text-primary">${e.strike} {e.option_type}</span>
              <span className="text-text-muted">{e.expiry}</span>
              {e.currentPrice > 0 && (
                <span className="text-text-muted font-mono text-[10px]">
                  spot ${e.currentPrice.toFixed(2)}
                </span>
              )}
              <span className="text-text-muted text-[10px]">ref ${refPremDisplay}</span>
              {e.estimatedPnl !== null ? (
                <span className="ml-auto flex items-center gap-1">
                  {isHighlighted && <AlertTriangle size={11} style={{ color: "var(--accent-green)" }} />}
                  <span
                    className="font-mono text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ color: pnlColor, background: `${pnlColor}12` }}
                  >
                    {(e.estimatedPnl ?? 0) >= 0 ? "+" : ""}{e.estimatedPnl}%
                  </span>
                </span>
              ) : (
                <span className="ml-auto text-[10px] text-text-muted italic">no price</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
