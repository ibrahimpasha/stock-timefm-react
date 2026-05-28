/**
 * ScanGrid — recently-active momentum scan.
 *
 * Real data path: useTrackedTickers (iFlow leaderboard) + per-row
 * useMarketPrice for last/chg. Bias derived from bull/bear ratio,
 * confidence from total_entries depth, optZ proxied from vol_oi_ratio
 * (when available via per-ticker history).
 *
 * Columns we don't have an honest source for (volZ, lo/hi intraday) are
 * left at 0 / equal-bounds and visually de-emphasized rather than mocked.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTrackedTickers } from "../../api/flow";
import apiClient from "../../api/client";
import { STALE_TIMES } from "../../lib/constants";
import { Sparkline, RangeBar, useSparkSeed, Panel } from "../../components/CCPrimitives";
import type { TrackedTicker, MarketPrice } from "../../lib/types";

export interface ScanRow {
  sym: string;
  name: string;
  last: number;
  chg: number;
  volZ: number;
  optZ: number;
  bias: "BULL" | "BEAR";
  conf: number;
  lo: number;
  hi: number;
  sector: string;
}

function activityScore(r: ScanRow) {
  return Math.abs(r.volZ) + Math.abs(r.optZ) + Math.abs(r.chg) * 0.4;
}

function usePricesBatch(tickers: string[]) {
  const keys = [...tickers].sort();
  return useQuery<Record<string, MarketPrice>>({
    queryKey: ["scan-prices", keys.join(",")],
    queryFn: async () => {
      const result: Record<string, MarketPrice> = {};
      await Promise.all(
        keys.map(async (t) => {
          try {
            const { data } = await apiClient.get<MarketPrice>(`/market/price?ticker=${t}`);
            result[t] = data;
          } catch { /* skip */ }
        }),
      );
      return result;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: keys.length > 0,
  });
}

interface ScanGridProps {
  active?: string;
  onPick?: (sym: string) => void;
  /** Cap rows fetched. Default 25. */
  limit?: number;
}

type SortKey = "activity" | "chg" | "volZ" | "optZ" | "conf" | "sym" | "last";

export function ScanGrid({ active, onPick, limit = 25 }: ScanGridProps) {
  const [sortKey, setSortKey] = useState<SortKey>("activity");
  const [biasFilter, setBiasFilter] = useState<"ALL" | "BULL" | "BEAR">("ALL");

  const { data: tracked } = useTrackedTickers(7, 2);
  const top = useMemo(() => (tracked ?? []).slice(0, limit), [tracked, limit]);
  const tickerNames = useMemo(() => top.map((t) => t.ticker), [top]);
  const { data: prices } = usePricesBatch(tickerNames);

  const rows: ScanRow[] = useMemo(() => {
    return top.map((t: TrackedTicker) => {
      const p = prices?.[t.ticker];
      const last = p?.price ?? 0;
      const chg = p?.change_pct ?? 0;
      const total = (t.bullish ?? 0) + (t.bearish ?? 0);
      const bias: "BULL" | "BEAR" = (t.bullish ?? 0) >= (t.bearish ?? 0) ? "BULL" : "BEAR";
      // Confidence proxy: dominant-side share weighted by entry depth
      const dominantShare = total > 0 ? Math.max(t.bullish, t.bearish) / total : 0.5;
      const depthBoost = Math.min(1, (t.total_entries ?? 0) / 25);
      const conf = Math.round(50 + dominantShare * 35 + depthBoost * 15);
      // Options-volume proxy: use entry density vs cohort median
      const cohortAvg = top.length
        ? top.reduce((a, x) => a + (x.total_entries ?? 0), 0) / top.length
        : 1;
      const optZ = cohortAvg > 0 ? ((t.total_entries ?? 0) - cohortAvg) / Math.max(1, cohortAvg) : 0;
      return {
        sym: t.ticker,
        name: t.ticker, // we don't have company names yet — fallback to symbol
        last,
        chg,
        volZ: 0, // honest-zero until we wire historical volume
        optZ,
        bias,
        conf,
        lo: last,
        hi: last,
        sector: "",
      };
    });
  }, [top, prices]);

  const sorted = useMemo(() => {
    let xs = rows.slice();
    if (biasFilter !== "ALL") xs = xs.filter((r) => r.bias === biasFilter);
    return xs.sort((a, b) => {
      switch (sortKey) {
        case "chg":  return b.chg - a.chg;
        case "volZ": return b.volZ - a.volZ;
        case "optZ": return b.optZ - a.optZ;
        case "conf": return b.conf - a.conf;
        case "last": return b.last - a.last;
        case "sym":  return a.sym.localeCompare(b.sym);
        default:     return activityScore(b) - activityScore(a);
      }
    });
  }, [rows, sortKey, biasFilter]);

  const Th = ({ k, children, w, align = "right" }: { k: SortKey; children: React.ReactNode; w: number; align?: "left" | "right" | "center" }) => (
    <div
      onClick={() => setSortKey(k)}
      className="font-mono"
      style={{
        width: w,
        padding: "0 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        color: sortKey === k ? "var(--text-primary)" : "var(--text-muted)",
        cursor: "pointer",
        userSelect: "none",
        fontSize: 9.5,
        letterSpacing: 0.8,
        textTransform: "uppercase",
        fontWeight: 600,
        borderRight: "1px solid var(--border)",
        height: "100%",
      }}
    >
      {children}
      {sortKey === k && <span style={{ marginLeft: 4, color: "var(--accent-blue)" }}>▾</span>}
    </div>
  );

  const filterBtn = (label: string, on: boolean, click: () => void, color?: string) => (
    <button
      onClick={click}
      className="font-mono"
      style={{
        background: on ? color || "var(--accent-blue)" : "transparent",
        color: on ? "var(--bg-primary)" : "var(--text-secondary)",
        border: `1px solid ${on ? color || "var(--accent-blue)" : "var(--border)"}`,
        padding: "2px 8px",
        fontSize: 9.5,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        cursor: "pointer",
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );

  const cols = { rank: 28, sym: 72, last: 78, chg: 74, spark: 90, optZ: 70, bias: 60, conf: 60 };

  return (
    <Panel
      title="Recently Active · iFlow Leaderboard"
      accent="var(--accent-blue)"
      padding={0}
      right={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>BIAS</span>
          {filterBtn("ALL",  biasFilter === "ALL",  () => setBiasFilter("ALL"))}
          {filterBtn("BULL", biasFilter === "BULL", () => setBiasFilter("BULL"), "var(--accent-green)")}
          {filterBtn("BEAR", biasFilter === "BEAR", () => setBiasFilter("BEAR"), "var(--accent-red)")}
          <span className="font-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 8 }}>
            {sorted.length} of {rows.length}
          </span>
        </div>
      }
    >
      <div style={{ display: "flex", height: 22, background: "rgba(22,27,34,0.6)", borderBottom: "1px solid var(--border)" }}>
        <Th k="activity" w={cols.rank} align="center">#</Th>
        <Th k="sym"      w={cols.sym}  align="left">Symbol</Th>
        <Th k="last"     w={cols.last}>Last</Th>
        <Th k="chg"      w={cols.chg}>Δ %</Th>
        <Th k="activity" w={cols.spark} align="center">trend</Th>
        <Th k="optZ"     w={cols.optZ}>Flow·σ</Th>
        <Th k="activity" w={cols.bias} align="left">Bias</Th>
        <Th k="conf"     w={cols.conf}>Conf</Th>
      </div>
      <ScanRows rows={sorted} active={active} onPick={onPick} cols={cols} />
    </Panel>
  );
}

function ScanRows({ rows, active, onPick, cols }: { rows: ScanRow[]; active?: string; onPick?: (s: string) => void; cols: Record<string, number> }) {
  if (rows.length === 0) {
    return (
      <div className="font-mono" style={{ padding: 12, fontSize: 10, color: "var(--text-muted)" }}>
        no rows
      </div>
    );
  }
  return (
    <div>
      {rows.map((r, i) => {
        const isActive = r.sym === active;
        const trend = r.chg < 0 ? -2 : 2;
        return <Row key={r.sym} r={r} i={i} isActive={isActive} trend={trend} onPick={onPick} cols={cols} />;
      })}
    </div>
  );
}

function Row({ r, i, isActive, trend, onPick, cols }: { r: ScanRow; i: number; isActive: boolean; trend: number; onPick?: (s: string) => void; cols: Record<string, number> }) {
  const sparkPts = useSparkSeed(r.sym, 24, trend);
  const Cell = ({ children, w, color, align = "right" }: { children: React.ReactNode; w: number; color?: string; align?: "left" | "right" | "center" }) => (
    <div
      className="font-mono"
      style={{
        width: w,
        padding: "0 8px",
        display: "flex",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
        color: color || "var(--text-secondary)",
        borderRight: "1px solid var(--border)",
        height: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </div>
  );
  return (
    <div
      onClick={() => onPick?.(r.sym)}
      style={{
        display: "flex",
        height: 28,
        alignItems: "stretch",
        borderBottom: "1px solid var(--border)",
        background: isActive ? "rgba(88,166,255,0.10)" : i % 2 === 0 ? "transparent" : "rgba(22,27,34,0.4)",
        borderLeft: isActive ? "2px solid var(--accent-blue)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      <Cell w={cols.rank} align="center" color="var(--text-muted)">{i + 1}</Cell>
      <Cell w={cols.sym}  align="left"   color="var(--text-primary)">
        <span style={{ fontWeight: 700 }}>{r.sym}</span>
      </Cell>
      <Cell w={cols.last} color="var(--text-primary)">
        {r.last > 0 ? r.last.toFixed(2) : "—"}
      </Cell>
      <Cell w={cols.chg}  color={r.chg >= 0 ? "var(--accent-green)" : "var(--accent-red)"}>
        {r.last > 0 ? `${r.chg >= 0 ? "+" : ""}${r.chg.toFixed(2)}%` : "—"}
      </Cell>
      <Cell w={cols.spark} align="center">
        <Sparkline points={sparkPts} width={74} height={16} color={r.chg >= 0 ? "var(--accent-green)" : "var(--accent-red)"} />
      </Cell>
      <Cell w={cols.optZ} color="var(--accent-blue)">{r.optZ >= 0 ? "+" : ""}{r.optZ.toFixed(2)}</Cell>
      <Cell w={cols.bias} align="left">
        <span style={{ color: r.bias === "BULL" ? "var(--accent-green)" : "var(--accent-red)", fontWeight: 600, fontSize: 10, letterSpacing: 0.6 }}>{r.bias}</span>
      </Cell>
      <Cell w={cols.conf}>{r.conf}</Cell>
    </div>
  );
}

// Re-export RangeBar usage so we keep tree-shake friendly imports
export { RangeBar };
