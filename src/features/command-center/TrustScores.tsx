import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { Shield, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { TrustScore } from "../../lib/types";

interface TrustScoresProps {
  scores: TrustScore[];
  isLoading?: boolean;
}

function getTrustColor(score: number): string {
  if (score >= 70) return "var(--accent-green)";
  if (score >= 50) return "var(--accent-blue)";
  if (score >= 30) return "var(--accent-orange)";
  return "var(--accent-red)";
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp size={11} style={{ color: "var(--accent-green)" }} />;
  if (trend === "down") return <TrendingDown size={11} style={{ color: "var(--accent-red)" }} />;
  return <Minus size={11} style={{ color: "var(--text-muted)" }} />;
}

function SkeletonTrust() {
  return (
    <div className="card animate-pulse">
      <div className="h-4 w-24 rounded bg-text-muted/20 mb-4" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-2 mb-3">
          <div className="h-3 w-16 rounded bg-text-muted/20" />
          <div className="h-4 rounded bg-text-muted/20 flex-1" />
          <div className="h-3 w-8 rounded bg-text-muted/20" />
        </div>
      ))}
    </div>
  );
}

export function TrustScores({ scores, isLoading }: TrustScoresProps) {
  if (isLoading) return <SkeletonTrust />;

  if (!scores || scores.length === 0) {
    return (
      <div className="card">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-3">
          <Shield size={13} />
          Trust Scores
        </h3>
        <p className="text-xs text-text-muted text-center py-4">
          No trust score data available
        </p>
      </div>
    );
  }

  // Sort by score descending
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div className="card">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-4">
        <Shield size={13} />
        Trust Scores
      </h3>

      <div className="space-y-2.5">
        {sorted.map((entry) => {
          const modelColor = MODEL_COLORS[entry.model] || "#8b949e";
          const label = MODEL_LABELS[entry.model] || entry.model;
          const barColor = getTrustColor(entry.score);
          const barWidth = Math.max(entry.score, 3);

          return (
            <div key={entry.model}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-mono" style={{ color: modelColor }}>
                  {label}
                </span>
                <div className="flex items-center gap-1.5">
                  <TrendIcon trend={entry.trend} />
                  <span className="font-mono font-semibold" style={{ color: barColor }}>
                    {entry.score.toFixed(0)}
                  </span>
                  <span className="text-text-muted">({entry.samples})</span>
                </div>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: "rgba(72,79,88,0.2)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${barWidth}%`,
                    background: `linear-gradient(90deg, ${barColor}60, ${barColor})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-xs text-text-muted mt-3 pt-2 border-t border-border font-mono">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}
