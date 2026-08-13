/**
 * Dealer-positioning matrix — strikes down, expiries across.
 *
 * The existing GEX surface (`/market/ticker-gex`) collapses each ticker to a
 * single put/call wall, which loses the shape traders actually read: WHERE
 * along the chain dealer gamma concentrates, and how that shifts as you walk
 * out the expiry curve. This renders the whole grid.
 *
 * Metrics all come from one fetch (`/market/gex-matrix`):
 *   GEX      net dealer $gamma per 1% move (dealers long calls, short puts)
 *   VEX      net dealer $vega per vol point
 *   OI       total open interest at the strike
 *   VOL      today's contracts traded
 *   UNUSUAL  volume / open interest — new positioning vs legacy
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { GlassPanel, Chip, Segmented } from "../components/Glass";
import {
  useGexMatrix,
  useGexTickers,
  useGexRefresh,
  type GexMetric,
  type GexCell,
} from "../api/rotation";

const METRICS: { value: GexMetric; label: string }[] = [
  { value: "gex", label: "GEX" },
  { value: "vex", label: "VEX" },
  { value: "oi", label: "OI" },
  { value: "vol", label: "VOL" },
  { value: "unusual", label: "UNUSUAL" },
];

const BANDS: { value: string; label: string }[] = [
  { value: "10", label: "±10" },
  { value: "20", label: "±20" },
  { value: "40", label: "±40" },
];

const EXPIRY_COUNTS: { value: string; label: string }[] = [
  { value: "4", label: "4" },
  { value: "8", label: "8" },
];

/** Compact money: 11_400_000 → "+$11M". Signed, because sign is the signal. */
function money(v: number): string {
  const a = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

function count(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}K`;
  return String(v);
}

function cellValue(c: GexCell | undefined, metric: GexMetric): number | null {
  if (!c) return null;
  switch (metric) {
    case "gex": return c.gex;
    case "vex": return c.vex;
    case "oi": return c.oi;
    case "vol": return c.vol;
    case "unusual": return c.unusual;
  }
}

function formatValue(v: number | null, metric: GexMetric): string {
  if (v === null || v === 0) return "·";
  if (metric === "gex" || metric === "vex") return money(v);
  if (metric === "unusual") return `${v.toFixed(2)}×`;
  return count(v);
}

export function GexMatrixPage() {
  const { data: tickers } = useGexTickers();
  const [params, setParams] = useSearchParams();
  // ?ticker= lets the inline GexWall bars on flow/signal/persona rows deep-link
  // straight into the grid for the name you were already looking at.
  const [ticker, setTicker] = useState(params.get("ticker")?.toUpperCase() || "SPY");
  useEffect(() => {
    const q = params.get("ticker")?.toUpperCase();
    if (q && q !== ticker) setTicker(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const [query, setQuery] = useState("");
  const refresh = useGexRefresh();
  const qc = useQueryClient();
  const [metric, setMetric] = useState<GexMetric>("gex");
  const [band, setBand] = useState("20");
  const [nExp, setNExp] = useState("8");

  const { data, isLoading, refetch } = useGexMatrix(ticker, Number(nExp), Number(band));

  /* The build runs as a detached subprocess, so there's nothing to await —
   * poll until cells land, then stop. Capped so a ticker with no chain at all
   * (bad symbol, no listed options) doesn't poll forever. */
  const building = refresh.isPending || (refresh.isSuccess && !data?.ok);
  // The mutation resolves the moment the subprocess is spawned, so the chip
  // list invalidated then would still be missing the new ticker. Re-invalidate
  // once the grid actually lands.
  useEffect(() => {
    if (refresh.isSuccess && data?.ok) {
      qc.invalidateQueries({ queryKey: ["gex-matrix-tickers"] });
      refresh.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh.isSuccess, data?.ok]);
  useEffect(() => {
    if (!building) return;
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > 15) return clearInterval(id);
      refetch();
    }, 2000);
    return () => clearInterval(id);
  }, [building, refetch]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const tk = query.trim().toUpperCase();
    if (!tk) return;
    setTicker(tk);
    setParams({ ticker: tk });
    setQuery("");
  };

  /* Heat is scaled to the strongest cell currently on screen, so the grid
   * stays readable whether you're looking at SPY or a $2B small cap. */
  const peak = useMemo(() => {
    if (!data?.ok) return 1;
    const vals = Object.values(data.cells)
      .map((c) => Math.abs(cellValue(c, metric) ?? 0))
      .filter((v) => v > 0)
      .sort((a, b) => b - a);
    // 95th percentile, not the max — one 0DTE monster shouldn't flatten the rest
    return vals[Math.floor(vals.length * 0.05)] || vals[0] || 1;
  }, [data, metric]);

  const spot = data?.spot ?? 0;
  const atmStrike = useMemo(() => {
    if (!data?.ok || !spot) return null;
    return data.strikes.reduce<number | null>(
      (best, k) => (best === null || Math.abs(k - spot) < Math.abs(best - spot) ? k : best),
      null,
    );
  }, [data, spot]);

  const header = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto">
      <Segmented options={METRICS} value={metric} onChange={setMetric} ariaLabel="Metric" />
      <Segmented options={BANDS} value={band} onChange={setBand} ariaLabel="Strike band" />
      <Segmented options={EXPIRY_COUNTS} value={nExp} onChange={setNExp} ariaLabel="Expiries" />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <GlassPanel
        title="Dealer Positioning Matrix"
        actions={
          <div className="flex items-center gap-2">
            {data?.ok && (
              <>
                <Chip tone="cyan">{data.ticker} ${spot.toFixed(2)}</Chip>
                <Chip tone="neutral">{data.updated_at?.slice(0, 16).replace("T", " ")}</Chip>
              </>
            )}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="mobile-horizontal-strip flex w-full min-w-0 gap-1 overflow-x-auto lg:w-auto lg:flex-wrap lg:overflow-visible">
            {(tickers ?? []).map((t) => (
              <button
                key={t.ticker}
                type="button"
                onClick={() => { setTicker(t.ticker); setParams({ ticker: t.ticker }); }}
                aria-pressed={t.ticker === ticker}
                className={`min-h-11 shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors lg:min-h-0 ${
                  t.ticker === ticker
                    ? "bg-accent-cyan/15 text-accent-cyan"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
                }`}
              >
                {t.ticker}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex items-center gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="any ticker…"
              aria-label="Look up a ticker's dealer positioning"
              className="min-h-11 w-28 px-2 py-1 rounded-full text-xs bg-bg-card border border-border lg:min-h-0
                         text-text-primary placeholder:text-text-muted focus:outline-none
                         focus:border-accent-cyan num"
            />
          </form>
          <div className="w-full min-w-0 lg:ml-auto lg:w-auto">{header}</div>
        </div>

        {isLoading && !data && (
          <p className="text-xs text-text-muted animate-pulse">loading chain…</p>
        )}

        {data && !data.ok && (
          <div className="py-4 flex flex-col items-start gap-2">
            <p className="text-xs text-text-muted">
              No grid for <span className="num font-bold text-text-primary">{ticker}</span> yet —
              the nightly build covers the anchors, your book and the top flow names only.
            </p>
            <button
              type="button"
              disabled={building}
              onClick={() => refresh.mutate(ticker)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                         bg-accent-cyan/15 text-accent-cyan hover:bg-accent-cyan/25
                         disabled:opacity-60"
            >
              {building ? `building ${ticker}…` : `Build ${ticker} now`}
            </button>
            {building && (
              <p className="text-[10px] text-text-muted">
                Pulling 8 option chains — usually 5-10s. This page refreshes itself.
              </p>
            )}
          </div>
        )}

        {data?.ok && (
          <div className="overflow-x-auto">
            {/* max-w keeps cells from stretching to absurd widths when a ticker
                only has a few expiries loaded */}
            <table className="text-xs border-separate w-full max-w-5xl" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="text-left font-medium text-[10px] uppercase tracking-wider text-text-muted px-2 sticky left-0 bg-bg-primary z-10 w-20">
                    Strike
                  </th>
                  {data.expiries.map((e) => {
                    const [d, tag] = e.label.split(" ");
                    return (
                      <th key={e.expiry} className="px-2 py-1 min-w-[92px]">
                        <div
                          className="num font-semibold"
                          style={{ color: e.is_0dte ? "var(--accent-orange)" : "var(--text-primary)" }}
                        >
                          {d}
                        </div>
                        <div className="text-[10px] text-text-muted font-normal num">{tag}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.strikes.map((k) => {
                  const isAtm = k === atmStrike;
                  return (
                    <tr key={k}>
                      <td
                        className="px-2 num text-right sticky left-0 bg-bg-primary z-10 whitespace-nowrap"
                        style={{
                          color: isAtm ? "var(--accent-cyan)" : "var(--text-secondary)",
                          fontWeight: isAtm ? 700 : 400,
                        }}
                      >
                        {isAtm && <span aria-label="at the money">▸ </span>}
                        {k}
                      </td>
                      {data.expiries.map((e) => {
                        const c = data.cells[`${e.expiry}|${k}`];
                        const v = cellValue(c, metric);
                        const mag = Math.min(1, Math.abs(v ?? 0) / peak);
                        const signed = metric === "gex" || metric === "vex";
                        const tone =
                          signed && (v ?? 0) < 0 ? "var(--accent-red)" : "var(--accent-green)";
                        return (
                          <td
                            key={e.expiry}
                            className="px-2 py-1.5 text-center num rounded"
                            title={
                              c
                                ? `${k} ${e.label} — ${spot ? `${k >= spot ? "+" : ""}${(((k - spot) / spot) * 100).toFixed(1)}% to strike` : ""}`
                                  + `${c.delta != null ? ` · call Δ ${c.delta.toFixed(2)}` : ""}`
                                  + ` · OI ${c.oi} (C ${c.call_oi}/P ${c.put_oi}), vol ${c.vol}`
                                  + ` — gamma is positioning, not P(profit)`
                                : undefined
                            }
                            style={{
                              background:
                                mag > 0.02
                                  ? `color-mix(in srgb, ${tone} ${Math.round(mag * 34)}%, var(--bg-card))`
                                  : "var(--bg-card)",
                              color: mag > 0.25 ? tone : "var(--text-secondary)",
                              fontWeight: mag > 0.25 ? 600 : 400,
                              border: `1px solid ${
                                mag > 0.6
                                  ? `color-mix(in srgb, ${tone} 45%, transparent)`
                                  : "transparent"
                              }`,
                            }}
                          >
                            {formatValue(v, metric)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr>
                    <td className="px-2 text-[10px] uppercase tracking-wider text-text-muted sticky left-0 bg-bg-primary z-10">
                      Net
                    </td>
                    {data.expiries.map((e) => {
                      const t = data.totals?.[e.expiry];
                      const v = t?.gex ?? 0;
                      return (
                        <td key={e.expiry} className="px-2 py-1.5 text-center num font-semibold"
                            style={{ color: v >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                          {money(v)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </GlassPanel>

      <p className="text-[10px] text-text-muted px-1">
        Sign convention: dealers long calls, short puts. Positive (green) gamma dampens moves
        through that strike; negative (red) amplifies them. <strong>Green is dealer positioning,
        not a buy signal</strong> — a big green cell often acts as a magnet/pin, and a call there
        still needs spot to travel to it. Hover any cell for the % move required and the
        call&apos;s delta. Greeks are Black-Scholes from each
        chain's own implied vol — yfinance does not publish them. Refreshed by
        <code className="num"> scripts/backfill_gex_matrix.py</code> on the daily timer, so the
        grid is end-of-day positioning, not a live tape.
      </p>
    </div>
  );
}
