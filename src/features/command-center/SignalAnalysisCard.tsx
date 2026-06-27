import { useSignalAnalysis, useMarketPrice, useMarketHistory } from "../../api/forecast";
import { Sparkline, RangeBar, Tag } from "../../components/CCPrimitives";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  GitMerge,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface Props {
  ticker: string;
}

/* ── formatting + color helpers ─────────────────────────────── */

function fmtMarketCap(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** translucent tint of a CSS-var color (var() can't take an alpha-hex suffix). */
function tint(c: string, pct: number): string {
  return `color-mix(in srgb, ${c} ${pct}%, transparent)`;
}

function scoreColor(v: number): string {
  if (v >= 65) return "var(--accent-green)";
  if (v >= 40) return "var(--accent-yellow, #eab308)";
  return "var(--accent-red)";
}

function dirColor(dir?: string): string {
  const d = (dir || "").toLowerCase();
  if (d === "bull") return "var(--accent-green)";
  if (d === "bear") return "var(--accent-red)";
  return "var(--text-muted)";
}

const CONV_COLOR: Record<string, string> = {
  STRONG: "var(--accent-green)",
  WATCH: "var(--accent-yellow, #eab308)",
  MIXED: "var(--accent-orange, #f59e0b)",
  QUIET: "var(--text-muted)",
};

/* ── small visual atoms ─────────────────────────────────────── */

/** Filled progress bar (0..100) with a colored fill over a track. */
function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: color, transition: "width .35s ease" }}
      />
    </div>
  );
}

/** Convergence source indicator — filled dot when the source is active. */
function SrcDot({ label, n, tint: t }: { label: string; n: number; tint: string }) {
  const on = n > 0;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono"
      style={{ color: on ? t : "var(--text-muted)" }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 9,
          background: on ? t : "transparent",
          border: `1px solid ${on ? t : "var(--text-muted)"}`,
        }}
      />
      {label}
      {on ? ` ${n}` : ""}
    </span>
  );
}

/* ── card ───────────────────────────────────────────────────── */

/**
 * Signal Analysis — reliable per-ticker read replacing the deprecated price
 * forecast. Price hero (live sparkline) + analyst-target range bar + three
 * auditable signal gauges: Technical, cross-source Convergence, ML peak-potential.
 */
export function SignalAnalysisCard({ ticker }: Props) {
  const { data, isLoading } = useSignalAnalysis(ticker);
  const { data: mp } = useMarketPrice(ticker);
  const { data: hist } = useMarketHistory(ticker, 180); // shares the chart's cache

  if (!ticker) return null;

  const profile = data?.profile ?? null;
  const tech = data?.technical ?? null;
  const conv = data?.convergence ?? null;
  const ml = data?.ml ?? null;
  const hasAny = !!(tech || conv || ml);

  const livePrice = mp?.price ?? tech?.price ?? null;
  const dayPct = typeof mp?.change_pct === "number" ? mp.change_pct : null;
  const dc = dayPct != null ? (dayPct >= 0 ? "var(--accent-green)" : "var(--accent-red)") : "var(--text-muted)";
  const tgt = profile?.target_mean ?? null;
  const upsidePct = tgt != null && livePrice ? ((tgt - livePrice) / livePrice) * 100 : null;
  const upCol = upsidePct != null ? (upsidePct >= 0 ? "var(--accent-green)" : "var(--accent-red)") : "var(--text-muted)";

  const spark = (hist ?? [])
    .slice(-40)
    .map((d) => Number(d.close))
    .filter((n) => Number.isFinite(n));
  const sparkColor = spark.length >= 2 && spark[spark.length - 1] >= spark[0]
    ? "var(--accent-green)"
    : "var(--accent-red)";

  const TrendIcon =
    tech?.trend === "up" ? TrendingUp : tech?.trend === "down" ? TrendingDown : Minus;
  const trendCol =
    tech?.trend === "up" ? "var(--accent-green)" : tech?.trend === "down" ? "var(--accent-red)" : "var(--text-muted)";

  const convLabel = conv?.convergence?.label ?? "";
  const convCol = CONV_COLOR[convLabel] ?? "var(--text-muted)";
  const sig = conv?.signals ?? {};

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <Activity size={15} className="text-accent-blue" />
        <h3 className="text-sm font-semibold text-text-primary">Signal Analysis</h3>
        <span className="ml-auto text-[10px] font-mono text-text-muted">
          {ticker}
          {profile?.sector ? ` · ${profile.sector}` : ""}
        </span>
      </div>

      {isLoading && !data && !mp && (
        <div className="text-xs text-text-muted animate-pulse py-4">loading signals…</div>
      )}

      {/* Price hero — name, big price, day-change pill, live sparkline */}
      {(profile || mp) && (
        <div className="mb-3">
          {profile?.name && (
            <div className="text-xs text-text-secondary truncate mb-1">{profile.name}</div>
          )}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-2xl font-bold text-text-primary tabular-nums leading-none">
                  {fmtPrice(livePrice)}
                </span>
                {dayPct != null && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-mono font-bold"
                    style={{ background: tint(dc, 16), color: dc }}
                  >
                    {dayPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {dayPct >= 0 ? "+" : ""}
                    {dayPct.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="text-[10px] text-text-muted font-mono mt-1.5">
                Mkt Cap {fmtMarketCap(profile?.market_cap)}
                {profile?.industry ? ` · ${profile.industry}` : ""}
              </div>
            </div>
            {spark.length >= 2 && (
              <Sparkline points={spark} width={92} height={36} color={sparkColor} fill />
            )}
          </div>
        </div>
      )}

      {/* Analyst target — range bar with the live price marker */}
      {profile?.target_low != null && profile?.target_high != null && livePrice != null && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] mb-1.5">
            <span className="uppercase tracking-wide text-text-muted">Analyst Target</span>
            <span className="font-mono">
              {tgt != null && <span className="text-text-primary font-semibold">{fmtPrice(tgt)}</span>}
              {upsidePct != null && (
                <span style={{ color: upCol }}>
                  {" "}
                  {upsidePct >= 0 ? "+" : ""}
                  {upsidePct.toFixed(0)}%
                </span>
              )}
            </span>
          </div>
          <RangeBar low={profile.target_low} high={profile.target_high} last={livePrice} width="100%" />
          <div className="flex justify-between text-[9px] font-mono text-text-muted mt-1">
            <span>{fmtPrice(profile.target_low)}</span>
            <span className="opacity-70">now ${livePrice.toFixed(0)}</span>
            <span>{fmtPrice(profile.target_high)}</span>
          </div>
        </div>
      )}

      {!isLoading && !hasAny && (profile || mp) && (
        <div className="text-[11px] text-text-muted pt-2 border-t border-border">
          No technical / convergence / ML signal yet for {ticker}.
        </div>
      )}

      {hasAny && (
        <div>
          {/* Technical */}
          <div className="pt-2.5 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Layers size={12} className="text-text-muted" />
              <span className="text-[11px] font-semibold tracking-wide text-text-secondary">
                TECHNICAL
              </span>
              {tech && (
                <span className="ml-auto inline-flex items-center gap-1">
                  <TrendIcon size={13} style={{ color: trendCol }} />
                  <span
                    className="font-mono text-sm font-bold tabular-nums"
                    style={{ color: scoreColor(tech.tech_score) }}
                  >
                    {Math.round(tech.tech_score)}
                  </span>
                </span>
              )}
            </div>
            {tech ? (
              <>
                <ScoreBar value={tech.tech_score} color={scoreColor(tech.tech_score)} />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] mt-1.5">
                  {tech.pattern && (
                    <span style={{ color: dirColor(tech.pattern_dir) }}>
                      {tech.pattern}
                      {tech.pattern_dir ? ` (${tech.pattern_dir})` : ""}
                    </span>
                  )}
                  <span className="text-text-muted font-mono">
                    setup {Math.round(tech.setup_strength)} · RSI {Math.round(tech.rsi14)} · MACD{" "}
                    {tech.macd_hist >= 0 ? "+" : ""}
                    {tech.macd_hist.toFixed(2)}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-text-muted">no technicals cached</div>
            )}
          </div>

          {/* Convergence */}
          <div className="pt-2.5 mt-2.5 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <GitMerge size={12} className="text-text-muted" />
              <span className="text-[11px] font-semibold tracking-wide text-text-secondary">
                CONVERGENCE
              </span>
              {conv && (
                <span className="ml-auto">
                  <Tag color={convCol} bg={tint(convCol, 16)} border={tint(convCol, 50)}>
                    {convLabel || "—"}
                  </Tag>
                </span>
              )}
            </div>
            {conv ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <SrcDot label="news" n={sig.news?.count ?? 0} tint="var(--accent-blue)" />
                <SrcDot label="iflow" n={sig.iflow?.count ?? 0} tint="var(--accent-purple)" />
                <SrcDot label="voices" n={sig.voices?.count ?? 0} tint="var(--accent-green)" />
                <SrcDot label="traders" n={sig.traders?.count ?? 0} tint="var(--accent-orange, #f59e0b)" />
              </div>
            ) : (
              <div className="text-xs text-text-muted">no cross-source activity</div>
            )}
          </div>

          {/* ML peak-potential */}
          <div className="pt-2.5 mt-2.5 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain size={12} className="text-text-muted" />
              <span className="text-[11px] font-semibold tracking-wide text-text-secondary">
                ML PEAK-POTENTIAL
              </span>
              {ml && (
                <span className="ml-auto font-mono text-sm font-bold tabular-nums text-accent-purple">
                  {ml.peak_score}
                </span>
              )}
            </div>
            {ml ? (
              <>
                <ScoreBar value={ml.peak_score} color="var(--accent-purple)" />
                <div className="text-[10px] font-mono text-text-muted leading-snug mt-1.5">
                  P(option peak &gt; +100%) · best of {ml.n_entries} flow{" "}
                  {ml.n_entries === 1 ? "entry" : "entries"}
                  {ml.as_of ? ` · ${ml.as_of}` : ""}
                  <div className="opacity-70">ranking signal for spike potential — not a P/L forecast</div>
                </div>
              </>
            ) : (
              <div className="text-xs text-text-muted">no recent options flow to score</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
