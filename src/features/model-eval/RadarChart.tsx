import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import type { LeaderboardEntry } from "../../lib/types";

interface RadarChartProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
}

interface RadarDataPoint {
  metric: string;
  [model: string]: number | string;
}

/**
 * Normalize a value to 0-100 scale for radar display.
 * For MAPE and RMSE, lower is better, so we invert.
 */
function normalizeMetric(
  value: number,
  min: number,
  max: number,
  invert: boolean
): number {
  if (max === min) return 50;
  const norm = ((value - min) / (max - min)) * 100;
  return invert ? 100 - norm : norm;
}

export function RadarChart({ entries, isLoading }: RadarChartProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-64 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Radar Comparison</h2>
        <p className="text-xs text-text-muted text-center py-8">No data available.</p>
      </div>
    );
  }

  // Take top 5 models by trust score for readability
  const top = [...entries].sort((a, b) => b.trust_score - a.trust_score).slice(0, 5);

  // Compute ranges for normalization
  const mapeRange = { min: Math.min(...top.map((e) => e.mape)), max: Math.max(...top.map((e) => e.mape)) };
  const rmseRange = { min: Math.min(...top.map((e) => e.rmse)), max: Math.max(...top.map((e) => e.rmse)) };
  const dirRange = { min: Math.min(...top.map((e) => e.dir_acc)), max: Math.max(...top.map((e) => e.dir_acc)) };
  const trustRange = { min: Math.min(...top.map((e) => e.trust_score)), max: Math.max(...top.map((e) => e.trust_score)) };

  const metrics: { key: string; label: string; invert: boolean; range: { min: number; max: number } }[] = [
    { key: "mape", label: "MAPE", invert: true, range: mapeRange },
    { key: "rmse", label: "RMSE", invert: true, range: rmseRange },
    { key: "dir_acc", label: "Direction Acc", invert: false, range: dirRange },
    { key: "trust_score", label: "Trust Score", invert: false, range: trustRange },
  ];

  const radarData: RadarDataPoint[] = metrics.map((m) => {
    const point: RadarDataPoint = { metric: m.label };
    for (const entry of top) {
      const val = entry[m.key as keyof LeaderboardEntry] as number;
      point[entry.model] = normalizeMetric(val, m.range.min, m.range.max, m.invert);
    }
    return point;
  });

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text-secondary mb-4">Radar Comparison</h2>
      <ResponsiveContainer width="100%" height={300}>
        <RechartsRadarChart data={radarData}>
          <PolarGrid stroke="rgba(48,54,61,0.4)" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={{ fill: "var(--text-muted)", fontSize: 9 }}
            axisLine={false}
          />
          {top.map((entry) => (
            <Radar
              key={entry.model}
              name={MODEL_LABELS[entry.model] || entry.model}
              dataKey={entry.model}
              stroke={MODEL_COLORS[entry.model] || "var(--text-secondary)"}
              fill={MODEL_COLORS[entry.model] || "var(--text-secondary)"}
              fillOpacity={0.1}
              strokeWidth={2}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
          />
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
}
