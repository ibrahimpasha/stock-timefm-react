import { useState } from "react";
import { QueryNotice } from "../../components/QueryNotice";
import { modelMetadataLabel } from "../../lib/modelMetadata";
import { useSignalAnalysis, useMarketPrice, useMarketHistory } from "../../api/forecast";
import { Sparkline, RangeBar } from "../../components/CCPrimitives";
import { BarRow, Kpi, Tile, toneOf } from "../../components/Cockpit";
import { TrendingUp, TrendingDown, Minus, ChevronDown } from "lucide-react";

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
  const subline = [profile?.sector, profile?.industry].filter(Boolean).join(" · ");
  const techStamp = tech ? sourceStamp(freshness?.technical) : null;
  const convStamp = conv ? sourceStamp(freshness?.convergence) : null;
  const srcCounts = [
    { label: "News", n: sig.news?.count ?? 0 },
    { label: "iFlow", n: sig.iflow?.count ?? 0 },
    { label: "Voices", n: sig.voices?.count ?? 0 },
    { label: "Traders", n: sig.traders?.count ?? 0 },
  ];
  const srcMax = Math.max(1, ...srcCounts.map((c) => c.n));
  const dist = ml?.score_distribution ?? null;
  const distRows = dist
    ? [
        { label: "Median", v: dist.median },
        { label: "p75", v: dist.p75 },
        { label: "Max", v: dist.maximum ?? ml?.peak_score },
      ]
    : [];

  return (
    <section className="flex flex-col gap-3.5" aria-label={`${ticker} signal analysis`}>
      <QueryNotice queries={[signalQuery]} label="Signal analysis" />

      {isLoading && !data && !mp && (
        <div className="flex animate-pulse flex-col gap-3 rounded-xl border border-border bg-bg-card p-4" role="status">
          <div className="h-4 w-40 rounded bg-text-muted/20" />
          <div className="h-10 w-48 rounded bg-text-muted/15" />
          <span className="sr-only">Loading signals</span>
        </div>
      )}

      {/* Hero: name, big price + day change, live sparkline */}
      {(profile || mp) && (
        <Tile>
          {(profile?.name || subline) && (
            <div className="flex min-w-0 flex-col gap-0.5">
              {profile?.name && <span className="truncate text-sm font-semibold text-text-primary">{profile.name}</span>}
              {subline && <span className="truncate text-xs text-text-muted">{subline}</span>}
            </div>
          )}
          <div className="flex items-end justify-between gap-4">
            <Kpi
              label="Last price"
              value={fmtPrice(livePrice)}
              delta={dayPct != null ? `${dayPct >= 0 ? "+" : ""}${dayPct.toFixed(2)}% today` : undefined}
              tone={toneOf(dayPct)}
              size="xl"
            />
            {spark.length >= 2 && (
              <div className="shrink-0" title="Last 40 sessions">
                <Sparkline points={spark} width={128} height={48} color={sparkColor} fill />
              </div>
            )}
          </div>
          {profile?.about && (
            <div>
              <button
                type="button"
                onClick={() => setAboutOpen((o) => !o)}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-muted transition-colors hover:text-text-primary"
                title={aboutOpen ? "Hide company description" : "Show company description"}
                aria-expanded={aboutOpen}
              >
                About the company
                <ChevronDown size={12} style={{ transform: aboutOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {aboutOpen && (
                <p className="mt-2 max-h-64 overflow-y-auto pr-1 text-sm leading-relaxed text-text-secondary">{profile.about}</p>
              )}
            </div>
          )}
        </Tile>
      )}

      {/* Metric pairs */}
      {(profile || mp) && (
        <Tile bodyClassName="grid grid-cols-2 gap-x-5 gap-y-4">
          <Kpi label="Market cap" value={fmtMarketCap(profile?.market_cap)} size="md" />
          <Kpi
            label="Analyst target"
            value={fmtPrice(tgt)}
            delta={upsidePct != null ? `${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(0)}%` : undefined}
            tone={toneOf(upsidePct)}
            size="md"
          />
          {tech && (
            <Kpi
              label="Technical (-100..+100)"
              value={
                <span className="inline-flex items-center gap-1.5" style={{ color: trendCol }}>
                  <TrendIcon size={16} aria-hidden />
                  {tech.tech_score > 0 ? "+" : ""}
                  {Math.round(tech.tech_score)}
                </span>
              }
              sub={`trend ${tech.trend || "flat"}`}
              size="md"
            />
          )}
          {conv && (
            <Kpi
              label="Convergence"
              value={
                <span className="inline-flex items-center gap-2 font-sans">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: convCol }} />
                  {convLabel ? convLabel.charAt(0) + convLabel.slice(1).toLowerCase() : "—"}
                </span>
              }
              sub="news · flow · voices · traders"
              size="md"
            />
          )}
        </Tile>
      )}

      {/* Analyst target range with the live price marker */}
      {profile?.target_low != null && profile?.target_high != null && livePrice != null && (
        <Tile
          title="Analyst range"
          meta={
            <span className="num">
              {tgt != null && <span className="text-text-primary">{fmtPrice(tgt)} mean</span>}
              {upsidePct != null && (
                <span style={{ color: upCol }}>
                  {" "}
                  {upsidePct >= 0 ? "+" : ""}
                  {upsidePct.toFixed(0)}%
                </span>
              )}
            </span>
          }
        >
          <RangeBar low={profile.target_low} high={profile.target_high} last={livePrice} width="100%" />
          <div className="num flex justify-between text-xs text-text-muted">
            <span>{fmtPrice(profile.target_low)}</span>
            <span className="text-text-secondary">now ${livePrice.toFixed(0)}</span>
            <span>{fmtPrice(profile.target_high)}</span>
          </div>
        </Tile>
      )}

      {!signalQuery.isPending && !signalQuery.isError && signalQuery.fetchStatus !== "paused" && !hasAny && (profile || mp) && (
        <p className="px-1 text-sm text-text-muted">
          No technical, convergence, or ML research signal yet for <span className="num">{ticker}</span>.
        </p>
      )}

      {hasAny && (
        <Tile title="Technical" meta={techStamp ?? undefined}>
          {tech ? (
            <>
              <BarRow
                label="Score"
                value={tech.tech_score}
                max={100}
                diverging
                display={`${tech.tech_score > 0 ? "+" : ""}${Math.round(tech.tech_score)}`}
                tone={tech.tech_score > 15 ? "up" : tech.tech_score < -15 ? "down" : "neutral"}
                title="Technical direction, -100 to +100"
              />
              <BarRow label="Setup" value={tech.setup_strength} max={100} tone="info" display={`${Math.round(tech.setup_strength)}`} title="Setup strength, 0-100" />
              <BarRow label="RSI 14" value={tech.rsi14} max={100} tone="info" display={Math.round(tech.rsi14)} />
              <p className="text-xs text-text-muted">
                {tech.pattern && (
                  <span style={{ color: dirColor(tech.pattern_dir) }}>
                    {tech.pattern}
                    {tech.pattern_dir ? ` (${tech.pattern_dir})` : ""}
                    {" · "}
                  </span>
                )}
                MACD hist{" "}
                <span className="num text-text-secondary">
                  {tech.macd_hist >= 0 ? "+" : ""}
                  {tech.macd_hist.toFixed(2)}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-text-muted">No technicals cached.</p>
          )}
        </Tile>
      )}

      {hasAny && (
        <Tile
          title="Convergence"
          meta={convStamp ?? undefined}
          actions={
            conv && convLabel ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: convCol }}>
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: convCol }} />
                {convLabel.charAt(0) + convLabel.slice(1).toLowerCase()}
              </span>
            ) : undefined
          }
        >
          {conv ? (
            srcCounts.map((c) => (
              <BarRow key={c.label} label={c.label} value={c.n} max={srcMax} tone="info" display={c.n} title={`${c.label}: ${c.n}`} />
            ))
          ) : (
            <p className="text-sm text-text-muted">No cross-source activity.</p>
          )}
        </Tile>
      )}

      {hasAny && (
        <Tile
          title="ML contract research"
          meta={
            ml ? (
              <span title="Best within-DTE contract percentile, not ticker confidence">
                percentile <span className="num font-semibold text-text-primary">{ml.peak_score}</span>
              </span>
            ) : undefined
          }
        >
          {ml ? (
            <>
              <BarRow label="Peak" value={ml.peak_score} max={100} tone="info" display={ml.peak_score} title="Highest within-DTE percentile" />
              {distRows.map((r) => (
                <BarRow
                  key={r.label}
                  label={r.label}
                  value={typeof r.v === "number" ? r.v : 0}
                  max={100}
                  tone="info"
                  display={r.v ?? "—"}
                />
              ))}
              {bestContract && (
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 border-t border-border pt-2.5">
                  <span className="text-xs text-text-muted">Highest-ranked contract</span>
                  <span className="num text-sm font-semibold text-text-primary">
                    {bestContract}
                    {ml.best?.flow_date ? <span className="font-normal text-text-muted"> · {ml.best.flow_date}</span> : null}
                  </span>
                </div>
              )}
              {mlProbabilityVisible ? (
                <div className="text-sm text-text-secondary">
                  Calibrated P(2x within <span className="num">{ml.horizon_sessions ?? 10}</span> sessions):{" "}
                  <span className="num font-semibold text-text-primary">{ml.peak_probability}%</span>
                  {baseRate ? <span className="text-text-muted"> · validation base rate <span className="num">{baseRate}</span></span> : null}
                </div>
              ) : ml.peak_probability != null ? (
                <p className="text-xs text-text-muted">Probability withheld because approved calibration metadata is not confirmed.</p>
              ) : null}
              <p className="text-xs leading-relaxed text-text-muted">
                Highest within-DTE percentile across <span className="num">{ml.n_entries}</span> recent{" "}
                <span className="num">{ticker}</span> flow {ml.n_entries === 1 ? "entry" : "entries"}; this is not ticker confidence.
                {ml.as_of ? <> As of <span className="num">{ml.as_of}</span>.</> : null}
              </p>
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
                  {dist?.scored_contracts != null && <span>Scored contracts <span className="num">{dist.scored_contracts}</span></span>}
                </div>
              </details>
            </>
          ) : (
            <p className="text-sm text-text-muted">No recent options flow to score.</p>
          )}
        </Tile>
      )}
    </section>
  );
}
