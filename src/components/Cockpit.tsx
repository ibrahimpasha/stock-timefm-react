import type { CSSProperties, ReactNode } from "react";

/* v3 "cockpit" building blocks (DESIGN.md "v3 cockpit"). Pages are a 12-col
 * grid of Tiles; numbers become bars/tiles/gauges instead of sentences.
 * Tokens only. Up/down color is for signed values; --accent is interaction. */

type Tone = "up" | "down" | "neutral" | "accent" | "warn" | "info";

const TONE_VAR: Record<Tone, string> = {
  up: "var(--accent-green)",
  down: "var(--accent-red)",
  neutral: "var(--text-primary)",
  accent: "var(--accent)",
  warn: "var(--accent-orange)",
  info: "var(--accent-blue)",
};

export const toneOf = (n: number | null | undefined): Tone =>
  n == null || n === 0 ? "neutral" : n > 0 ? "up" : "down";

export const toneColor = (t: Tone) => TONE_VAR[t];

/** 12-column page grid. Children set their own `span`. Collapses to one
 *  column below lg. */
export function TileGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-12 ${className}`}>{children}</div>;
}

const SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  9: "lg:col-span-9",
  12: "lg:col-span-12",
};

/** Panel on the cockpit grid: title + optional meta/actions, then content. */
export function Tile({
  title,
  meta,
  actions,
  span = 12,
  children,
  className = "",
  bodyClassName = "",
  id,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg-card p-4 lg:p-5 ${SPAN[span]} ${className}`}
    >
      {(title || meta || actions) && (
        <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && <h2 className="m-0 min-w-0 text-[0.9375rem] font-semibold text-text-primary">{title}</h2>}
          {meta && <span className="text-xs text-text-muted">{meta}</span>}
          {actions && <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={`flex min-w-0 flex-col gap-2 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Big figure for KPI strips. */
export function Kpi({
  label,
  value,
  delta,
  tone = "neutral",
  sub,
  size = "lg",
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const vs = size === "xl" ? "text-4xl" : size === "lg" ? "text-[1.75rem]" : "text-xl";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-xs text-text-muted">{label}</span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
        <span className={`num ${vs} font-semibold leading-tight tracking-tight text-text-primary`}>{value}</span>
        {delta != null && (
          <span className="num text-sm font-semibold" style={{ color: TONE_VAR[tone] }}>
            {delta}
          </span>
        )}
      </div>
      {sub && <span className="truncate text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

/** KPI tile: a Tile holding one Kpi (for the top-of-page strip). */
export function KpiTile(props: Parameters<typeof Kpi>[0] & { span?: 3 | 4 | 6 }) {
  const { span = 3, ...kpi } = props;
  return (
    <Tile span={span}>
      <Kpi {...kpi} />
    </Tile>
  );
}

/** One horizontal bar row. `diverging` centers zero (signed values);
 *  otherwise the bar grows from the left. `max` is the |value| that fills. */
export function BarRow({
  label,
  value,
  max,
  display,
  tone,
  diverging = false,
  trailing,
  onClick,
  title,
}: {
  label: ReactNode;
  value: number;
  max: number;
  display: ReactNode;
  tone?: Tone;
  diverging?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const t = tone ?? toneOf(value);
  const fill = TONE_VAR[t === "neutral" ? "info" : t];
  const bar: CSSProperties = { width: `${Math.max(pct, value ? 2 : 0)}%`, background: fill };
  const body = (
    <>
      <span className="ticker min-w-0 truncate text-[0.8125rem]">{label}</span>
      {diverging ? (
        <div className="grid grid-cols-2">
          <div className="flex justify-end">{value < 0 && <span className="h-3 rounded-l-[3px]" style={bar} />}</div>
          <div className="flex border-l border-border">{value > 0 && <span className="h-3 rounded-r-[3px]" style={bar} />}</div>
        </div>
      ) : (
        <div className="h-3.5 rounded-[3px]" style={{ background: "var(--track)" }}>
          <div className="h-3.5 rounded-[3px]" style={bar} />
        </div>
      )}
      <span className="num text-right text-[0.8125rem]" style={{ color: diverging ? TONE_VAR[t] : undefined }}>
        {display}
      </span>
      {trailing !== undefined && <span className="num text-right text-xs text-text-muted">{trailing}</span>}
    </>
  );
  const cols = trailing !== undefined ? "4.25rem minmax(0,1fr) 4.5rem 2.75rem" : "4.25rem minmax(0,1fr) 4.5rem";
  const cls = "grid min-h-6 items-center gap-2.5 rounded-md px-1 text-left";
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={`${cls} data-row w-full`} style={{ gridTemplateColumns: cols }}>
      {body}
    </button>
  ) : (
    <div title={title} className={cls} style={{ gridTemplateColumns: cols }}>
      {body}
    </div>
  );
}

/** Colored tile whose fill strength encodes a ratio around 1 (heat) or a
 *  signed value. intensity 0..1. */
export function HeatTile({
  label,
  value,
  intensity,
  tone,
  sub,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  intensity: number;
  tone: "up" | "down";
  sub?: ReactNode;
  onClick?: () => void;
}) {
  const a = Math.round(8 + Math.max(0, Math.min(1, intensity)) * 34);
  const style: CSSProperties = { background: `color-mix(in srgb, ${TONE_VAR[tone]} ${a}%, var(--bg-card))` };
  const inner = (
    <>
      <span className="truncate text-xs text-text-secondary">{label}</span>
      <span className="num text-lg font-semibold text-text-primary">{value}</span>
      {sub && <span className="truncate text-xs text-text-muted">{sub}</span>}
    </>
  );
  const cls = "flex min-w-0 flex-col gap-0.5 rounded-lg p-3 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-transform hover:-translate-y-px`} style={style}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

/** Linear gauge with a marker, e.g. VIX on a 10-40 scale. */
export function Gauge({ value, min, max, ticks }: { value: number; min: number; max: number; ticks: string[] }) {
  const pos = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="relative h-2.5 rounded-full"
        style={{ background: "linear-gradient(90deg, var(--accent-green), var(--accent-yellow) 55%, var(--accent-red))" }}
      >
        <span
          className="absolute -top-1 h-[18px] w-1 rounded-sm bg-text-primary"
          style={{ left: `calc(${pos}% - 2px)` }}
          aria-hidden="true"
        />
      </div>
      <div className="num flex justify-between text-xs text-text-muted">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** Decision card (home "needs you" feed). */
export function ActionCard({
  kind,
  tone = "neutral",
  when,
  ticker,
  delta,
  deltaTone = "neutral",
  title,
  children,
  actions,
}: {
  kind: ReactNode;
  tone?: Tone;
  when?: ReactNode;
  ticker?: ReactNode;
  delta?: ReactNode;
  deltaTone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const c = TONE_VAR[tone];
  return (
    <article
      className="flex min-w-0 flex-col gap-2.5 rounded-xl border p-4 lg:p-5"
      style={{
        background: tone === "neutral" ? "var(--bg-card)" : `color-mix(in srgb, ${c} 7%, var(--bg-card))`,
        borderColor: tone === "neutral" ? "var(--border)" : `color-mix(in srgb, ${c} 28%, var(--border))`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold" style={{ color: tone === "neutral" ? "var(--text-muted)" : c }}>
          {kind}
        </span>
        {when && <span className="text-xs text-text-muted">{when}</span>}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {ticker && <span className="ticker text-xl">{ticker}</span>}
        {delta && (
          <span className="num text-base font-semibold" style={{ color: TONE_VAR[deltaTone] }}>
            {delta}
          </span>
        )}
        {title && <span className="text-base font-semibold text-text-primary">{title}</span>}
      </div>
      {children && <div className="max-w-[70ch] text-sm leading-relaxed text-text-secondary">{children}</div>}
      {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
    </article>
  );
}

/** Primary / ghost buttons matching the cockpit. */
export function CockpitButton({
  children,
  onClick,
  primary = false,
  href,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  href?: string;
  title?: string;
  disabled?: boolean;
}) {
  const cls = `inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold no-underline transition-colors disabled:opacity-50 ${
    primary
      ? "bg-accent text-[var(--accent-ink)] hover:brightness-110"
      : "border border-border bg-bg-card-hover text-text-primary hover:border-[var(--control-boundary)]"
  }`;
  return href ? (
    <a href={href} className={cls} title={title}>
      {children}
    </a>
  ) : (
    <button type="button" className={cls} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}
