/**
 * TradersTodayFeed — chronological feed of today's LLM-extracted events,
 * grouped by author. No position stitching, no derived state. Just rows.
 *
 * Source: GET /alerts/today via `useTradersToday`.
 *
 * Click the rationale row to expand it (shows raw rationale + full timestamp +
 * msg_id). Click the ticker chip to set it as the global active ticker.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTradersToday, type TraderTodayEvent } from "../../api/alerts";
import { useAppStore } from "../../store/useAppStore";
import { Tile, Kpi } from "../../components/Cockpit";

const EVENT_LABELS: Record<string, string> = {
  open: "Open",
  add: "Add",
  trim: "Trim",
  close: "Close",
  stop: "Stop",
  status: "Status",
  recap: "Recap",
};

/** Plain-text event label — no colored pill (2026-10 rules). */
function EventTypePill({ type }: { type: string | null }) {
  const label = type ? EVENT_LABELS[type.toLowerCase()] : undefined;
  return (
    <span className="w-12 shrink-0 text-xs font-medium text-text-primary">
      {label ?? "—"}
    </span>
  );
}

function fmtTime(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso.slice(11, 16);
  }
}

function ContractStr(ev: TraderTodayEvent): string {
  if (!ev.ticker) return "";
  const opt = (ev.instrument || "").toUpperCase();
  if (opt === "SHARES" || (!ev.strike && !ev.expiry)) {
    return `${ev.ticker} ${ev.instrument ? "shares" : ""}`.trim();
  }
  const sk = ev.strike ? `$${ev.strike}` : "";
  const ot =
    opt.includes("PUT") ? "P" : opt.includes("CALL") ? "C" : "";
  const exp = ev.expiry ? ` ${ev.expiry}` : "";
  return `${ev.ticker} ${sk}${ot}${exp}`.trim();
}

function EventRow({ ev }: { ev: TraderTodayEvent }) {
  const [open, setOpen] = useState(false);
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <div>
      <div
        className="data-row flex min-h-11 min-w-0 cursor-pointer gap-2 px-2 py-2.5 text-sm md:min-h-0"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={12} className="mt-1 shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={12} className="mt-1 shrink-0 text-text-muted" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className="num w-16 shrink-0 text-xs text-text-muted">
              {fmtTime(ev.ts)}
            </span>
            <EventTypePill type={ev.event_type} />
            {ev.ticker && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTicker(ev.ticker!);
                }}
                className="ticker text-sm transition-colors hover:text-accent"
              >
                {ContractStr(ev)}
              </button>
            )}
            {ev.exit_pct !== null && (
              <span className={`ml-auto ${ev.exit_pct >= 0 ? "delta-up" : "delta-down"}`}>
                {ev.exit_pct}%
              </span>
            )}
          </div>
          {ev.rationale && !open && (
            <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
              {ev.rationale}
            </p>
          )}
        </div>
      </div>
      {open && (
        <div className="mb-2 ml-6 mr-2 max-w-[72ch]">
          {ev.rationale && (
            <p className="text-sm leading-relaxed text-text-secondary">
              {ev.rationale}
            </p>
          )}
          {ev.sentiment && (
            <div className="mt-1.5 text-xs text-text-muted">
              Sentiment {ev.sentiment}
              {ev.conviction ? ` · conviction ${ev.conviction}` : ""}
              {ev.premium ? ` · ${ev.premium}` : ""}
            </div>
          )}
          <div className="mt-1 text-xs text-text-muted">
            {new Date(ev.ts).toLocaleString()} · #{ev.channel_name || "?"} · msg{" "}
            <span className="num">{ev.msg_id || "?"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TradersTodayFeed() {
  // Pass the user's LOCAL calendar day — the backend defaults to the UTC day,
  // which rolls over at 5pm PT and blanks the evening review window.
  const localDay = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  const { data, isFetching } = useTradersToday(localDay);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!data) {
    return (
      <Tile title="Today's activity" className="flex-1">
        <p className="text-sm text-text-muted">
          {isFetching ? "Loading today's activity…" : "No data."}
        </p>
      </Tile>
    );
  }

  const authors = data.authors;
  const maxCount = authors.reduce((m, a) => Math.max(m, a.count), 0) || 1;
  return (
    <Tile
      title="Today's activity"
      className="flex-1"
      meta={
        <>
          <span className="num">{data.date}</span>
          {isFetching && <span className="ml-2 animate-pulse">refreshing…</span>}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-4 border-b border-border pb-3">
        <Kpi label="Events" value={data.total_events} size="md" />
        <Kpi label="Traders posting" value={authors.length} size="md" />
      </div>

      {authors.length === 0 ? (
        <p className="text-sm text-text-muted">No extracted events yet today.</p>
      ) : (
        <div className="-mx-1 max-h-[560px] overflow-auto">
          <div className="flex flex-col">
            {authors.map((a) => {
              const isCollapsed = collapsed[a.author];
              return (
                <div key={a.author} className="py-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((m) => ({ ...m, [a.author]: !m[a.author] }))
                    }
                    aria-expanded={!isCollapsed}
                    className="data-row grid min-h-11 w-full grid-cols-[0.75rem_minmax(0,9rem)_minmax(0,1fr)_2rem] items-center gap-2 rounded-md px-2 text-left md:min-h-8"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={12} className="text-text-muted" />
                    ) : (
                      <ChevronDown size={12} className="text-text-muted" />
                    )}
                    <span className="truncate text-sm font-semibold text-text-primary" title={a.author}>
                      {a.author}
                    </span>
                    <span className="h-2.5 rounded-[3px]" style={{ background: "var(--track)" }}>
                      <span
                        className="block h-2.5 rounded-[3px]"
                        style={{ width: `${(a.count / maxCount) * 100}%`, background: "var(--accent-blue)" }}
                      />
                    </span>
                    <span
                      className="num text-right text-xs text-text-secondary"
                      title={`${a.count} event${a.count === 1 ? "" : "s"}`}
                    >
                      {a.count}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="ml-5 divide-y divide-border">
                      {a.events.map((ev) => (
                        <EventRow key={ev.alert_id} ev={ev} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Tile>
  );
}
