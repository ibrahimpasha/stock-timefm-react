import { useState, type ReactNode } from "react";

export interface StripBar {
  key: string;
  label: string;
  up: number;
  down: number;
}

/** Up above a shared baseline, down below it, one column per period. The readout line
 *  replaces a floating tooltip, so it works the same under a finger as under a mouse. */
export function DivergingStrip({
  bars,
  ariaLabel,
  summary,
  describe,
  axis,
  height = 88,
}: {
  bars: StripBar[];
  ariaLabel: string;
  summary: ReactNode;
  describe: (bar: StripBar) => ReactNode;
  axis: [string, string, string];
  height?: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxUp = Math.max(0, ...bars.map((bar) => bar.up));
  const maxDown = Math.max(0, ...bars.map((bar) => bar.down));
  const scale = maxUp + maxDown ? height / (maxUp + maxDown) : 0;
  const active = bars.find((bar) => bar.key === hovered);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="num m-0 min-h-5 truncate text-xs text-text-secondary" aria-live="off">
        {active ? describe(active) : summary}
      </p>
      <div
        className="strip"
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
        onPointerLeave={() => setHovered(null)}
      >
        {bars.map((bar) => (
          <div
            key={bar.key}
            className="strip__col"
            data-dim={hovered && hovered !== bar.key ? "" : undefined}
            onPointerEnter={() => setHovered(bar.key)}
            onPointerDown={() => setHovered(bar.key)}
          >
            <span style={{ height: maxUp * scale }} className="strip__half strip__half--up">
              {bar.up > 0 && <i style={{ height: Math.max(2, bar.up * scale) }} />}
            </span>
            <span style={{ height: maxDown * scale }} className="strip__half strip__half--down">
              {bar.down > 0 && <i style={{ height: Math.max(2, bar.down * scale) }} />}
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-text-muted">
        {axis.map((label, index) => <span key={index}>{label}</span>)}
      </div>
    </div>
  );
}
