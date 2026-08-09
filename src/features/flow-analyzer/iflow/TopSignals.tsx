import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useIFlowEntries, useTickerPricesBatch } from "./hooks";
import { classifySide, dteTag, parsePremium } from "./utils";
import { entryPnl, PnlBadge } from "./TopPicks";
import { avgScore, setupScore } from "./EntryTape";
import { useTickerMeta } from "../../../api/tickerMeta";
import { useTickerTechnicals } from "../../../api/tickerTechnicals";
import { useTickerGex } from "../../../api/tickerGex";
import { GexWall, GexWallLegend } from "../../gex/GexWall";
import { useTaxonomy } from "../../../api/taxonomy";
import { useThemePulseScores } from "../../../api/intelGraph";
import type { DteFilter } from "./types";
import { matchesDte } from "./utils";

/** One synthesized signal: best contract per ticker by AVG(SETUP+ML). */
type Signal = {
  entry: any;
  ticker: string;
  side: "Bull" | "Bear";
  ml: number | null;
  setup: number | null;
  avg: number;
  rank: number;          // avg + theme-pulse tilt — ordering only
  pulse: number | null;  // per-ticker Theme Pulse play_score (0-100)
  reasons: string[];
  theme: string | null;
};

/**
 * Top Signals — the "what would the models trade today" digest.
 *
 * Sister card to TopPicks (Top Conviction Flow). TopPicks ranks by the
 * heuristic conviction score (premium × ask% × vol/OI); this ranks by
 * AVG(SETUP + ML) — contract quality (ML: P(doubles within 10 trading
 * days)) × directional agreement of the underlying (SETUP) — the pairing
 * the 2026-08-07 efficacy audit found strongest. One row per ticker
 * (best contract), top 5, each with the WHY spelled out.
 */
export function TopSignals({ date, dteFilter }: { date: string; dteFilter: DteFilter }) {
  const { data } = useIFlowEntries(date, undefined, true);
  const { data: tickerMeta } = useTickerMeta();
  const { data: tickerTech } = useTickerTechnicals();
  const { data: tickerGex } = useTickerGex();
  const { data: taxonomy } = useTaxonomy();
  const { data: pulseData } = useThemePulseScores();

  const themeByTicker = useMemo(() => {
    const m = new Map<string, string>();
    if (taxonomy?.taxonomy) {
      for (const themes of Object.values(taxonomy.taxonomy)) {
        for (const [theme, rows] of Object.entries(themes)) {
          for (const r of rows as any[]) {
            const tk = String(r.ticker || "").toUpperCase();
            if (tk && !m.has(tk)) m.set(tk, theme);
          }
        }
      }
    }
    return m;
  }, [taxonomy]);

  const signals = useMemo<Signal[]>(() => {
    if (!data?.entries?.length) return [];
    const best = new Map<string, Signal>();
    for (const e of data.entries as any[]) {
      const ticker = String(e.ticker || "").toUpperCase();
      if (!ticker || !matchesDte(e.dte, dteFilter)) continue;
      const ml = e.notable?.ml_score ?? null;
      const { side } = classifySide(e.type || e.option_type, e.ask_pct, e.vol_oi_ratio, e.side);
      const su = setupScore(side as "Bull" | "Bear", tickerMeta?.[ticker], tickerTech?.[ticker], tickerGex?.[ticker]);
      const avg = avgScore(su.score, ml);
      if (avg == null) continue;

      // Theme Pulse tilt (2026-08-07): per-ticker play_score from the daily
      // theme-pulse snapshots. +-5 rank points max — a hot theme breaks ties
      // toward its names, a cold one drags them down. Ordering only; the
      // displayed score stays AVG(SETUP, ML). Unvalidated as a predictor
      // (theme-heat ML features backtested ~0 AUC) — treated as context.
      const pulse = pulseData?.scores?.[ticker] ?? null;
      const tilt = pulse != null ? Math.max(-5, Math.min(5, (pulse - 50) / 10)) : 0;
      const rank = avg + tilt;

      const cur = best.get(ticker);
      if (cur && cur.rank >= rank) continue;

      const t = tickerTech?.[ticker];
      const reasons: string[] = [];
      if (ml != null) reasons.push(`ML ${ml} — contract quality (P of doubling ≤10td)`);
      if (su.score != null) {
        const bits: string[] = [];
        if (su.tech != null) bits.push(`trend ${su.tech >= 0 ? "+" : ""}${Math.round(su.tech * 100)}`);
        if (t?.pattern) bits.push(`${t.pattern} (${t.pattern_dir})`);
        if (su.tgt != null) bits.push(`analyst tgt ${su.tgt >= 0 ? "+" : ""}${Math.round(su.tgt * 25)}%`);
        if (su.gex != null) {
          const gx = tickerGex?.[ticker];
          bits.push(`dealer walls $${gx?.put_wall ?? "?"}-$${gx?.call_wall ?? "?"} (${su.gex >= 0 ? "room above" : "pressed at wall"})`);
        }
        reasons.push(`SETUP ${su.score} — ${bits.join(", ") || "underlying agrees"}`);
      }
      const prem = parsePremium(e.premium || "$0");
      const flowBits: string[] = [];
      if (prem >= 1e6) flowBits.push(`$${(prem / 1e6).toFixed(1)}M premium`);
      if ((e.ask_pct ?? 0) >= 90) flowBits.push(`${e.ask_pct}% at ask`);
      if ((e.vol_oi_ratio ?? 0) >= 3) flowBits.push(`${Number(e.vol_oi_ratio).toFixed(1)}x vol/OI`);
      if (flowBits.length) reasons.push(`Flow — ${flowBits.join(", ")}`);
      const sig = e.notable?.signals;
      const convBits: string[] = [];
      if (sig?.trader_same_dir_24h > 0) convBits.push(`${sig.trader_same_dir_24h} trader call${sig.trader_same_dir_24h > 1 ? "s" : ""} aligned`);
      if (sig?.news_24h > 0) convBits.push(`${sig.news_24h} news hit${sig.news_24h > 1 ? "s" : ""} 24h`);
      if (sig?.voices_7d > 0) convBits.push(`${sig.voices_7d} voices mention${sig.voices_7d > 1 ? "s" : ""}`);
      if (convBits.length) reasons.push(`Converging — ${convBits.join(", ")}`);
      if (pulse != null && pulse >= 65) reasons.push(`Theme Pulse ${pulse} — theme running hot`);
      else if (pulse != null && pulse <= 35) reasons.push(`Theme Pulse ${pulse} — theme cold`);

      best.set(ticker, {
        entry: e, ticker, side: side as "Bull" | "Bear",
        ml, setup: su.score, avg, rank, pulse, reasons,
        theme: themeByTicker.get(ticker) ?? null,
      });
    }
    return Array.from(best.values()).sort((a, b) => b.rank - a.rank).slice(0, 5);
  }, [data, dteFilter, tickerMeta, tickerTech, tickerGex, pulseData, themeByTicker]);

  const { data: priceData } = useTickerPricesBatch(signals.map((s) => s.ticker));
  const priceMap = priceData?.prices ?? {};

  if (!signals.length) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary mb-2 flex items-center gap-1.5">
        <Sparkles size={12} className="text-accent-cyan" />
        Top Signals — SETUP × ML ({signals.length})
      </h4>
      <GexWallLegend />
      <div className="space-y-1">
        {signals.map((s) => {
          const e = s.entry;
          const color = s.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          const dl = dteTag(e.dte);
          return (
            <div
              key={s.ticker}
              className="text-xs px-3 py-2 rounded-lg"
              style={{ background: "color-mix(in srgb, var(--bg-card) 70%, transparent)" }}
            >
              <div className="flex items-center gap-2">
                <span className="num text-xs font-bold text-accent-cyan w-6">{s.avg}</span>
                <span className="font-mono font-bold text-text-primary w-14">{s.ticker}</span>
                <span className="num text-text-primary">
                  ${e.strike} {e.type || e.option_type}
                </span>
                <span style={{ color }} className="font-semibold">{s.side}</span>
                <span className="num text-text-muted">{e.expiry}</span>
                {dl && (
                  <span className="num px-1 rounded-full" style={{ color: dl.color, background: dl.bg }}>
                    {dl.text}
                  </span>
                )}
                {s.theme && (
                  <span className="px-1.5 rounded-full text-[10px] text-text-secondary"
                        style={{ background: "color-mix(in srgb, var(--accent-cyan) 10%, transparent)" }}>
                    {s.theme}
                  </span>
                )}
                {s.pulse != null && s.pulse >= 65 && (
                  <span className="num px-1.5 rounded-full text-[10px] font-bold"
                        title={`Theme Pulse play score ${s.pulse}/100 — daily theme-level quant read`}
                        style={{ color: "var(--accent-orange)", background: "color-mix(in srgb, var(--accent-orange) 12%, transparent)" }}>
                    pulse {s.pulse}
                  </span>
                )}
                <GexWall ticker={s.ticker} strike={Number(e.strike) || null} showLabel />
                <span className="text-text-secondary ml-auto num">{e.premium}</span>
                <PnlBadge pnl={entryPnl(e, priceMap, date)} />
              </div>
              <div className="mt-1 pl-8 text-text-muted leading-relaxed">
                {s.reasons.join("  ·  ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
