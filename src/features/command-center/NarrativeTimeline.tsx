import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

import { useNarrative } from "../../api/intelV3";
import type { NarrativeEvent } from "../../api/intelV3";
import { parseTimestampMs } from "../../lib/utils";
import { BarRow, Kpi, Tile } from "../../components/Cockpit";

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
    <div className="relative pl-7 pb-5 last:pb-0">
      <div
        className="absolute left-[3px] top-1 rounded-full border"
        style={{
          width: nodeSize,
          height: nodeSize,
          marginLeft: -(nodeSize - 8) / 2,
          background: color,
          borderColor: "color-mix(in srgb, var(--bg-card) 65%, transparent)",
        }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="num">{fmtTime(event.ts)}</span>
          <span>·</span>
          <span className="font-medium text-text-secondary">{fmtSource(event.source)}</span>
          <span>·</span>
          <span className="truncate">{event.kind.replace(/_/g, " ")}</span>
        </div>

        <button
          type="button"
          onClick={hasExpansion ? onToggle : undefined}
          className="data-row -ml-1 mt-1 flex w-full items-start gap-1.5 px-1 py-0.5 text-left text-sm text-text-primary"
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
          <span className={`min-w-0 flex-1 font-medium leading-snug ${expanded ? "" : "line-clamp-2"}`} title={event.title}>{event.title}</span>
        </button>

        {expanded && hasExpansion && (
          <div className="mt-2 ml-5 space-y-2 text-xs">
            {event.detail && <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">{event.detail}</p>}
            {(event.sentiment || event.strength != null) && (
              <div className="flex flex-wrap gap-x-3 text-text-muted">
                {event.sentiment && (
                  <span>
                    Sentiment <span className="text-text-secondary">{event.sentiment}</span>
                  </span>
                )}
                {event.strength != null && (
                  <span>
                    Strength <span className="num text-text-secondary">{Number(event.strength).toFixed(2)}</span>
                  </span>
                )}
              </div>
            )}
            {refs.length > 0 && (
              <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1">
                {refs.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="truncate text-text-muted">{key.replace(/_/g, " ")}</dt>
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

  const bySource = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);
  const sourceMax = Math.max(1, ...bySource.map(([, n]) => n));
  const windowH = data?.window_hours ?? hours;

  return (
    <section className="flex flex-col gap-3.5" aria-label="Narrative timeline">
      <Tile bodyClassName="grid grid-cols-3 gap-4">
        <Kpi label="Events" value={data?.summary.event_count ?? events.length} size="md" />
        <Kpi label="Sources" value={data?.summary.sources_seen?.length ?? bySource.length} size="md" />
        <Kpi label="Window" value={`${windowH}h`} size="md" />
      </Tile>

      {isLoading ? (
        <Tile>
          <div className="space-y-2 animate-pulse">
            <div className="h-4 rounded bg-text-muted/15" />
            <div className="h-4 w-5/6 rounded bg-text-muted/15" />
            <div className="h-4 w-2/3 rounded bg-text-muted/15" />
          </div>
        </Tile>
      ) : isError ? (
        <div role="alert" className="callout flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0" />
          Narrative events are unavailable for {ticker}. The rest of the analysis panel is unchanged.
        </div>
      ) : events.length === 0 ? (
        <Tile title="No strong narrative events in this window">
          <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">
            Quiet tape is not bearish by itself. It means news, flow, voices, traders, forecasts,
            earnings, and macro inputs did not produce strong evidence for {ticker} over the last{" "}
            {windowH} hours.
          </p>
        </Tile>
      ) : (
        <>
          {bySource.length > 0 && (
            <Tile title="Events by source">
              {bySource.map(([source, n]) => (
                <BarRow
                  key={source}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: colorForSource(source) }} />
                      {fmtSource(source)}
                    </span>
                  }
                  value={n}
                  max={sourceMax}
                  tone="info"
                  display={n}
                />
              ))}
              {data?.summary.sources_seen && data.summary.sources_seen.length > bySource.length && (
                <p className="text-xs text-text-muted">
                  Also seen: {data.summary.sources_seen.filter((src) => !bySource.some(([k]) => k === src)).map(fmtSource).join(", ")}
                </p>
              )}
            </Tile>
          )}
          <Tile title="Timeline" meta="oldest first">
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
          </Tile>
        </>
      )}
    </section>
  );
}
