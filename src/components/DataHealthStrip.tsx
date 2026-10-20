import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { useDataHealth, type HealthStatus } from "../api/dataHealth";
import { relativeAge } from "../lib/utils";
import { connectionIssue } from "../api/connectionIssue";

const STATUS_VAR: Record<HealthStatus, string> = {
  green: "var(--accent-green)",
  amber: "var(--accent-yellow)",
  red: "var(--accent-red)",
  unknown: "var(--text-muted)",
  paused: "var(--text-muted)",
};

function Dot({ status, pulse }: { status: HealthStatus; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        pulse && status !== "green" && status !== "paused" ? "animate-pulse" : ""
      }`}
      style={{ backgroundColor: STATUS_VAR[status] }}
    />
  );
}

/**
 * Navbar feed-health indicator. A single dot carries the worst status across
 * all core backend feeds; the popover breaks it down per source with ages.
 * Exists because dead pipelines historically rendered as clean empty states —
 * this makes "technicals haven't updated in 9 days" visible at a glance.
 */
export function DataHealthStrip() {
  const { data, isError, error } = useDataHealth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // The health endpoint being down is itself a red condition.
  const overall: HealthStatus = isError ? "red" : data?.overall ?? "unknown";

  return (
    <div ref={ref} className="relative ml-auto shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Backend feed health"
        aria-label="Backend feed health"
        className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary lg:min-h-0 lg:min-w-0 lg:p-2"
      >
        <Activity size={16} />
        <Dot status={overall} pulse />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(21rem,calc(100vw-1rem))] rounded-xl border border-border bg-bg-card p-2" style={{ boxShadow: "var(--shadow-3)" }}>
          <div className="flex items-baseline justify-between gap-3 px-2 pb-2 pt-1">
            <span className="text-[0.9375rem] font-semibold leading-tight text-text-primary">
              Data feeds
            </span>
            {data && (
              <span className="text-xs text-text-muted">
                checked {relativeAge(data.generated_at)}
              </span>
            )}
          </div>
          {isError && (
            <div className="callout mx-1 mb-1" style={{ "--callout": "var(--accent-red)" } as React.CSSProperties}>
              {connectionIssue(error).message}
            </div>
          )}
          {data?.sources.map((s) => (
            <div
              key={s.key}
              className="data-row flex items-center gap-2.5 rounded-md px-2 py-1.5"
            >
              <Dot status={s.status} />
              <span className="text-sm text-text-primary flex-1 truncate">
                {s.label}
              </span>
              {s.note && (
                <span
                  className="text-xs truncate max-w-[90px]"
                  style={{
                    color:
                      s.status === "red"
                        ? "var(--accent-red)"
                        : "var(--text-muted)",
                  }}
                  title={s.note}
                >
                  {s.note}
                </span>
              )}
              <span
                className="num text-xs shrink-0"
                style={{ color: STATUS_VAR[s.status] }}
              >
                {s.age_human}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
