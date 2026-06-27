import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import { Shield, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import type { TrustScore } from "../../lib/types";

interface TrustScoresProps {
  scores: TrustScore[];
  isLoading?: boolean;
  /** Models the router currently picked for this ticker (in order). When
   *  set, these rows get a star + accent so the user sees which leaderboard
   *  entries are actively driving the live signal. */
  pickedModels?: string[];
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

export function TrustScores({ scores, isLoading, pickedModels }: TrustScoresProps) {
  const picked = new Set((pickedModels ?? []).map((m) => m.toLowerCase()));
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
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center justify-between gap-1.5 mb-4">
        <span className="flex items-center gap-1.5">
          <Shield size={13} />
          Trust Scores
        </span>
        {picked.size > 0 && (
          <span className="flex items-center gap-1 text-[10px] normal-case text-text-muted">
            <Star size={10} style={{ color: "var(--accent-yellow, #f0c040)" }} fill="currentColor" />
            picked for this ticker
          </span>
        )}
      </h3>

      <div className="space-y-2.5">
        {sorted.map((entry) => {
          const modelColor = MODEL_COLORS[entry.model] || "var(--text-secondary)";
          const label = MODEL_LABELS[entry.model] || entry.model;
          const barColor = getTrustColor(entry.score);
          const barWidth = Math.max(entry.score, 3);
          const isPicked = picked.has(entry.model.toLowerCase());

          return (
            <div
              key={entry.model}
              className={isPicked ? "rounded px-1.5 py-1 -mx-1.5" : ""}
              style={
                isPicked
                  ? { background: "color-mix(in srgb, var(--accent-yellow) 7%, transparent)", outline: "1px solid color-mix(in srgb, var(--accent-yellow) 25%, transparent)" }
                  : undefined
              }
            >
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="font-mono flex items-center gap-1" style={{ color: modelColor }}>
                  {isPicked && (
                    <Star
                      size={10}
                      style={{ color: "var(--accent-yellow, #f0c040)" }}
                      fill="currentColor"
                    />
                  )}
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
                style={{ background: "color-mix(in srgb, var(--text-muted) 20%, transparent)" }}
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
