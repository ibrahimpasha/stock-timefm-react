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
                className="ticker text-sm transition-colors hover:text-accent-blue"
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
        <div className="mb-2 ml-7 mr-2 max-w-[72ch]">
          {ev.rationale && (
            <p className="font-display text-base leading-relaxed text-text-secondary">
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

  const heading = <h2 className="section-title">Today's activity</h2>;

  if (!data) {
    return (
      <section className="flex flex-col gap-3">
        {heading}
        <p className="text-sm text-text-muted">
          {isFetching ? "Loading today's activity…" : "No data."}
        </p>
      </section>
    );
  }

  const authors = data.authors;
  return (
    <section className="flex flex-col gap-3">
      <div>
        {heading}
        <p className="section-sub">
          <span className="num">{data.date}</span> ·{" "}
          <span className="num">{data.total_events}</span> event{data.total_events === 1 ? "" : "s"} ·{" "}
          <span className="num">{authors.length}</span> trader{authors.length === 1 ? "" : "s"}
          {isFetching && (
            <span className="ml-2 animate-pulse">refreshing…</span>
          )}
        </p>
      </div>

      {authors.length === 0 ? (
        <p className="text-sm text-text-muted">No extracted events yet today.</p>
      ) : (
        <div className="card max-h-[720px] overflow-auto" style={{ padding: "0.5rem 0.75rem" }}>
          <div className="divide-y divide-border">
            {authors.map((a) => {
              const isCollapsed = collapsed[a.author];
              return (
                <div key={a.author} className="py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((m) => ({ ...m, [a.author]: !m[a.author] }))
                    }
                    aria-expanded={!isCollapsed}
                    className="flex min-h-11 w-full items-center gap-2 px-2 text-left transition-opacity hover:opacity-80 md:min-h-8"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={12} className="text-text-muted" />
                    ) : (
                      <ChevronDown size={12} className="text-text-muted" />
                    )}
                    <span className="text-sm font-semibold text-text-primary">
                      {a.author}
                    </span>
                    <span className="num ml-auto text-xs text-text-muted">
                      {a.count} event{a.count === 1 ? "" : "s"}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="divide-y divide-border">
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
    </section>
  );
}
