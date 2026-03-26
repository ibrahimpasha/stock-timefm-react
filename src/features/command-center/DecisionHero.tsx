import { ConfidenceGauge } from "../../components/ConfidenceGauge";
import { PriceDisplay } from "../../components/PriceDisplay";
import { DIRECTION_COLORS } from "../../lib/constants";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ShieldAlert,
  Crosshair,
} from "lucide-react";
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

  return (
    <div className="card flex flex-col items-center gap-4 py-2">
      {/* Direction badge */}
      <DirectionBadge direction={signal.direction} />

      {/* Confidence gauge */}
      <ConfidenceGauge value={signal.confidence} size={110} />

      {/* Current price */}
      {marketPrice && (
        <PriceDisplay
          price={marketPrice.price}
          changePct={marketPrice.change_pct}
          size="lg"
        />
      )}

      {/* Forecast move */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-text-secondary">Forecast Move:</span>
        <span className="font-mono font-bold text-base" style={{ color: moveColor }}>
          {formatPercentRaw(signal.pct_move)}
        </span>
      </div>

      {/* Target prices */}
      <div className="grid grid-cols-2 gap-3 w-full">
        <div className="rounded-lg p-3" style={{ background: "rgba(63,185,80,0.08)" }}>
          <div className="flex items-center gap-1 text-xs text-text-secondary mb-1">
            <Target size={12} />
            Target 1
          </div>
          <div className="font-mono font-bold text-accent-green">
            {formatCurrency(signal.t1)}
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(63,185,80,0.08)" }}>
          <div className="flex items-center gap-1 text-xs text-text-secondary mb-1">
            <Target size={12} />
            Target 2
          </div>
          <div className="font-mono font-bold text-accent-green">
            {formatCurrency(signal.t2)}
          </div>
        </div>
      </div>

      {/* Entry zone + Stop */}
      <div className="grid grid-cols-2 gap-3 w-full">
        <div className="rounded-lg p-3" style={{ background: "rgba(88,166,255,0.08)" }}>
          <div className="flex items-center gap-1 text-xs text-text-secondary mb-1">
            <Crosshair size={12} />
            Entry Zone
          </div>
          <div className="font-mono text-sm text-accent-blue">
            {formatCurrency(signal.entry_low)} - {formatCurrency(signal.entry_high)}
          </div>
        </div>
        <div className="rounded-lg p-3" style={{ background: "rgba(248,81,73,0.08)" }}>
          <div className="flex items-center gap-1 text-xs text-text-secondary mb-1">
            <ShieldAlert size={12} />
            Stop Loss
          </div>
          <div className="font-mono text-sm text-accent-red">
            {formatCurrency(
              signal.direction === "BEAR"
                ? signal.entry_high * 1.03
                : signal.entry_low * 0.97
            )}
          </div>
        </div>
      </div>

      {/* Agreement bar */}
      <div className="w-full text-center">
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
    </div>
  );
}
