interface ConfidenceGaugeProps {
  /** Confidence value 0-1 */
  value: number;
  /** Size of the gauge in pixels */
  size?: number;
  /** Label below the number */
  label?: string;
}

export function ConfidenceGauge({
  value,
  size = 120,
  label = "Confidence",
}: ConfidenceGaugeProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);

  // SVG arc geometry
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - 16) / 2;
  const startAngle = -210;
  const endAngle = 30;
  const totalArc = endAngle - startAngle; // 240 degrees
  const sweepAngle = startAngle + totalArc * clamped;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Background arc endpoints
  const bgX1 = cx + r * Math.cos(toRad(startAngle));
  const bgY1 = cy + r * Math.sin(toRad(startAngle));
  const bgX2 = cx + r * Math.cos(toRad(endAngle));
  const bgY2 = cy + r * Math.sin(toRad(endAngle));

  // Value arc endpoint
  const valX2 = cx + r * Math.cos(toRad(sweepAngle));
  const valY2 = cy + r * Math.sin(toRad(sweepAngle));

  const largeArcBg = totalArc > 180 ? 1 : 0;
  const valueArcDeg = totalArc * clamped;
  const largeArcVal = valueArcDeg > 180 ? 1 : 0;

  // Color based on confidence level
  let color: string;
  if (pct >= 70) color = "var(--accent-green)";
  else if (pct >= 40) color = "var(--accent-orange)";
  else color = "var(--accent-red)";

  const bgArc = `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArcBg} 1 ${bgX2} ${bgY2}`;
  const valArc =
    clamped > 0.001
      ? `M ${bgX1} ${bgY1} A ${r} ${r} 0 ${largeArcVal} 1 ${valX2} ${valY2}`
      : "";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <path
          d={bgArc}
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth={6}
          strokeLinecap="round"
          opacity={0.3}
        />
        {/* Value arc */}
        {valArc && (
          <path
            d={valArc}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
          />
        )}
        {/* Center text */}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={size * 0.28}
          fontFamily="var(--font-mono)"
          fontWeight="bold"
        >
          {pct}%
        </text>
      </svg>
      <span
        className="text-text-secondary text-xs -mt-2"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {label}
      </span>
    </div>
  );
}
