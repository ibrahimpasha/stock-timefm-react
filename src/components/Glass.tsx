import type { ReactNode } from "react";

/* Shared atoms for the glass design language. Consume tokens only — no
 * literal colors. See DESIGN_SPEC.md at the repo root for usage rules. */

export function GlassPanel({
  title,
  actions,
  children,
  className = "",
  interactive = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <section className={`card ${interactive ? "card-interactive" : ""} ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 mb-3">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export type ChipTone =
  | "neutral"
  | "green"
  | "red"
  | "blue"
  | "purple"
  | "orange"
  | "yellow"
  | "cyan";

const CHIP_TONE_VAR: Record<Exclude<ChipTone, "neutral">, string> = {
  green: "--accent-green",
  red: "--accent-red",
  blue: "--accent-blue",
  purple: "--accent-purple",
  orange: "--accent-orange",
  yellow: "--accent-yellow",
  cyan: "--accent-cyan",
};

/** Pill chip. Tinted background derives from the accent var at low alpha via
 * color-mix so it tracks both themes automatically. */
export function Chip({
  tone = "neutral",
  children,
  className = "",
  title,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  if (tone === "neutral") {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border text-text-secondary ${className}`}
      >
        {children}
      </span>
    );
  }
  const v = `var(${CHIP_TONE_VAR[tone]})`;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
      style={{
        color: v,
        backgroundColor: `color-mix(in srgb, ${v} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${v} 30%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

/** Headline number + label, for summary strips. */
export function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: "green" | "red";
  sub?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-text-muted truncate">{label}</span>
      <span
        className="text-sm font-semibold num truncate"
        style={
          tone
            ? { color: `var(--accent-${tone})` }
            : { color: "var(--text-primary)" }
        }
      >
        {value}
      </span>
      {sub && <span className="text-xs text-text-muted truncate">{sub}</span>}
    </div>
  );
}

/** Segmented control — the tab language for the remodel (replaces ad-hoc
 * button rows). Controlled: pass value + onChange. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: ReactNode; badge?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-full border border-border ${className}`}
      style={{ background: "var(--glass-bg)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
              active
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
            style={
              active
                ? {
                    background: "var(--bg-card-hover)",
                    boxShadow: "var(--shadow-1)",
                  }
                : undefined
            }
          >
            {o.label}
            {o.badge}
          </button>
        );
      })}
    </div>
  );
}
