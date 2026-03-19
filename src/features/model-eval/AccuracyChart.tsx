import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { MODEL_COLORS, MODEL_LABELS } from "../../lib/constants";
import type { DailyMetric } from "../../lib/types";

interface AccuracyChartProps {
  /** Map of model name to its daily metrics */
  metricsMap: Record<string, DailyMetric[]>;
  isLoading: boolean;
}

interface ChartDataPoint {
  date: string;
  [model: string]: number | string;
}

export function AccuracyChart({ metricsMap, isLoading }: AccuracyChartProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-64 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  const modelNames = Object.keys(metricsMap);

  if (modelNames.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Accuracy Over Time</h2>
        <p className="text-xs text-text-muted text-center py-8">No metrics data available.</p>
      </div>
    );
  }

  // Merge all models' metrics into a single data array keyed by date
  const dateMap = new Map<string, ChartDataPoint>();
  for (const model of modelNames) {
    for (const m of metricsMap[model]) {
      if (!dateMap.has(m.date)) {
        dateMap.set(m.date, { date: m.date });
      }
      const point = dateMap.get(m.date)!;
      point[model] = m.dir_acc;
    }
  }

  const chartData = Array.from(dateMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text-secondary mb-4">Accuracy Over Time</h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.3)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(d: string) => {
              const dt = new Date(d);
              return `${dt.getMonth() + 1}/${dt.getDate()}`;
            }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--border)" }}
            label={{
              value: "Dir Acc %",
              angle: -90,
              position: "insideLeft",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "11px",
            }}
            labelStyle={{ color: "var(--text-primary)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: "11px" }}
            formatter={(value: string) => MODEL_LABELS[value] || value}
          />
          {modelNames.map((model) => (
            <Line
              key={model}
              type="monotone"
              dataKey={model}
              stroke={MODEL_COLORS[model] || "var(--text-secondary)"}
              strokeWidth={2}
              dot={false}
              connectNulls
              name={model}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
