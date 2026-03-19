interface SparklineChartProps {
  /** Array of numeric values to plot */
  data: number[];
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Stroke color — defaults to accent-blue */
  color?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Whether to show a filled area under the line */
  fill?: boolean;
}

export function SparklineChart({
  data,
  width = 100,
  height = 30,
  color = "var(--accent-blue)",
  strokeWidth = 1.5,
  fill = false,
}: SparklineChartProps) {
  if (!data.length) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pad = 2;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const points = data.map((val, i) => {
    const x = pad + (i / (data.length - 1 || 1)) * plotW;
    const y = pad + plotH - ((val - min) / range) * plotH;
    return `${x},${y}`;
  });

  const polyline = points.join(" ");
  const fillPath = fill
    ? `M ${pad},${pad + plotH} L ${polyline
        .split(" ")
        .map((p) => `L ${p}`)
        .join(" ")} L ${pad + plotW},${pad + plotH} Z`
        .replace("L L", "L")
    : undefined;

  // Determine if the trend is up or down for auto-coloring
  const trendColor =
    color === "auto"
      ? data[data.length - 1] >= data[0]
        ? "var(--accent-green)"
        : "var(--accent-red)"
      : color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block"
    >
      {fill && fillPath && (
        <path d={fillPath} fill={trendColor} opacity={0.15} />
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={trendColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
