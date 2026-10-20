import { useState } from "react";
import { QueryNotice } from "../../components/QueryNotice";
import { modelMetadataLabel } from "../../lib/modelMetadata";
import { useSignalAnalysis, useMarketPrice, useMarketHistory } from "../../api/forecast";
import { Sparkline, RangeBar } from "../../components/CCPrimitives";
import { Stat } from "../../components/Glass";
import {
  TrendingUp,
  TrendingDown,
  Minus,
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
function SrcDot({ label, n }: { label: string; n: number }) {
  const on = n > 0;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${on ? "text-text-primary" : "text-text-muted"}`}>
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: on ? "var(--accent-blue)" : "transparent",
          border: `1px solid ${on ? "var(--accent-blue)" : "var(--text-muted)"}`,
        }}
      />
      {label}
      {on && <span className="num text-text-secondary">{n}</span>}
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
  const signalQuery = useSignalAnalysis(ticker);
  const { data, isLoading } = signalQuery;
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

  const mlMode = ml
    ? ml.serving_mode === "gate_and_rank"
      ? "Gate + rank"
      : ml.serving_mode === "rank_only"
        ? "Rank only"
        : ml.serving_mode === "disabled"
          ? "Disabled"
          : ml.gate_approved
            ? "Approved artifact"
            : "Research only"
    : "";
  const sectionTitle = "text-sm font-semibold text-text-primary";
  const techTone = tech ? (tech.tech_score > 15 ? "green" : tech.tech_score < -15 ? "red" : undefined) : undefined;
  const subline = [profile?.sector, profile?.industry].filter(Boolean).join(" · ");

  return (
    <section className="flex flex-col gap-6" aria-label={`${ticker} signal analysis`}>
      <QueryNotice queries={[signalQuery]} label="Signal analysis" />

      {isLoading && !data && !mp && (
        <div className="flex flex-col gap-3 animate-pulse" role="status">
          <div className="h-5 w-40 rounded bg-text-muted/20" />
          <div className="h-10 w-48 rounded bg-text-muted/15" />
          <span className="sr-only">Loading signals</span>
        </div>
      )}

      {/* Hero — company name, big price + day change, live sparkline */}
      {(profile || mp) && (
        <div className="flex flex-col gap-4">
          {(profile?.name || subline || profile?.about) && (
            <div className="min-w-0">
              {profile?.name && (
                <p className="font-display text-xl leading-snug text-text-primary">{profile.name}</p>
              )}
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {subline && <span className="min-w-0 truncate text-sm text-text-muted">{subline}</span>}
                {profile?.about && (
                  <button
                    type="button"
                    onClick={() => setAboutOpen((o) => !o)}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium text-accent-blue transition-colors hover:bg-bg-card-hover"
                    title={aboutOpen ? "Hide company description" : "Show company description"}
                    aria-expanded={aboutOpen}
                  >
                    About
                    <ChevronDown
                      size={12}
                      style={{
                        transform: aboutOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.15s",
                      }}
                    />
                  </button>
                )}
              </div>
              {aboutOpen && profile?.about && (
                <p className="prose-read mt-3 max-h-64 max-w-[72ch] overflow-y-auto pr-1 text-text-secondary">
                  {profile.about}
                </p>
              )}
            </div>
          )}

          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="num text-4xl font-semibold leading-none tracking-tight text-text-primary">
                {fmtPrice(livePrice)}
              </div>
              {dayPct != null && (
                <div
                  className={`mt-2 inline-flex items-center gap-1 text-lg font-semibold ${dayPct >= 0 ? "delta-up" : "delta-down"}`}
                >
                  {dayPct >= 0 ? <ArrowUpRight size={18} aria-hidden /> : <ArrowDownRight size={18} aria-hidden />}
                  {dayPct >= 0 ? "+" : ""}
                  {dayPct.toFixed(2)}%
                  <span className="font-sans text-sm font-normal text-text-muted">today</span>
                </div>
              )}
            </div>
            {spark.length >= 2 && (
              <div className="shrink-0" title="Last 40 sessions">
                <Sparkline points={spark} width={136} height={52} color={sparkColor} fill />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4">
            <Stat label="Market cap" value={fmtMarketCap(profile?.market_cap)} />
            <Stat
              label="Analyst target"
              value={fmtPrice(tgt)}
              tone={upsidePct != null ? (upsidePct >= 0 ? "green" : "red") : undefined}
              sub={upsidePct != null ? `${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(0)}% vs now` : undefined}
            />
            {tech && (
              <Stat
                label="Technical"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <TrendIcon size={16} style={{ color: trendCol }} aria-hidden />
                    {tech.tech_score > 0 ? "+" : ""}{Math.round(tech.tech_score)}
                  </span>
                }
                tone={techTone}
                sub={`trend ${tech.trend || "flat"} · -100 to +100`}
              />
            )}
            {conv && (
              <Stat
                label="Convergence"
                value={
                  <span className="inline-flex items-center gap-2 font-sans">
                    <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: convCol }} />
                    {convLabel ? convLabel.charAt(0) + convLabel.slice(1).toLowerCase() : "—"}
                  </span>
                }
                sub="news · flow · voices · traders"
              />
            )}
          </div>
        </div>
      )}

      {/* Analyst target — range bar with the live price marker */}
      {profile?.target_low != null && profile?.target_high != null && livePrice != null && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className={sectionTitle}>Analyst range</span>
            <span className="num text-sm">
              {tgt != null && <span className="font-semibold text-text-primary">{fmtPrice(tgt)} mean</span>}
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
          <div className="num mt-1.5 flex justify-between text-xs text-text-muted">
            <span>{fmtPrice(profile.target_low)}</span>
            <span>now ${livePrice.toFixed(0)}</span>
            <span>{fmtPrice(profile.target_high)}</span>
          </div>
        </div>
      )}

      {!signalQuery.isPending && !signalQuery.isError && signalQuery.fetchStatus !== "paused" && !hasAny && (profile || mp) && (
        <p className="text-sm text-text-muted">
          No technical, convergence, or ML research signal yet for <span className="num">{ticker}</span>.
        </p>
      )}

      {hasAny && (
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="section-title">Signals</h3>
            <p className="section-sub">Technical setup, cross-source convergence, and contract-level ML research.</p>
          </div>

          <div className="flex flex-col divide-y divide-border">
            {/* Technical */}
            <div className="py-4 first:pt-1">
              <div className="mb-2 flex items-baseline gap-2">
                <span className={sectionTitle}>Technical</span>
                {tech && sourceStamp(freshness?.technical) && (
                  <span className="ml-auto text-xs text-text-muted">{sourceStamp(freshness?.technical)}</span>
                )}
              </div>
              {tech ? (
                <>
                  <BipolarGauge value={tech.tech_score} />
                  <div className="num mt-1 flex justify-between text-xs text-text-muted" aria-hidden="true">
                    <span>-100</span>
                    <span>0</span>
                    <span>+100</span>
                  </div>
                  <p className="mt-3 text-sm text-text-secondary">
                    {tech.pattern && (
                      <span style={{ color: dirColor(tech.pattern_dir) }}>
                        {tech.pattern}
                        {tech.pattern_dir ? ` (${tech.pattern_dir})` : ""}
                        {" · "}
                      </span>
                    )}
                    RSI <span className="num text-text-primary">{Math.round(tech.rsi14)}</span> · MACD{" "}
                    <span className="num text-text-primary">
                      {tech.macd_hist >= 0 ? "+" : ""}
                      {tech.macd_hist.toFixed(2)}
                    </span>
                  </p>
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                      <span>Setup strength</span>
                      <span className="num text-text-secondary">{Math.round(tech.setup_strength)}/100</span>
                    </div>
                    <ScoreBar value={tech.setup_strength} color="var(--accent-blue)" />
                  </div>
                </>
              ) : (
                <p className="text-sm text-text-muted">No technicals cached.</p>
              )}
            </div>

            {/* Convergence */}
            <div className="py-4">
              <div className="mb-2 flex items-baseline gap-2">
                <span className={sectionTitle}>Convergence</span>
                {conv && sourceStamp(freshness?.convergence) && (
                  <span className="ml-auto text-xs text-text-muted">{sourceStamp(freshness?.convergence)}</span>
                )}
              </div>
              {conv ? (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  <SrcDot label="News" n={sig.news?.count ?? 0} />
                  <SrcDot label="iFlow" n={sig.iflow?.count ?? 0} />
                  <SrcDot label="Voices" n={sig.voices?.count ?? 0} />
                  <SrcDot label="Traders" n={sig.traders?.count ?? 0} />
                </div>
              ) : (
                <p className="text-sm text-text-muted">No cross-source activity.</p>
              )}
            </div>

            {/* Contract-level ML research */}
            <div className="py-4 last:pb-0">
              <div className="mb-2 flex items-baseline gap-2">
                <span className={sectionTitle}>ML contract research</span>
                {ml && (
                  <span className="ml-auto text-sm text-text-muted" title="Best within-DTE contract percentile, not ticker confidence">
                    percentile <span className="num text-base font-semibold text-text-primary">{ml.peak_score}</span>
                  </span>
                )}
              </div>
              {ml ? (
                <div className="flex flex-col gap-2.5">
                  <ScoreBar value={ml.peak_score} color="var(--accent-blue)" />
                  <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">
                    Highest within-DTE percentile across <span className="num">{ml.n_entries}</span> recent{" "}
                    <span className="num">{ticker}</span> flow {ml.n_entries === 1 ? "entry" : "entries"}; this is not ticker confidence.
                    {ml.as_of ? <span className="text-text-muted"> As of <span className="num">{ml.as_of}</span>.</span> : null}
                  </p>
                  {bestContract && (
                    <div className="text-sm text-text-secondary">
                      Highest-ranked contract <span className="num font-semibold text-text-primary">{bestContract}</span>
                      {ml.best?.flow_date ? <span className="num text-text-muted"> · {ml.best.flow_date}</span> : null}
                    </div>
                  )}
                  {ml.score_distribution && (
                    <div className="text-xs text-text-muted">
                      Distribution median <span className="num">{ml.score_distribution.median ?? "—"}</span> · p75{" "}
                      <span className="num">{ml.score_distribution.p75 ?? "—"}</span> · max{" "}
                      <span className="num">{ml.score_distribution.maximum ?? ml.peak_score}</span>
                    </div>
                  )}
                  {mlProbabilityVisible ? (
                    <div className="text-sm text-text-secondary">
                      Calibrated P(2x within <span className="num">{ml.horizon_sessions ?? 10}</span> sessions):{" "}
                      <span className="num font-semibold text-text-primary">{ml.peak_probability}%</span>
                      {baseRate ? <span className="text-text-muted"> · validation base rate <span className="num">{baseRate}</span></span> : null}
                    </div>
                  ) : ml.peak_probability != null ? (
                    <p className="text-xs text-text-muted">
                      Probability withheld because approved calibration metadata is not confirmed.
                    </p>
                  ) : null}
                  <details className="text-xs text-text-muted">
                    <summary className="cursor-pointer hover:text-text-secondary">
                      {mlMode}
                      {ml.model_status ? ` · ${humanize(ml.model_status)}` : ""}
                      {ml.calibration_status ? ` · ${humanize(ml.calibration_status)}` : ""}
                    </summary>
                    <div className="mt-1.5 flex flex-col gap-1 leading-relaxed">
                      {ml.model_version && <span>Model <span className="num">{ml.model_version}</span></span>}
                      {ml.cohort && <span>Cohort {humanize(ml.cohort)}</span>}
                      {ml.horizon_sessions != null && <span>Horizon <span className="num">{ml.horizon_sessions}</span> sessions</span>}
                      {ml.validation_sample_size != null && <span>Validation <span className="num">n={ml.validation_sample_size}</span></span>}
                      {ml.metadata && <span className="break-words">{modelMetadataLabel(ml.metadata)}</span>}
                      {!hasMlProvenance && !ml.metadata && (
                        <span>Model provenance is unavailable in this legacy response; percentile remains research-only context.</span>
                      )}
                      {ml.trained_at && <span>Trained <span className="num">{ml.trained_at}</span></span>}
                    </div>
                  </details>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No recent options flow to score.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
