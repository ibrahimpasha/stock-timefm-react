import type { ReactNode } from "react";
import { useSlidingPill } from "../lib/useSlidingPill";
import { Tick } from "./Cockpit";

export interface KpiTabOption<T extends string> {
  key: T;
  label: ReactNode;
  value: string;
  delta?: ReactNode;
  deltaColor?: string;
  sub?: ReactNode;
  dot?: string;
  title?: string;
}

/** KPIs that are also the control: picking one drives whatever sits below it, so a
 *  headline number and the view it explains can never disagree. */
export function KpiTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: KpiTabOption<T>[];
  value: T;
  onChange: (key: T) => void;
  ariaLabel: string;
}) {
  // Options load in stages, so re-place the highlight when the set changes, not just the pick.
  const { container, pill } = useSlidingPill(`${value}|${options.map((option) => option.key).join()}`);
  return (
    <div ref={container} role="group" aria-label={ariaLabel} className="kpi-tabs">
      <span ref={pill} className="sliding-pill kpi-tabs__pill" aria-hidden="true" />
      {options.map((option) => {
        const active = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            className="kpi-tab"
            aria-pressed={active}
            data-pill={active ? "on" : undefined}
            title={option.title}
            onClick={() => onChange(option.key)}
          >
            <span className="kpi-tab__label">
              {option.dot && <span className="kpi-tab__dot" style={{ background: option.dot }} aria-hidden="true" />}
              <span className="truncate">{option.label}</span>
            </span>
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="kpi-tab__value num"><Tick value={option.value} /></span>
              {option.delta != null && (
                <span className="num text-sm font-medium" style={{ color: option.deltaColor }}>{option.delta}</span>
              )}
            </span>
            {option.sub && <span className="text-xs text-text-muted">{option.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
