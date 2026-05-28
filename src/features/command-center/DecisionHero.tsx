import { useAppStore } from "../../store/useAppStore";
import { useIFlowHistory } from "../flow-analyzer/iflow/hooks";
import { useTaxonomy } from "../../api/taxonomy";
import { useMarketContext } from "../../api/forecast";
import { PriceDisplay } from "../../components/PriceDisplay";
import { DIRECTION_COLORS } from "../../lib/constants";
import { formatPercentRaw, formatPremium } from "../../lib/utils";
import { TrendingUp, TrendingDown, Minus, Crosshair, Activity, Layers, CalendarDays, Target, BarChart2, Coins } from "lucide-react";
import type { Signal, MarketPrice } from "../../lib/types";

interface DecisionHeroProps {
  signal: Signal | null;
  marketPrice: MarketPrice | null;
  isLoading?: boolean;
}

function DirectionBadge({
  direction,
}: {
  direction: "BULL" | "BEAR" | "NEUTRAL";
}) {
  const color = DIRECTION_COLORS[direction];
  const Icon =
    direction === "BULL"
      ? TrendingUp
      : direction === "BEAR"
        ? TrendingDown
        : Minus;

  return (
    <div
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xl uppercase tracking-wider"
      style={{ color, background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <Icon size={24} />
      {direction}
    </div>
  );
}

function SkeletonHero() {
  return (
    <div className="card animate-pulse">
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="h-10 w-32 rounded-lg bg-text-muted/20" />
        <div className="h-20 w-20 rounded-full bg-text-muted/20" />
        <div className="h-6 w-48 rounded bg-text-muted/20" />
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="h-14 rounded bg-text-muted/20" />
          <div className="h-14 rounded bg-text-muted/20" />
        </div>
      </div>
    </div>
  );
}

export function DecisionHero({ signal, marketPrice, isLoading }: DecisionHeroProps) {
  const ticker = useAppStore((s) => s.activeTicker);
  const { data: flow } = useIFlowHistory(ticker);
  const { data: taxonomy } = useTaxonomy();
  const { data: marketCtx } = useMarketContext(ticker);

  if (isLoading) return <SkeletonHero />;

  if (!signal) {
    return (
      <div className="card flex flex-col items-center justify-center min-h-[280px]">
        <Crosshair size={40} className="text-text-muted mb-3" />
        <p className="text-text-secondary text-sm">
          Run analysis to generate a signal
        </p>
      </div>
    );
  }

  const moveColor = signal.pct_move >= 0 ? "var(--accent-green)" : "var(--accent-red)";
  const hasModels = signal.total_models > 0;
  // Hide the NEUTRAL badge — it's noise. Show direction badge only when
  // the signal has a real BULL or BEAR call.
  const showDirection = signal.direction === "BULL" || signal.direction === "BEAR";

  return (
    <div className="flex flex-col gap-3">
      {/* Two-card row: Identity & Market on the left, Signal & Context on
          the right. Stacks to single column on small screens. Splitting was
          the right call — the single card had grown to 8+ vertical sections
          and felt overstuffed at panel width. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
        {/* ── Left card: Identity & Market ────────────────────────────── */}
        <div className="card flex flex-col items-start gap-3 py-2">
          {showDirection && <DirectionBadge direction={signal.direction} />}

          {/* Ticker + full company name. The full name reads better than
              just "INTC" alone — pulled from yfinance `info.longName`. */}
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex items-center gap-2 font-mono text-base font-semibold text-text-primary">
              <span>{ticker || "—"}</span>
              {marketCtx?.company_name && (
                <span
                  className="text-sm font-sans font-normal text-text-secondary truncate max-w-[220px]"
                  title={marketCtx.company_name}
                >
                  · {marketCtx.company_name}
                </span>
              )}
            </div>
            {(marketCtx?.sector || marketCtx?.industry) && (
              <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
                {marketCtx.sector || ""}
                {marketCtx.sector && marketCtx.industry ? " · " : ""}
                {marketCtx.industry || ""}
              </div>
            )}
          </div>

          {/* Current price + day change */}
          {marketPrice && (
            <PriceDisplay
              price={marketPrice.price}
              changePct={marketPrice.change_pct}
              size="lg"
            />
          )}

          {/* 52w range visualizer — shows where current price sits in the
              12-month range. The position chip + low/high anchor labels make
              breakouts/breakdowns instantly visible. */}
          {marketCtx?.range_52w_low != null &&
           marketCtx?.range_52w_high != null &&
           marketPrice?.price != null && (
            <Range52w
              low={marketCtx.range_52w_low}
              high={marketCtx.range_52w_high}
              current={marketPrice.price}
            />
          )}
        </div>

        {/* ── Right card: Signal & Context ────────────────────────────── */}
        <div className="card flex flex-col items-start gap-3 py-2">
          {/* Inline chip row: earnings · implied move · analyst target ·
              unusual volume · market cap · last earnings reaction. Each chip
              self-hides when its data is null. */}
          <div className="flex flex-wrap items-center gap-2">
            {marketCtx?.earnings_date && (
              <EarningsBadge isoDate={marketCtx.earnings_date} />
            )}
            {marketCtx?.implied_move_pct != null && marketPrice?.price != null && (
              <ImpliedMoveChip
                pct={marketCtx.implied_move_pct}
                price={marketPrice.price}
                expiry={marketCtx.options_expiry}
              />
            )}
            {marketCtx?.price_target != null && marketPrice?.price != null && (
              <AnalystTargetChip
                mean={marketCtx.price_target}
                high={marketCtx.price_target_high}
                low={marketCtx.price_target_low}
                count={marketCtx.analyst_count}
                currentPrice={marketPrice.price}
              />
            )}
            {marketCtx?.volume_ratio != null && (
              <VolumeChip
                ratio={marketCtx.volume_ratio}
                today={marketCtx.volume_today}
                avg={marketCtx.volume_avg_3mo}
              />
            )}
            {marketCtx?.market_cap != null && (
              <MarketCapChip value={marketCtx.market_cap} />
            )}
            {marketCtx?.last_earnings_date &&
             marketCtx.last_earnings_reaction_pct != null && (
              <LastEarningsChip
                date={marketCtx.last_earnings_date}
                reactionPct={marketCtx.last_earnings_reaction_pct}
              />
            )}
          </div>

          {/* Forecast move (model-derived 10d projection) — hidden when no
              model consensus exists (0/0 case where it would show +0.00%). */}
          {hasModels && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">Forecast Move:</span>
              <span className="font-mono font-bold text-base" style={{ color: moveColor }}>
                {formatPercentRaw(signal.pct_move)}
              </span>
            </div>
          )}

          {/* Agreement bar — only when there are models to agree */}
          {hasModels && (
            <div className="w-full">
              <span className="text-sm text-text-secondary">
                {signal.agreeing}/{signal.total_models} models agree
              </span>
              <div
                className="w-full h-1.5 rounded-full mt-1 overflow-hidden"
                style={{ background: "var(--text-muted)", opacity: 0.3 }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(signal.agreeing / Math.max(signal.total_models, 1)) * 100}%`,
                    background: DIRECTION_COLORS[signal.direction],
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Taxonomy breadcrumb + iFlow rollup — full width below the two cards
          since they're already a side-by-side grid internally. Self-hides
          its individual halves for tickers with no taxonomy or no flow. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
        <TaxonomyBlock ticker={ticker} taxonomy={taxonomy} />
        <IFlowBlock flow={flow} />
      </div>
    </div>
  );
}

/** 52-week range bar with current-price marker. Visually anchors price
 *  position: hugging the high = potential breakout, near the low = washed
 *  out. Position % is computed as (current - low) / (high - low). */
function Range52w({ low, high, current }: { low: number; high: number; current: number }) {
  if (high <= low) return null;
  const pct = Math.max(0, Math.min(1, (current - low) / (high - low)));
  const pctLabel = Math.round(pct * 100);
  // Color tone by position — extremes flagged. Top 10% = green, bottom 10%
  // = red, middle = blue.
  const tone =
    pct >= 0.9
      ? "var(--accent-green)"
      : pct <= 0.1
        ? "var(--accent-red)"
        : "var(--accent-blue)";
  const fmt = (n: number) => `$${n.toFixed(n < 10 ? 2 : n < 100 ? 2 : 0)}`;
  return (
    <div className="w-full max-w-[340px] flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-text-muted uppercase tracking-wider">
        <span>52w range</span>
        <span style={{ color: tone }}>{pctLabel}% of range</span>
      </div>
      <div
        className="relative h-1.5 rounded-full overflow-visible"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="absolute -top-[3px] h-[8px] w-[8px] rounded-full"
          style={{
            left: `calc(${pct * 100}% - 4px)`,
            background: tone,
            boxShadow: `0 0 6px ${tone}`,
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-text-secondary">
        <span>{fmt(low)}</span>
        <span>{fmt(high)}</span>
      </div>
    </div>
  );
}

/** Implied-move chip from ATM straddle. "±2.7% / ±$3.20 by Fri 5/29".
 *  Lets the user compare what options are pricing vs the forecast move. */
function ImpliedMoveChip({
  pct,
  price,
  expiry,
}: {
  pct: number;
  price: number;
  expiry: string | null | undefined;
}) {
  const dollars = (pct / 100) * price;
  const expLabel = (() => {
    if (!expiry) return "";
    const [y, m, d] = expiry.split("-").map(Number);
    if (!y || !m || !d) return "";
    const date = new Date(y, m - 1, d);
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
    return ` by ${weekday} ${m}/${d}`;
  })();
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono"
      style={{
        background: "rgba(34,211,238,0.10)",
        color: "var(--accent-cyan, #22d3ee)",
        border: "1px solid rgba(34,211,238,0.30)",
      }}
      title={`ATM straddle / spot — what options pricing implies the stock will move${expLabel ? expLabel : ""}`}
    >
      <Activity size={11} />
      <span className="uppercase tracking-wider text-[10px] font-semibold">IV move</span>
      <span>±{pct.toFixed(1)}% / ±${dollars.toFixed(2)}</span>
      {expLabel && <span className="opacity-70">{expLabel}</span>}
    </div>
  );
}

/** Last-earnings reaction chip — anchors the user in how this name has
 *  recently behaved on prints. "Last: 4/24 → +12.3%" with color by sign. */
function LastEarningsChip({ date, reactionPct }: { date: string; reactionPct: number }) {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  const monthDay = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const tone =
    reactionPct >= 0
      ? { fg: "var(--accent-green)", bg: "rgba(63,185,80,0.10)", bd: "rgba(63,185,80,0.30)" }
      : { fg: "var(--accent-red)", bg: "rgba(248,81,73,0.10)", bd: "rgba(248,81,73,0.30)" };
  const arrow = reactionPct >= 0 ? "↑" : "↓";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
      title={`Next-trading-day reaction after last earnings on ${dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`}
    >
      <CalendarDays size={11} />
      <span className="uppercase tracking-wider text-[10px] font-semibold">Last earnings</span>
      <span>{monthDay}</span>
      <span className="opacity-90">{arrow} {reactionPct >= 0 ? "+" : ""}{reactionPct.toFixed(1)}%</span>
    </div>
  );
}

/** Earnings date chip with days-until countdown. Urgency tone: red ≤3d,
 *  orange ≤7d, blue ≤14d, muted beyond. */
function EarningsBadge({ isoDate }: { isoDate: string }) {
  const [y, m, day] = isoDate.split("-").map(Number);
  if (!y || !m || !day) return null;
  const target = new Date(y, m - 1, day);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (diff < 0) return null;
  const tone =
    diff <= 3
      ? { fg: "var(--accent-red)", bg: "rgba(248,81,73,0.10)", bd: "rgba(248,81,73,0.30)" }
      : diff <= 7
        ? { fg: "var(--accent-orange)", bg: "rgba(227,127,46,0.10)", bd: "rgba(227,127,46,0.30)" }
        : diff <= 14
          ? { fg: "var(--accent-blue)", bg: "rgba(88,166,255,0.10)", bd: "rgba(88,166,255,0.30)" }
          : { fg: "var(--text-muted)", bg: "transparent", bd: "var(--border)" };
  const weekday = target.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const inLabel =
    diff === 0 ? "today" : diff === 1 ? "tomorrow" : `in ${diff}d`;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
      title={`Next earnings: ${target.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`}
    >
      <CalendarDays size={11} />
      <span className="uppercase tracking-wider text-[10px] font-semibold">Earnings</span>
      <span>{weekday} {monthDay}</span>
      <span className="opacity-80">· {inLabel}</span>
    </div>
  );
}

/** Analyst price target chip — shows median target + upside/downside %
 *  from current price. Hover tooltip carries the full range + analyst count.
 *  Tone is keyed to upside direction: green if target > price, red if price
 *  has run past the high target, muted blue otherwise. */
function AnalystTargetChip({
  mean,
  high,
  low,
  count,
  currentPrice,
}: {
  mean: number;
  high?: number | null;
  low?: number | null;
  count?: number | null;
  currentPrice: number;
}) {
  if (!mean || !currentPrice) return null;
  const upsidePct = ((mean - currentPrice) / currentPrice) * 100;
  // Distinct red tone for the "price > all targets" case — that's a
  // meaningfully different message than "modest downside to consensus".
  const overshootHigh = high != null && currentPrice > high;
  const tone = overshootHigh
    ? { fg: "var(--accent-red)", bg: "rgba(248,81,73,0.10)", bd: "rgba(248,81,73,0.30)" }
    : upsidePct >= 0
      ? { fg: "var(--accent-green)", bg: "rgba(63,185,80,0.10)", bd: "rgba(63,185,80,0.30)" }
      : { fg: "var(--accent-blue)", bg: "rgba(88,166,255,0.10)", bd: "rgba(88,166,255,0.30)" };
  const fmt = (n: number) => `$${n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)}`;
  const rangeStr =
    low != null && high != null
      ? ` · range ${fmt(low)}–${fmt(high)}`
      : "";
  const countStr = count ? ` · ${count} analysts` : "";
  const sign = upsidePct >= 0 ? "+" : "";
  const arrow = overshootHigh ? "↑ above" : upsidePct >= 0 ? "↑ to" : "↓ to";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
      title={`Analyst mean target ${fmt(mean)}${rangeStr}${countStr}`}
    >
      <Target size={11} />
      <span className="uppercase tracking-wider text-[10px] font-semibold">Target</span>
      <span>{fmt(mean)}</span>
      <span className="opacity-90">{arrow} {sign}{upsidePct.toFixed(1)}%</span>
    </div>
  );
}

/** Today's session volume vs the 3-month average. Tone keyed to ratio:
 *  ≥3× = green (unusual high), ≤0.5× = muted red (unusual low), otherwise
 *  blue. Hover shows raw counts. Surfaces the "real move vs squeeze"
 *  question for any post-spike ticker without a chart lookup. */
function VolumeChip({
  ratio,
  today,
  avg,
}: {
  ratio: number;
  today?: number | null;
  avg?: number | null;
}) {
  if (!ratio || ratio <= 0) return null;
  const tone =
    ratio >= 3
      ? { fg: "var(--accent-green)", bg: "rgba(63,185,80,0.10)", bd: "rgba(63,185,80,0.30)" }
      : ratio <= 0.5
        ? { fg: "var(--accent-red)", bg: "rgba(248,81,73,0.10)", bd: "rgba(248,81,73,0.30)" }
        : { fg: "var(--accent-blue)", bg: "rgba(88,166,255,0.10)", bd: "rgba(88,166,255,0.30)" };
  const fmtVol = (v?: number | null) => {
    if (v == null) return "";
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
  };
  const detail = today && avg ? `${fmtVol(today)} today vs ${fmtVol(avg)} 3-mo avg` : "";
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}
      title={detail || `Volume ratio: ${ratio.toFixed(2)}× the 3-month average`}
    >
      <BarChart2 size={11} />
      <span className="uppercase tracking-wider text-[10px] font-semibold">Vol</span>
      <span>{fmtVol(today) || `${ratio.toFixed(1)}×`}</span>
      <span className="opacity-90">· {ratio.toFixed(1)}× avg</span>
    </div>
  );
}

/** Market cap chip — order-of-magnitude size context next to price. Neutral
 *  tone (not signal-colored) because cap is informational, not directional.
 *  Format scales: $5.22T / $40.3B / $850M / $12K. Hover shows the raw value. */
function MarketCapChip({ value }: { value: number }) {
  if (!value || value <= 0) return null;
  const fmt = (v: number) => {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono"
      style={{
        background: "rgba(139,148,158,0.08)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border)",
      }}
      title={`Market cap: $${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
    >
      <Coins size={11} />
      <span className="uppercase tracking-wider text-[10px] font-semibold">Mcap</span>
      <span>{fmt(value)}</span>
    </div>
  );
}

/** Taxonomy breadcrumb — shows what sector category + clustered theme this
 *  ticker belongs to, with the theme's one-line investment thesis. Pulled
 *  from the taxonomy ticker_lookup which is fetched once and cached for
 *  an hour. Renders nothing for tickers not in the taxonomy. */
function TaxonomyBlock({
  ticker,
  taxonomy,
}: {
  ticker: string;
  taxonomy: ReturnType<typeof useTaxonomy>["data"];
}) {
  if (!ticker || !taxonomy) return null;
  const entry = taxonomy.ticker_lookup?.[ticker];
  if (!entry?.category) return null;
  const theme = entry.theme || "";
  const themeDesc =
    theme && taxonomy.theme_descriptions
      ? taxonomy.theme_descriptions[entry.category]?.[theme] || ""
      : "";
  const subcategory = entry.subcategory || "";
  const friendly = (s: string) => s.replace(/_/g, " ");
  return (
    <div
      className="w-full rounded-lg p-3 flex flex-col gap-1"
      style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.20)" }}
    >
      <div className="flex items-center gap-1.5 text-[10px] text-text-muted uppercase tracking-wider font-mono">
        <Layers size={11} />
        Sector
      </div>
      <div className="font-mono text-sm font-semibold text-text-primary">
        {friendly(entry.category)}
      </div>
      {theme && (
        <div
          className="text-xs font-mono font-semibold"
          style={{ color: "var(--accent-purple, #c084fc)" }}
        >
          {friendly(theme)}
        </div>
      )}
      {themeDesc && (
        <div className="text-xs text-text-secondary leading-snug">
          {themeDesc}
        </div>
      )}
      {subcategory && subcategory !== theme && (
        <div className="text-[10px] font-mono text-text-muted mt-0.5">
          sub: {friendly(subcategory)}
        </div>
      )}
    </div>
  );
}

/** Compact iFlow rollup pulled from /flow/iflow/history. Shows the most
 *  glanceable pieces of the iFlow tracker for the active ticker: dominant
 *  side over the 14d window, total premium, days active, and accent chips
 *  for strike-ladder escalation and STRONG_ACCUM accumulation labels. */
function IFlowBlock({ flow }: { flow: ReturnType<typeof useIFlowHistory>["data"] }) {
  const summary = flow?.summary;
  const accumLabel = flow?.accumulation_label || "";
  const accumScore = flow?.accumulation_score ?? 0;
  if (!summary || summary.days_active === 0) {
    return null;
  }
  const sideColor =
    summary.dominant_side === "Bull"
      ? "var(--accent-green)"
      : summary.dominant_side === "Bear"
        ? "var(--accent-red)"
        : "var(--text-secondary)";
  const isStrong = accumLabel.includes("STRONG") || accumLabel.includes("ACCUM");
  return (
    <div
      className="w-full rounded-lg p-3 flex flex-col gap-2"
      style={{ background: "rgba(88,166,255,0.06)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-text-secondary uppercase tracking-wider font-mono">
          <Activity size={11} />
          iFlow · 14d
        </div>
        <div className="font-mono text-text-muted text-[10px]">
          {summary.days_active}d active
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-mono text-sm font-semibold"
          style={{ color: sideColor }}
        >
          {summary.dominant_side.toUpperCase()}
        </span>
        <span className="font-mono text-sm text-text-primary">
          {formatPremium(summary.total_premium)}
        </span>
      </div>
      {(summary.strikes_escalating || isStrong) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {summary.strikes_escalating && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
              style={{
                background: "rgba(63,185,80,0.10)",
                color: "var(--accent-green)",
                border: "1px solid rgba(63,185,80,0.30)",
              }}
              title="Max strike on dominant side has climbed across days — institutional accumulation pattern"
            >
              <TrendingUp size={9} />
              ESCALATING
            </span>
          )}
          {isStrong && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
              style={{
                background: "rgba(227,127,46,0.10)",
                color: "var(--accent-orange)",
                border: "1px solid rgba(227,127,46,0.30)",
              }}
              title={`Accumulation score ${accumScore.toFixed(2)}/1.5`}
            >
              {accumLabel}
            </span>
          )}
        </div>
      )}
      {summary.dominant_side !== "Mixed" && (
        <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
          <span style={{ color: "var(--accent-green)" }}>
            Bull {formatPremium(summary.total_bull_premium)}
          </span>
          <span style={{ color: "var(--accent-red)" }}>
            Bear {formatPremium(summary.total_bear_premium)}
          </span>
        </div>
      )}
    </div>
  );
}
