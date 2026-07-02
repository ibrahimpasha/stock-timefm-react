import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Info } from "lucide-react";

import { useNarrative } from "../../api/intelV3";
import type { NarrativeEvent } from "../../api/intelV3";
import { parseTimestampMs } from "../../lib/utils";

const SOURCE_COLOR: Record<string, string> = {
  news: "var(--accent-blue)",
  iflow: "var(--accent-cyan)",
  voices: "var(--accent-purple)",
  traders: "var(--accent-fuchsia)",
  forecast: "var(--accent-green)",
  earnings: "var(--accent-orange)",
  macro: "var(--accent-yellow)",
};

function colorForSource(source: string): string {
  return SOURCE_COLOR[source.toLowerCase()] ?? "var(--text-secondary)";
}

function fmtTime(ts: string): string {
  // backend strips tz info from event timestamps (naive UTC) — parse as UTC,
  // not local, or every event renders 7-8h in the future for a PT user
  const d = new Date(parseTimestampMs(ts));
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtSource(source: string): string {
  if (source.toLowerCase() === "iflow") return "iFlow";
  return source;
}

function refEntries(ref?: Record<string, unknown>): [string, string][] {
  if (!ref) return [];
  return Object.entries(ref)
    .filter(([, value]) => value != null && value !== "")
    .slice(0, 8)
    .map(([key, value]) => [
      key,
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value),
    ]);
}

function eventKey(event: NarrativeEvent, idx: number): string {
  return event.id || `${event.ts}-${event.source}-${event.kind}-${idx}`;
}

function NarrativeEventRow({
  event,
  expanded,
  onToggle,
}: {
  event: NarrativeEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = colorForSource(event.source);
  const refs = refEntries(event.ref);
  const hasExpansion = !!event.detail || refs.length > 0 || !!event.sentiment || event.strength != null;
  const nodeSize = Math.max(8, Math.min(14, 8 + Number(event.strength ?? 0) * 4));

  return (
    <div className="relative pl-6 pb-3 last:pb-0">
      <div
        className="absolute left-[3px] top-1 rounded-full border"
        style={{
          width: nodeSize,
          height: nodeSize,
          marginLeft: -(nodeSize - 8) / 2,
          background: color,
          borderColor: "color-mix(in srgb, var(--bg-card) 65%, transparent)",
          boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 13%, transparent)`,
        }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-text-muted">
          <span className="num">{fmtTime(event.ts)}</span>
          <span
            className="rounded-full px-2 py-0.5 font-medium"
            style={{
              color,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
            }}
          >
            {fmtSource(event.source)}
          </span>
          <span className="truncate">{event.kind}</span>
        </div>

        <button
          type="button"
          onClick={hasExpansion ? onToggle : undefined}
          className="mt-1 flex w-full items-start gap-1.5 text-left text-sm text-text-primary"
          aria-expanded={hasExpansion ? expanded : undefined}
        >
          {hasExpansion ? (
            expanded ? (
              <ChevronDown size={13} className="mt-0.5 shrink-0 text-text-muted" />
            ) : (
              <ChevronRight size={13} className="mt-0.5 shrink-0 text-text-muted" />
            )
          ) : (
            <span className="mt-1 h-3 w-[13px] shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
        </button>

        {expanded && hasExpansion && (
          <div
            className="mt-2 space-y-2 rounded border px-2.5 py-2 text-xs"
            style={{
              borderColor: `color-mix(in srgb, ${color} 24%, var(--border))`,
              background: "color-mix(in srgb, var(--bg-card-hover) 55%, transparent)",
            }}
          >
            {event.detail && <p className="text-text-secondary">{event.detail}</p>}
            {(event.sentiment || event.strength != null) && (
              <div className="flex flex-wrap gap-1.5">
                {event.sentiment && (
                  <span className="rounded bg-bg-card px-1.5 py-0.5 font-mono uppercase text-text-secondary">
                    sentiment {event.sentiment}
                  </span>
                )}
                {event.strength != null && (
                  <span className="rounded bg-bg-card px-1.5 py-0.5 font-mono uppercase text-text-secondary">
                    strength {Number(event.strength).toFixed(2)}
                  </span>
                )}
              </div>
            )}
            {refs.length > 0 && (
              <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1">
                {refs.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="truncate font-mono uppercase text-text-muted">{key}</dt>
                    <dd className="min-w-0 truncate text-text-secondary" title={value}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NarrativeTimeline({
  ticker,
  hours = 72,
}: {
  ticker: string;
  hours?: number;
}) {
  const { data, isLoading, isError } = useNarrative(ticker, hours);
  const [expanded, setExpanded] = useState<string | null>(null);

  const events = useMemo(
    () =>
      [...(data?.events ?? [])].sort((a, b) => {
        const at = parseTimestampMs(a.ts);
        const bt = parseTimestampMs(b.ts);
        if (Number.isNaN(at) || Number.isNaN(bt)) return a.ts.localeCompare(b.ts);
        return at - bt;
      }),
    [data?.events],
  );

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GitBranch size={14} className="text-accent-cyan" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Narrative Timeline
          </h3>
        </div>
        <div className="num flex items-center gap-2 text-xs uppercase text-text-muted">
          <span>{data?.summary.event_count ?? events.length} events</span>
          <span>{data?.window_hours ?? hours}h</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 rounded bg-text-muted/15" />
          <div className="h-4 w-5/6 rounded bg-text-muted/15" />
          <div className="h-4 w-2/3 rounded bg-text-muted/15" />
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 rounded border border-border bg-bg-card px-3 py-2 text-xs text-text-secondary">
          <Info size={13} className="mt-0.5 shrink-0 text-accent-orange" />
          Narrative events are unavailable for {ticker}. The rest of the analysis panel is unchanged.
        </div>
      ) : events.length === 0 ? (
        <div className="rounded border border-border bg-bg-card px-3 py-3 text-xs text-text-secondary">
          <p className="font-medium text-text-primary">No strong narrative events in this window.</p>
          <p className="mt-1">
            Quiet tape is not bearish by itself. It means news, flow, voices, traders, forecasts,
            earnings, and macro inputs did not produce strong evidence for {ticker} over the last{" "}
            {data?.window_hours ?? hours} hours.
          </p>
        </div>
      ) : (
        <>
          {data?.summary.sources_seen && data.summary.sources_seen.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {data.summary.sources_seen.map((source) => {
                const color = colorForSource(source);
                return (
                  <span
                    key={source}
                    className="rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wider"
                    style={{
                      color,
                      background: `color-mix(in srgb, ${color} 10%, transparent)`,
                    }}
                  >
                    {fmtSource(source)}
                  </span>
                );
              })}
            </div>
          )}
          <div className="relative">
            <div className="absolute bottom-1 left-[6px] top-1 w-px bg-border" />
            {events.map((event, idx) => {
              const key = eventKey(event, idx);
              return (
                <NarrativeEventRow
                  key={key}
                  event={event}
                  expanded={expanded === key}
                  onToggle={() => setExpanded(expanded === key ? null : key)}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
