import { Award } from "lucide-react";
import { MODEL_LABELS, MODEL_COLORS } from "../../lib/constants";
import type { LeaderboardEntry } from "../../lib/types";

interface PodiumProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
}

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];
const MEDAL_LABELS = ["1st", "2nd", "3rd"];

export function Podium({ entries, isLoading }: PodiumProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-48 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  // Sort by trust score descending, take top 3
  const sorted = [...entries].sort((a, b) => b.trust_score - a.trust_score);
  const top3 = sorted.slice(0, 3);

  if (top3.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Podium</h2>
        <p className="text-xs text-text-muted text-center py-8">No evaluation data yet.</p>
      </div>
    );
  }

  // Display order: 2nd, 1st, 3rd for visual podium effect
  const displayOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const heights = top3.length >= 3 ? [100, 140, 80] : top3.map(() => 120);
  const medalIndices = top3.length >= 3 ? [1, 0, 2] : top3.map((_, i) => i);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-6">
        <Award size={16} className="text-accent-orange" />
        <h2 className="text-sm font-semibold text-text-secondary">Podium</h2>
      </div>

      <div className="flex items-end justify-center gap-4">
        {displayOrder.map((entry, i) => {
          const medalIdx = medalIndices[i];
          const label = MODEL_LABELS[entry.model] || entry.model;
          const color = MODEL_COLORS[entry.model] || "var(--text-secondary)";

          return (
            <div key={entry.model} className="flex flex-col items-center">
              {/* Medal icon */}
              <Award size={24} style={{ color: MEDAL_COLORS[medalIdx] }} />
              <span
                className="text-xs font-bold mt-1"
                style={{ color: MEDAL_COLORS[medalIdx] }}
              >
                {MEDAL_LABELS[medalIdx]}
              </span>

              {/* Model name */}
              <span
                className="text-sm font-semibold font-mono mt-2"
                style={{ color }}
              >
                {label}
              </span>

              {/* Trust score */}
              <span className="text-lg font-bold font-mono text-text-primary mt-1">
                {entry.trust_score.toFixed(1)}
              </span>
              <span className="text-xs text-text-muted">trust</span>

              {/* Podium bar */}
              <div
                className="w-20 rounded-t-lg mt-2 transition-all duration-500"
                style={{
                  height: `${heights[i]}px`,
                  background: `linear-gradient(to top, ${color}40, ${color}10)`,
                  border: `1px solid ${color}60`,
                  borderBottom: "none",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
