import { useState } from "react";
import { useSignalAnalysis, useMarketPrice, useMarketHistory } from "../../api/forecast";
import { Sparkline, RangeBar, Tag } from "../../components/CCPrimitives";
import { Chip } from "../../components/Glass";
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
  ChevronDown,
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

function technicalColor(v: number): string {
  if (v > 15) return "var(--accent-green)";
  if (v < -15) return "var(--accent-red)";
  return "var(--text-secondary)";
}

function dirColor(dir?: string): string {
  const d = (dir || "").toLowerCase();
  if (d === "bull") return "var(--accent-green)";
  if (d === "bear") return "var(--accent-red)";
  return "var(--text-muted)";
}

const CONV_COLOR: Record<string, string> = {
  STRONG: "var(--accent-green)",
  WATCH: "var(--accent-yellow)",
  MIXED: "var(--accent-orange)",
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
        style={{
          width: "100%",
          background: color,
          transform: `scaleX(${pct / 100})`,
          transformOrigin: "left",
          transition: "transform .35s ease",
        }}
      />
    </div>
  );
}

/** Signed technical gauge centered at zero. Positive and negative readings
 * extend from the midpoint, so -25 can no longer look like an empty 0-100 bar. */
function BipolarGauge({ value }: { value: number }) {
  const clamped = Math.max(-100, Math.min(100, value));
  const scale = Math.abs(clamped) / 100;
  return (
    <div
      className="relative h-2 overflow-hidden rounded-full"
      style={{ background: "var(--border)" }}
      role="img"
      aria-label={`Technical direction ${Math.round(clamped)} on a minus 100 to plus 100 scale`}
    >
      <div
        className="absolute inset-y-0"
        style={{
          left: clamped < 0 ? 0 : "50%",
          width: "50%",
          background: technicalColor(clamped),
          transform: `scaleX(${scale})`,
          transformOrigin: clamped < 0 ? "right" : "left",
        }}
      />
      <div
        className="absolute inset-y-0 w-px"
        style={{ left: "50%", background: "var(--text-secondary)" }}
      />
    </div>
  );
}

function humanize(value: string | null | undefined): string {
  return String(value || "").replaceAll("_", " ");
}

function formatRate(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const pct = Math.abs(value) <= 1 ? value * 100 : value;
  return `${pct.toFixed(1)}%`;
}

function sourceStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) return value;
  return `updated ${parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Convergence source indicator — filled dot when the source is active. */
function SrcDot({ label, n, tint: t }: { label: string; n: number; tint: string }) {
  const on = n > 0;
  return (
    <span
      className="num inline-flex items-center gap-1 text-xs"
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
 * auditable signal gauges: Technical, cross-source Convergence, ML contract research.
 */
export function SignalAnalysisCard({ ticker }: Props) {
  const { data, isLoading } = useSignalAnalysis(ticker);
  const { data: mp } = useMarketPrice(ticker);
  const { data: hist } = useMarketHistory(ticker, 180); // shares the chart's cache
  const [aboutOpen, setAboutOpen] = useState(false);

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
  const mlProbabilityVisible = !!ml
    && ml.gate_approved === true
    && ml.calibration_status === "calibrated"
    && ml.peak_probability != null;
  const hasMlProvenance = !!ml && [
    ml.model_status,
    ml.model_version,
    ml.serving_mode,
    ml.calibration_status,
    ml.cohort,
    ml.horizon_sessions,
    ml.validation_sample_size,
  ].some((value) => value != null && value !== "");
  const bestContract = ml
    ? [
        ml.best?.type || null,
        ml.best?.strike != null ? `$${ml.best.strike}` : null,
        ml.best?.expiry || null,
      ].filter(Boolean).join(" ")
    : "";
  const baseRate = formatRate(ml?.base_rate);
  const freshness = data?.source_freshness;

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <Activity size={14} className="text-accent-blue" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Signal Analysis
        </h3>
        <span className="ml-auto text-xs text-text-muted">
          <span className="num">{ticker}</span>
          {profile?.sector ? ` · ${profile.sector}` : ""}
        </span>
      </div>

      {isLoading && !data && !mp && (
        <div className="text-xs text-text-muted animate-pulse py-4">loading signals…</div>
      )}

      {/* Price hero — name, big price, day-change pill, live sparkline */}
      {(profile || mp) && (
        <div className="mb-3">
          {(profile?.name || profile?.about) && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {profile?.name && (
                  <span className="text-xs text-text-secondary truncate">{profile.name}</span>
                )}
                {profile?.about && (
                  <button
                    type="button"
                    onClick={() => setAboutOpen((o) => !o)}
                    className="inline-flex items-center gap-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium text-text-muted hover:text-text-secondary hover:bg-bg-card-hover transition-colors"
                    title={aboutOpen ? "Hide company description" : "Show company description"}
                    aria-expanded={aboutOpen}
                  >
                    About
                    <ChevronDown
                      size={11}
                      style={{
                        transform: aboutOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s",
                      }}
                    />
                  </button>
                )}
              </div>
              {aboutOpen && profile?.about && (
                <p className="mt-1 text-xs leading-relaxed text-text-muted max-h-40 overflow-y-auto pr-1">
                  {profile.about}
                </p>
              )}
            </div>
          )}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="num text-2xl font-bold text-text-primary leading-none">
                  {fmtPrice(livePrice)}
                </span>
                {dayPct != null && (
                  <span
                    className="num inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: tint(dc, 16), color: dc }}
                  >
                    {dayPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {dayPct >= 0 ? "+" : ""}
                    {dayPct.toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="text-xs text-text-muted mt-1.5">
                Mkt Cap <span className="num">{fmtMarketCap(profile?.market_cap)}</span>
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
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold uppercase tracking-[0.08em] text-text-secondary">Analyst Target</span>
            <span className="num">
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
          <div className="num flex justify-between text-xs text-text-muted mt-1">
            <span>{fmtPrice(profile.target_low)}</span>
            <span className="opacity-70">now ${livePrice.toFixed(0)}</span>
            <span>{fmtPrice(profile.target_high)}</span>
          </div>
        </div>
      )}

      {!isLoading && !hasAny && (profile || mp) && (
        <div className="text-xs text-text-muted pt-2 border-t border-border text-center">
          No technical, convergence, or ML research signal yet for {ticker}.
        </div>
      )}

      {hasAny && (
        <div>
          {/* Technical */}
          <div className="pt-2.5 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Layers size={12} className="text-text-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Technical
              </span>
              {tech && (
                <span className="ml-auto inline-flex items-center gap-1">
                  {sourceStamp(freshness?.technical) && (
                    <span className="num text-xs font-normal text-text-muted">
                      {sourceStamp(freshness?.technical)}
                    </span>
                  )}
                  <TrendIcon size={13} style={{ color: trendCol }} />
                  <span
                    className="num text-sm font-bold"
                    style={{ color: technicalColor(tech.tech_score) }}
                  >
                    {tech.tech_score > 0 ? "+" : ""}{Math.round(tech.tech_score)}
                  </span>
                </span>
              )}
            </div>
            {tech ? (
              <>
                <BipolarGauge value={tech.tech_score} />
                <div className="num mt-1 flex justify-between text-xs text-text-muted" aria-hidden="true">
                  <span>-100</span>
                  <span>neutral</span>
                  <span>+100</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs mt-1.5">
                  {tech.pattern && (
                    <span style={{ color: dirColor(tech.pattern_dir) }}>
                      {tech.pattern}
                      {tech.pattern_dir ? ` (${tech.pattern_dir})` : ""}
                    </span>
                  )}
                  <span className="num text-text-muted">
                    RSI {Math.round(tech.rsi14)} · MACD{" "}
                    {tech.macd_hist >= 0 ? "+" : ""}
                    {tech.macd_hist.toFixed(2)}
                  </span>
                </div>
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                    <span>Setup strength</span>
                    <span className="num text-text-secondary">{Math.round(tech.setup_strength)}/100</span>
                  </div>
                  <ScoreBar value={tech.setup_strength} color="var(--accent-blue)" />
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
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Convergence
              </span>
              {conv && (
                <span className="ml-auto inline-flex items-center gap-2">
                  {sourceStamp(freshness?.convergence) && (
                    <span className="num text-xs text-text-muted">
                      {sourceStamp(freshness?.convergence)}
                    </span>
                  )}
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
                <SrcDot label="traders" n={sig.traders?.count ?? 0} tint="var(--accent-orange)" />
              </div>
            ) : (
              <div className="text-xs text-text-muted">no cross-source activity</div>
            )}
          </div>

          {/* Contract-level ML research */}
          <div className="pt-2.5 mt-2.5 border-t border-border">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain size={12} className="text-text-muted" />
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                ML Contract Research
              </span>
              {ml && (
                <span className="num ml-auto text-sm font-bold text-accent-purple" title="Best within-DTE contract percentile, not ticker confidence">
                  pctl {ml.peak_score}
                </span>
              )}
            </div>
            {ml ? (
              <>
                <ScoreBar value={ml.peak_score} color="var(--accent-purple)" />
                <div className="mt-1.5 text-xs leading-snug text-text-secondary">
                  Highest within-DTE percentile across <span className="num">{ml.n_entries}</span> recent {ticker} flow{" "}
                  {ml.n_entries === 1 ? "entry" : "entries"}; this is not ticker confidence.
                  {ml.as_of ? <span className="num text-text-muted"> As of {ml.as_of}.</span> : null}
                </div>
                {bestContract && (
                  <div className="mt-1 text-xs text-text-muted">
                    Highest-ranked contract <span className="num text-text-primary">{bestContract}</span>
                    {ml.best?.flow_date ? <span className="num"> · {ml.best.flow_date}</span> : null}
                  </div>
                )}
                {ml.score_distribution && (
                  <div className="num mt-1 text-xs text-text-muted">
                    Distribution median {ml.score_distribution.median ?? "—"} · p75 {ml.score_distribution.p75 ?? "—"} · max {ml.score_distribution.maximum ?? ml.peak_score}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone={ml.gating_allowed ? "green" : ml.ranking_allowed ? "blue" : "neutral"}>
                    {ml.serving_mode === "gate_and_rank"
                      ? "Gate + rank"
                      : ml.serving_mode === "rank_only"
                        ? "Rank only"
                        : ml.serving_mode === "disabled"
                          ? "Disabled"
                          : ml.gate_approved
                            ? "Approved artifact"
                            : "Research only"}
                  </Chip>
                  {ml.model_status && (
                    <Chip tone={ml.model_status === "approved" ? "green" : "neutral"}>
                      status {humanize(ml.model_status)}
                    </Chip>
                  )}
                  {ml.model_version && <Chip tone="purple">model <span className="num">{ml.model_version}</span></Chip>}
                  {ml.calibration_status && (
                    <Chip tone={ml.calibration_status === "calibrated" ? "cyan" : "neutral"}>
                      {humanize(ml.calibration_status)}
                    </Chip>
                  )}
                  {ml.cohort && <Chip>cohort {humanize(ml.cohort)}</Chip>}
                  {ml.horizon_sessions != null && <Chip><span className="num">{ml.horizon_sessions}</span> sessions</Chip>}
                  {ml.validation_sample_size != null && <Chip>validation <span className="num">n={ml.validation_sample_size}</span></Chip>}
                </div>
                {mlProbabilityVisible ? (
                  <div className="mt-2 text-xs text-text-secondary">
                    Calibrated P(2x within {ml.horizon_sessions ?? 10} sessions):{" "}
                    <span className="num font-semibold text-text-primary">{ml.peak_probability}%</span>
                    {baseRate ? <span className="text-text-muted"> · validation base rate {baseRate}</span> : null}
                  </div>
                ) : ml.peak_probability != null ? (
                  <div className="mt-2 text-xs text-text-muted">
                    Probability withheld because approved calibration metadata is not confirmed.
                  </div>
                ) : null}
                {!hasMlProvenance && (
                  <div className="mt-2 text-xs text-text-muted">
                    Model provenance is unavailable in this legacy response; percentile remains research-only context.
                  </div>
                )}
                {ml.trained_at && (
                  <div className="num mt-1 text-xs text-text-muted">trained {ml.trained_at}</div>
                )}
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
