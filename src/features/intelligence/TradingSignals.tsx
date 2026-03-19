import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import type { IntelSignal } from "../../lib/types";

interface TradingSignalsProps {
  signals: IntelSignal[];
  isLoading: boolean;
}

function WeightDots({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: i <= count ? "currentColor" : "var(--text-muted)",
            opacity: i <= count ? 1 : 0.3,
          }}
        />
      ))}
    </span>
  );
}

function estimateWeight(detail: string): number {
  const len = detail.length;
  if (len > 150) return 3;
  if (len > 80) return 2;
  return 1;
}

export function TradingSignals({ signals, isLoading }: TradingSignalsProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  const bullish = signals.filter((s) => s.type === "bullish");
  const bearish = signals.filter((s) => s.type === "bearish");
  const caution = signals.filter((s) => s.type === "caution");

  // Compute overall verdict
  const bullWeight = bullish.length;
  const bearWeight = bearish.length;
  let verdict: string;
  let verdictColor: string;
  if (bullWeight > bearWeight + caution.length) {
    verdict = "BULLISH";
    verdictColor = "var(--accent-green)";
  } else if (bearWeight > bullWeight + caution.length) {
    verdict = "BEARISH";
    verdictColor = "var(--accent-red)";
  } else {
    verdict = "MIXED";
    verdictColor = "var(--accent-orange)";
  }

  const conviction = signals.length > 0 ? Math.round((Math.max(bullWeight, bearWeight) / signals.length) * 100) : 0;

  if (signals.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Trading Signals</h2>
        <p className="text-xs text-text-muted text-center py-4">No signals extracted yet.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-secondary">Trading Signals</h2>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-bold font-mono px-2 py-1 rounded-full"
            style={{ color: verdictColor, background: `${verdictColor}20` }}
          >
            {verdict}
          </span>
          <span className="text-xs text-text-muted font-mono">{conviction}% conviction</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Bullish column */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp size={14} className="text-accent-green" />
            <span className="text-xs font-semibold text-accent-green">
              Bullish ({bullish.length})
            </span>
          </div>
          <div className="space-y-2">
            {bullish.map((s, i) => (
              <div
                key={i}
                className="p-2 rounded-lg text-xs"
                style={{
                  background: "rgba(63, 185, 80, 0.06)",
                  border: "1px solid rgba(63, 185, 80, 0.15)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-text-primary">{s.title}</span>
                  <WeightDots count={estimateWeight(s.detail)} />
                </div>
                <p className="text-text-secondary leading-relaxed">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bearish column */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingDown size={14} className="text-accent-red" />
            <span className="text-xs font-semibold text-accent-red">
              Bearish ({bearish.length})
            </span>
          </div>
          <div className="space-y-2">
            {bearish.map((s, i) => (
              <div
                key={i}
                className="p-2 rounded-lg text-xs"
                style={{
                  background: "rgba(248, 81, 73, 0.06)",
                  border: "1px solid rgba(248, 81, 73, 0.15)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-text-primary">{s.title}</span>
                  <WeightDots count={estimateWeight(s.detail)} />
                </div>
                <p className="text-text-secondary leading-relaxed">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Caution column */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <AlertTriangle size={14} className="text-accent-orange" />
            <span className="text-xs font-semibold text-accent-orange">
              Caution ({caution.length})
            </span>
          </div>
          <div className="space-y-2">
            {caution.map((s, i) => (
              <div
                key={i}
                className="p-2 rounded-lg text-xs"
                style={{
                  background: "rgba(255, 165, 0, 0.06)",
                  border: "1px solid rgba(255, 165, 0, 0.15)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-text-primary">{s.title}</span>
                  <WeightDots count={estimateWeight(s.detail)} />
                </div>
                <p className="text-text-secondary leading-relaxed">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
