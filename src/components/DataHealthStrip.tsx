import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { useDataHealth, type HealthStatus } from "../api/dataHealth";
import { relativeAge } from "../lib/utils";

const STATUS_VAR: Record<HealthStatus, string> = {
  green: "var(--accent-green)",
  amber: "var(--accent-yellow)",
  red: "var(--accent-red)",
  unknown: "var(--text-muted)",
};

function Dot({ status, pulse }: { status: HealthStatus; pulse?: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
        pulse && status !== "green" ? "animate-pulse" : ""
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
  const { data, isError } = useDataHealth();
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
        className="flex items-center gap-1.5 p-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors max-md:p-1.5"
      >
        <Activity size={16} />
        <Dot status={overall} pulse />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-border bg-bg-card shadow-xl p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-text-primary">
              Data feeds
            </span>
            {data && (
              <span className="text-xs text-text-muted">
                checked {relativeAge(data.generated_at)}
              </span>
            )}
          </div>
          {isError && (
            <div className="px-2 py-1.5 text-xs" style={{ color: "var(--accent-red)" }}>
              Health endpoint unreachable — is the API server up?
            </div>
          )}
          {data?.sources.map((s) => (
            <div
              key={s.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-card-hover"
            >
              <Dot status={s.status} />
              <span className="text-xs text-text-primary flex-1 truncate">
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
                className="text-xs tabular-nums shrink-0"
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
