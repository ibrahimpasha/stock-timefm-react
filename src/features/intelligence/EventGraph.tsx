import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { IntelEvent } from "../../lib/types";

interface EventGraphProps {
  events: IntelEvent[];
  isLoading: boolean;
}

const TREND_COLORS: Record<string, string> = {
  escalating: "#f85149",
  stable: "#8b949e",
  "de-escalating": "#3fb950",
};

function getTrendColor(trend: string): string {
  const key = trend.toLowerCase();
  return TREND_COLORS[key] ?? "var(--text-muted)";
}

interface TooltipPayloadEntry {
  payload: {
    date: string;
    severity: number;
    summary: string;
    event_type: string;
    trend: string;
  };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div
      className="p-3 rounded-lg text-xs max-w-xs"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="font-semibold text-text-primary mb-1">{d.event_type}</div>
      <div className="text-text-secondary mb-1">{d.summary}</div>
      <div className="flex gap-3 text-text-muted">
        <span>{d.date}</span>
        <span>Severity: {d.severity}</span>
        <span style={{ color: getTrendColor(d.trend) }}>{d.trend}</span>
      </div>
    </div>
  );
}

export function EventGraph({ events, isLoading }: EventGraphProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-64 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Event Graph</h2>
        <p className="text-xs text-text-muted text-center py-8">No events available.</p>
      </div>
    );
  }

  const chartData = events.map((e) => ({
    date: e.event_date,
    dateTs: new Date(e.event_date).getTime(),
    severity: e.severity,
    summary: e.summary,
    event_type: e.event_type,
    trend: e.trend,
  }));

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text-secondary mb-4">Event Graph</h2>
      <div className="flex gap-4 mb-3 text-xs">
        {Object.entries(TREND_COLORS).map(([trend, color]) => (
          <div key={trend} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-text-muted capitalize">{trend}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(48,54,61,0.3)" />
          <XAxis
            dataKey="dateTs"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(ts: number) => {
              const d = new Date(ts);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            dataKey="severity"
            type="number"
            domain={[0, 10]}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border)" }}
            label={{
              value: "Severity",
              angle: -90,
              position: "insideLeft",
              fill: "var(--text-muted)",
              fontSize: 11,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={chartData}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={getTrendColor(entry.trend)} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
