/**
 * Shared atomic UI primitives for the Command Center v2 redesign.
 *
 * Used across the new CC v2 feature components (FlowTape, TickerHero,
 * ScanGrid, IntelligencePanelV2). No external deps beyond React + lucide.
 */
import { useMemo } from "react";

/* ── Sparkline ────────────────────────────────────────────── */

interface SparkProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}

export function Sparkline({
  points,
  width = 80,
  height = 18,
  color = "var(--text-secondary)",
  fill = false,
}: SparkProps) {
  if (!points || points.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const pts = points
    .map((p, i) => `${(i * step).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`)
    .join(" L");
  const d = `M${pts}`;
  const last = points[points.length - 1];
  const lastY = height - ((last - min) / span) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {fill && <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={lastY} r="1.6" fill={color} />
    </svg>
  );
}

/** Stable, deterministic sparkline generator from a string seed. */
export function useSparkSeed(seed: string, len = 24, trend = 0): number[] {
  return useMemo(() => {
    const s = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
    const out: number[] = [];
    let v = 50;
    for (let i = 0; i < len; i++) {
      const noise = (Math.sin(s + i * 1.7) + Math.cos(s * 0.3 + i * 0.6)) * 4;
      v += noise + trend * 0.5;
      out.push(v);
    }
    return out;
  }, [seed, len, trend]);
}

/* ── Intraday range bar ──────────────────────────────────── */

interface RangeBarProps {
  low: number;
  high: number;
  last: number;
  width?: number | string;
}

export function RangeBar({ low, high, last, width = 100 }: RangeBarProps) {
  const pad = (high - low) * 0.1 || 0.1;
  const dispLo = low - pad;
  const dispHi = high + pad;
  const tickPct = ((last - dispLo) / (dispHi - dispLo)) * 100;
  const fillStart = ((low - dispLo) / (dispHi - dispLo)) * 100;
  const fillEnd = ((high - dispLo) / (dispHi - dispLo)) * 100;
  return (
    <div
      style={{
        width,
        height: 4,
        background: "rgba(48,54,61,0.6)",
        borderRadius: 2,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${fillStart}%`,
          width: `${fillEnd - fillStart}%`,
          background: "var(--accent-blue)",
          opacity: 0.35,
          borderRadius: 2,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -2,
          bottom: -2,
          left: `calc(${tickPct}% - 1px)`,
          width: 2,
          background: "var(--text-primary)",
          boxShadow: "0 0 0 1px var(--bg-primary)",
        }}
      />
    </div>
  );
}

/* ── Dot gauge (confidence) ──────────────────────────────── */

interface DotGaugeProps {
  value: number;
  max?: number;
  color?: string;
}

export function DotGauge({ value, max = 100, color = "var(--accent-blue)" }: DotGaugeProps) {
  const total = 20;
  const filled = Math.round((value / max) * total);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 6px)", gridAutoRows: "6px", gap: 2 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 6,
            background: i < filled ? color : "rgba(72,79,88,0.45)",
          }}
        />
      ))}
    </div>
  );
}

/* ── Tag ─────────────────────────────────────────────────── */

interface TagProps {
  children: React.ReactNode;
  color?: string;
  bg?: string;
  border?: string;
}

export function Tag({ children, color = "var(--text-secondary)", bg = "transparent", border }: TagProps) {
  return (
    <span
      className="font-mono"
      style={{
        fontSize: 9.5,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color,
        background: bg,
        padding: "2px 5px",
        border: border ? `1px solid ${border}` : "none",
        borderRadius: 2,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

/* ── Panel ───────────────────────────────────────────────── */

interface PanelProps {
  title: string;
  accent?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  padding?: number;
  className?: string;
  /** Override the default border color (e.g. for bias-tinted frames). */
  borderColor?: string;
  /** Optional CSS box-shadow for a subtle glow around the border. */
  boxShadow?: string;
}

export function Panel({ title, accent, right, children, padding = 10, className = "", borderColor, boxShadow }: PanelProps) {
  return (
    <section
      className={className}
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${borderColor || "var(--border)"}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
        ...(boxShadow ? { boxShadow } : {}),
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(22,27,34,0.6)",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {accent && <div style={{ width: 3, height: 11, background: accent }} />}
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: "var(--text-primary)",
              fontWeight: 600,
            }}
          >
            {title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
      </header>
      <div style={{ padding, flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
    </section>
  );
}
