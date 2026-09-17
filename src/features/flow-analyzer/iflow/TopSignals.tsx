import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useIFlowEntries, useTickerPricesBatch } from "./hooks";
import {
  canShowMlProbability,
  classifySide,
  dteTag,
  parsePremium,
  researchRank,
} from "./utils";
import { entryPnl, PnlBadge } from "./TopPicks";
import { setupScore } from "./EntryTape";
import { useTickerMeta } from "../../../api/tickerMeta";
import { useTickerTechnicals } from "../../../api/tickerTechnicals";
import { useTickerGex } from "../../../api/tickerGex";
import { GexWall, GexWallLegend } from "../../gex/GexWall";
import { useTaxonomy } from "../../../api/taxonomy";
import { useThemePulseScores } from "../../../api/intelGraph";
import { Chip } from "../../../components/Glass";
import { formatPremium } from "../../../lib/utils";
import type { DteFilter, NotableScore } from "./types";
import { matchesDte } from "./utils";

/** One synthesized signal: best contract per ticker by Research Rank. */
type Signal = {
  entry: any;
  ticker: string;
  side: "Bull" | "Bear";
  ml: number | null;
  mlProbability: number | null;
  setup: number | null;
  evidence: number | null;
  servingMode: string | null;
  research: number;
  tilt: number;
  pulse: number | null;  // per-ticker Theme Pulse play_score (0-100)
  reasons: string[];
  theme: string | null;
};

/**
 * Top Signals — the "what would the models trade today" digest.
 *
 * Sister card to TopPicks (Top Conviction Flow). TopPicks ranks by the
 * heuristic conviction score (premium x ask% x vol/OI). This list uses a
 * transparent Research Rank: an evidence/setup base with ML influence bounded
 * by its serving approval. Theme Pulse is displayed as context, not used to
 * sort.
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
      const notable = e.notable as NotableScore | null | undefined;
      const ml = notable?.ml_score ?? null;
      const probabilityAllowed = canShowMlProbability(
        notable?.ml_gate_approved,
        notable?.ml_calibration_status,
      );
      const mlProbability = probabilityAllowed ? notable?.ml_prob ?? null : null;
      const { side } = classifySide(e.type || e.option_type, e.ask_pct, e.vol_oi_ratio, e.side);
      const su = setupScore(side as "Bull" | "Bear", tickerMeta?.[ticker], tickerTech?.[ticker], tickerGex?.[ticker]);
      const evidence = notable?.score ?? null;
      const servingMode = notable?.ml_serving_mode ?? null;
      const research = researchRank(su.score, ml, evidence, servingMode);
      if (research == null) continue;

      // Theme Pulse tilt (2026-08-07): per-ticker play_score from the daily
      // theme-pulse snapshots. +-5 rank points max — a hot theme breaks ties
      // toward its names, a cold one drags them down. Ordering only; the
      // displayed score stays Research Rank. Unvalidated as a predictor
      // (theme-heat ML features backtested ~0 AUC) — treated as context.
      const pulse = pulseData?.scores?.[ticker] ?? null;
      const tilt = pulse != null ? Math.max(-5, Math.min(5, (pulse - 50) / 10)) : 0;
      const cur = best.get(ticker);
      if (cur && cur.research >= research) continue;

      const t = tickerTech?.[ticker];
      const reasons: string[] = [];
      if (evidence != null) {
        reasons.push(`NScore ${evidence} — size, convergence, conviction, catalyst, and structure`);
      }
      if (ml != null) {
        reasons.push(`ML percentile ${ml} within a similar-DTE cohort` +
          (mlProbability != null ? ` · calibrated P(2x within 10 sessions) ${mlProbability}%` : ""));
      }
      if (su.score != null) {
        const bits: string[] = [];
        if (su.tech != null) bits.push(`trend ${su.tech >= 0 ? "+" : ""}${Math.round(su.tech * 100)}`);
        if (t?.pattern) bits.push(`${t.pattern} (${t.pattern_dir})`);
        if (su.tgt != null) bits.push(`analyst tgt ${su.tgt >= 0 ? "+" : ""}${Math.round(su.tgt * 25)}%`);
        if (su.gex != null) {
          const gx = tickerGex?.[ticker];
          bits.push(`dealer walls $${gx?.put_wall ?? "?"}-$${gx?.call_wall ?? "?"} (${su.gex >= 0 ? "room above" : "pressed at wall"})`);
        }
        reasons.push(`Setup ${su.score} — ${bits.join(", ") || "underlying agrees"}`);
      }
      const prem = parsePremium(e.premium_usd ?? e.premium);
      const flowBits: string[] = [];
      if (prem >= 1e6) flowBits.push(`$${(prem / 1e6).toFixed(1)}M premium`);
      if ((e.ask_pct ?? 0) >= 90) flowBits.push(`${e.ask_pct}% at ask`);
      if ((e.vol_oi_ratio ?? 0) >= 3) flowBits.push(`${Number(e.vol_oi_ratio).toFixed(1)}x vol/OI`);
      if (flowBits.length) reasons.push(`Flow — ${flowBits.join(", ")}`);
      const sig = notable?.signals;
      const alignedTraderCalls = sig?.trader_same_dir_24h ?? 0;
      const newsHits = sig?.news_24h ?? 0;
      const voiceMentions = sig?.voices_7d ?? 0;
      const convBits: string[] = [];
      if (alignedTraderCalls > 0) convBits.push(`${alignedTraderCalls} trader call${alignedTraderCalls > 1 ? "s" : ""} aligned`);
      if (newsHits > 0) convBits.push(`${newsHits} news hit${newsHits > 1 ? "s" : ""} 24h`);
      if (voiceMentions > 0) convBits.push(`${voiceMentions} voices mention${voiceMentions > 1 ? "s" : ""}`);
      if (convBits.length) reasons.push(`Converging — ${convBits.join(", ")}`);
      if (pulse != null && pulse >= 65) reasons.push(`Theme Pulse ${pulse} — theme running hot`);
      else if (pulse != null && pulse <= 35) reasons.push(`Theme Pulse ${pulse} — theme cold`);

      best.set(ticker, {
        entry: e, ticker, side: side as "Bull" | "Bear",
        ml, mlProbability, setup: su.score, evidence, servingMode,
        research, tilt, pulse, reasons,
        theme: themeByTicker.get(ticker) ?? null,
      });
    }
    return Array.from(best.values()).sort((a, b) => b.research - a.research).slice(0, 5);
  }, [data, dteFilter, tickerMeta, tickerTech, tickerGex, pulseData, themeByTicker]);

  const { data: priceData } = useTickerPricesBatch(signals.map((s) => s.ticker));
  const priceMap = priceData?.prices ?? {};

  if (!signals.length) return null;
  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          <Sparkles size={12} className="text-accent-cyan" />
          Top Signals · Research Rank ({signals.length})
        </h4>
        <span className="text-xs text-text-muted">
          Evidence + directional setup; quarantined ML is capped at ±3
        </span>
      </div>
      <GexWallLegend />
      <div className="space-y-0.5">
        {signals.map((s) => {
          const e = s.entry;
          const color = s.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          const dl = dteTag(e.dte);
          return (
            <div
              key={s.ticker}
              className="text-xs px-2 py-1.5 rounded-md"
              style={{ background: "color-mix(in srgb, var(--bg-card) 70%, transparent)" }}
              title={s.reasons.join(" · ")}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Chip
                  tone="blue"
                  title={`Research Rank ${s.research}: NScore ${s.evidence}, Setup ${s.setup}, ML percentile ${s.ml} (${s.servingMode ?? "unknown"}).`}
                >
                  rank <span className="num font-bold">{s.research}</span>
                </Chip>
                <span className="font-mono font-bold text-text-primary">{s.ticker}</span>
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
                  <Chip tone="cyan">
                    {s.theme}
                  </Chip>
                )}
                {s.pulse != null && (
                  <Chip
                    tone={s.tilt > 0 ? "orange" : "neutral"}
                    title={`Theme Pulse ${s.pulse}/100 is context only and does not change Research Rank.`}
                  >
                    context <span className="num">{s.tilt >= 0 ? "+" : ""}{s.tilt.toFixed(1)}</span>
                  </Chip>
                )}
                <GexWall ticker={s.ticker} strike={Number(e.strike) || null} showLabel />
                <span className="text-text-secondary ml-auto num">{formatPremium(parsePremium(e.premium_usd ?? e.premium))}</span>
                <PnlBadge pnl={entryPnl(e, priceMap, date)} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-text-muted leading-relaxed max-md:flex md:hidden">
                <span className="num">ML pctl {s.ml}</span>
                <span className="num">NScore {s.evidence}</span>
                <span className="num">Setup {s.setup}</span>
                {s.mlProbability != null && (
                  <span className="num">Calibrated P(2x / 10 sessions) {s.mlProbability}%</span>
                )}
              </div>
              <div className="mt-1 text-text-muted leading-relaxed md:hidden">
                {s.reasons.join("  ·  ")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
