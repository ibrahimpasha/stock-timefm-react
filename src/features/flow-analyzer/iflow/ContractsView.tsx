/**
 * Watched-contracts view — renders a compact row per `WatchedContract` from
 * the Zustand store.
 *
 * Data path:
 *   - Group watched contracts by ticker.
 *   - For each unique ticker, fire a /flow/iflow/entries-export?days=30 fetch
 *     (server-side cached, 10min client staleTime, parallel via useQueries).
 *   - Aggregate matching entries per contract (key = strike + opt_type + normExpiry).
 *
 * Rendered stats per row:
 *   N hits  ·  X days seen  ·  avg ask%  ·  total premium  ·  latest hit Xd ago
 *
 * Click a row → selects the ticker in the main grid (parent handles).
 * Star → unwatches (removes from store).
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Star, X as XIcon } from "lucide-react";
import apiClient from "../../../api/client";
import { useAppStore, type WatchedContract } from "../../../store/useAppStore";
import { formatPremium } from "../../../lib/utils";
import { normExpiry, dteTag, parsePremium } from "./utils";

interface AggStats {
  hits: number;
  days_seen: number;
  avg_ask: number | null;
  total_premium: number;
  latest_date: string | null;
  /** estimated P/L of the latest hit (or null) */
  latest_pnl: number | null;
  /** Latest underlying close at fill (for context) */
  latest_underlying: number | null;
}

function contractKey(c: { ticker: string; strike: number; opt_type: string; expiry_norm: string }) {
  return `${c.ticker}|${c.strike}|${c.opt_type}|${c.expiry_norm}`;
}

function relDays(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  const days = Math.round((Date.now() - dt.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function dteFromExpiry(expiry: string | null): number {
  // Convert "M/D" to dte by parsing roughly with current year. Fallback to 30.
  if (!expiry) return 30;
  const md = expiry.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!md) return 30;
  const m = parseInt(md[1], 10);
  const d = parseInt(md[2], 10);
  if (!m || !d) return 30;
  const now = new Date();
  let y = now.getFullYear();
  let dt = new Date(y, m - 1, d);
  // If the date is in the past by >30d, assume next year.
  if (dt.getTime() < now.getTime() - 30 * 86_400_000) {
    y += 1;
    dt = new Date(y, m - 1, d);
  }
  return Math.max(0, Math.round((dt.getTime() - now.getTime()) / 86_400_000));
}

export function ContractsView({
  onSelectTicker,
}: {
  onSelectTicker: (ticker: string) => void;
}) {
  const watchedContracts = useAppStore((s) => s.watchedContracts);
  const toggleWatchedContract = useAppStore((s) => s.toggleWatchedContract);

  // Group by ticker → fire one /entries-export call per ticker.
  const tickers = useMemo(
    () => Array.from(new Set(watchedContracts.map((c) => c.ticker))).sort(),
    [watchedContracts],
  );

  const queries = useQueries({
    queries: tickers.map((t) => ({
      queryKey: ["ticker-flow-export", t, 30],
      queryFn: () =>
        apiClient
          .get(`/flow/iflow/entries-export?days=30&tickers=${encodeURIComponent(t)}`)
          .then((r) => r.data as { entries: any[] }),
      staleTime: 10 * 60_000,
      enabled: !!t,
    })),
  });

  // Aggregate entries → per-contract stats.
  const statsByKey = useMemo(() => {
    const map: Record<string, AggStats> = {};
    queries.forEach((q) => {
      const entries = q.data?.entries || [];
      for (const e of entries) {
        const strike = Number(e.strike) || 0;
        const optType = String(e.type || e.option_type || "").toUpperCase();
        const ot = optType.includes("PUT") ? "PUT" : "CALL";
        const exp = normExpiry(e.expiry) || String(e.expiry || "");
        const tk = String(e.ticker || "").toUpperCase();
        const key = `${tk}|${strike}|${ot}|${exp}`;
        if (!map[key]) {
          map[key] = {
            hits: 0,
            days_seen: 0,
            avg_ask: null,
            total_premium: 0,
            latest_date: null,
            latest_pnl: null,
            latest_underlying: null,
          };
        }
        const s = map[key];
        s.hits += 1;
        s.total_premium += parsePremium(e.premium || "$0");
        if (typeof e.ask_pct === "number") {
          s.avg_ask = ((s.avg_ask ?? 0) * (s.hits - 1) + e.ask_pct) / s.hits;
        }
        const dt = e.date || "";
        if (!s.latest_date || dt > s.latest_date) {
          s.latest_date = dt;
          s.latest_pnl = typeof e.est_pnl_pct === "number" ? e.est_pnl_pct : null;
          s.latest_underlying = typeof e.underlying_at_fill === "number" ? e.underlying_at_fill : null;
        }
      }
    });
    // Compute days_seen per key (distinct dates).
    queries.forEach((q) => {
      const entries = q.data?.entries || [];
      const byKey: Record<string, Set<string>> = {};
      for (const e of entries) {
        const strike = Number(e.strike) || 0;
        const optType = String(e.type || e.option_type || "").toUpperCase();
        const ot = optType.includes("PUT") ? "PUT" : "CALL";
        const exp = normExpiry(e.expiry) || String(e.expiry || "");
        const tk = String(e.ticker || "").toUpperCase();
        const key = `${tk}|${strike}|${ot}|${exp}`;
        if (!byKey[key]) byKey[key] = new Set();
        if (e.date) byKey[key].add(e.date);
      }
      for (const k of Object.keys(byKey)) {
        if (map[k]) map[k].days_seen = byKey[k].size;
      }
    });
    return map;
  }, [queries]);

  // Sort: active expiry first (dte >= 0), most-recent hit first inside each bucket.
  const sortedContracts = useMemo(() => {
    const arr = [...watchedContracts];
    arr.sort((a, b) => {
      const dteA = dteFromExpiry(a.expiry_norm);
      const dteB = dteFromExpiry(b.expiry_norm);
      const expiredA = dteA <= 0 ? 1 : 0;
      const expiredB = dteB <= 0 ? 1 : 0;
      if (expiredA !== expiredB) return expiredA - expiredB;
      const sa = statsByKey[contractKey(a)];
      const sb = statsByKey[contractKey(b)];
      const dA = sa?.latest_date || "";
      const dB = sb?.latest_date || "";
      if (dA !== dB) return dB.localeCompare(dA);
      return a.ticker.localeCompare(b.ticker);
    });
    return arr;
  }, [watchedContracts, statsByKey]);

  const anyLoading = queries.some((q) => q.isFetching && !q.data);

  if (watchedContracts.length === 0) {
    return (
      <div className="card text-center py-10 text-text-muted">
        <Star size={22} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No watched contracts yet.</p>
        <p className="text-xs mt-1 opacity-70">
          Click the ★ next to a flow row in the ticker detail to watch its contract.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-accent-orange">
          <Star size={12} style={{ fill: "var(--accent-orange)" }} />
          Watched Contracts ({watchedContracts.length})
        </h4>
        {anyLoading && (
          <span className="text-[10px] text-text-muted animate-pulse">loading flow…</span>
        )}
      </div>
      <div className="space-y-1">
        {sortedContracts.map((c) => {
          const key = contractKey(c);
          const stats = statsByKey[key];
          const dte = dteFromExpiry(c.expiry_norm);
          const expired = dte <= 0;
          const dl = dteTag(dte);
          const hits = stats?.hits ?? 0;
          const noFlow = hits === 0;
          return (
            <div
              key={key}
              onClick={() => onSelectTicker(c.ticker)}
              className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-border bg-bg-card cursor-pointer hover:border-accent-blue/40 transition-colors"
              style={{ opacity: expired ? 0.55 : 1 }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWatchedContract(c);
                }}
                className="p-0.5 -ml-0.5 rounded hover:bg-white/5 transition-colors shrink-0"
                title="Unwatch contract"
              >
                <Star
                  size={11}
                  style={{ color: "var(--accent-orange)", fill: "var(--accent-orange)" }}
                />
              </button>
              <span className="font-mono font-bold text-text-primary w-14 shrink-0">{c.ticker}</span>
              <span
                className="font-mono shrink-0"
                style={{
                  color: c.opt_type === "CALL" ? "var(--accent-green)" : "var(--accent-red)",
                }}
              >
                ${c.strike} {c.opt_type === "CALL" ? "C" : "P"}
              </span>
              <span className="text-text-muted font-mono w-12 shrink-0">{c.expiry_norm}</span>
              {dl && (
                <span
                  className="font-mono px-1 rounded shrink-0"
                  style={{ color: dl.color, background: dl.bg }}
                >
                  {expired ? "EXP" : dl.text}
                </span>
              )}
              {noFlow ? (
                <span className="text-text-muted italic ml-2">
                  {anyLoading ? "…" : "no hits in 30d"}
                </span>
              ) : (
                <>
                  <span className="text-accent-cyan font-mono ml-2">
                    {hits} hit{hits === 1 ? "" : "s"}
                  </span>
                  {stats!.days_seen > 1 && (
                    <span className="text-text-muted font-mono">
                      · {stats!.days_seen}d
                    </span>
                  )}
                  {stats!.avg_ask !== null && (
                    <span className="text-accent-orange font-mono">
                      {Math.round(stats!.avg_ask)}%ask
                    </span>
                  )}
                  <span className="text-text-secondary font-mono">
                    {formatPremium(stats!.total_premium)}
                  </span>
                  {stats!.latest_pnl !== null && (
                    <span
                      className="font-mono"
                      style={{
                        color:
                          stats!.latest_pnl >= 0
                            ? "var(--accent-green)"
                            : "var(--accent-red)",
                      }}
                    >
                      {stats!.latest_pnl >= 0 ? "+" : ""}
                      {stats!.latest_pnl.toFixed(1)}%
                    </span>
                  )}
                  <span className="text-text-muted font-mono ml-auto">
                    {relDays(stats!.latest_date)}
                  </span>
                </>
              )}
              {noFlow && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWatchedContract(c);
                  }}
                  className="ml-auto p-0.5 rounded hover:bg-white/5 text-text-muted"
                  title="Remove"
                >
                  <XIcon size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
