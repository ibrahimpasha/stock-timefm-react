interface BullBearBarProps {
  /** Number of bullish votes */
  bull: number;
  /** Total number of votes */
  total: number;
  /** Height in pixels */
  height?: number;
  /** Whether to show labels */
  showLabels?: boolean;
}

export function BullBearBar({
  bull,
  total,
  height = 24,
  showLabels = true,
}: BullBearBarProps) {
  const bear = total - bull;
  const bullPct = total > 0 ? (bull / total) * 100 : 50;
  const bearPct = 100 - bullPct;

  return (
    <div className="w-full">
      {showLabels && (
        <div className="flex justify-between text-xs num mb-1">
          <span style={{ color: "var(--accent-green)" }}>
            Bull {bullPct.toFixed(0)}%
          </span>
          <span style={{ color: "var(--accent-red)" }}>
            {bearPct.toFixed(0)}% bear
          </span>
        </div>
      )}
      <div
        className="flex w-full gap-0.5 overflow-hidden rounded-[3px]"
        style={{ height: `${height}px`, background: "var(--track)" }}
      >
        <div
          className="rounded-l-[3px] transition-all duration-300"
          style={{
            width: `${bullPct}%`,
            background: "var(--accent-green)",
            height: "100%",
            opacity: 1,
          }}
        />
        <div
          className="rounded-r-[3px] transition-all duration-300"
          style={{
            width: `${bearPct}%`,
            background: "var(--accent-red)",
            height: "100%",
            opacity: 1,
          }}
        />
      </div>
      {showLabels && (
        <div className="flex justify-between text-xs text-text-secondary mt-0.5">
          <span>{bull} models</span>
          <span>{bear} models</span>
        </div>
      )}
    </div>
  );
}
