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
import { changeColor } from "../../lib/utils";

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
        className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-sm transition-colors hover:bg-bg-card-hover md:min-h-0"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={11} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-text-muted shrink-0" />
        )}
        <span className="num text-xs text-text-muted w-16 shrink-0">
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
            className="num font-semibold text-text-primary hover:text-accent-blue transition-colors"
          >
            {ContractStr(ev)}
          </button>
        )}
        {ev.exit_pct !== null && (
          <span className="num" style={{ color: changeColor(ev.exit_pct) }}>
            {ev.exit_pct}%
          </span>
        )}
        <span className="text-text-secondary truncate flex-1">
          {ev.rationale || ""}
        </span>
      </div>
      {open && (
        <div className="ml-[5.5rem] mr-2 mb-2 max-w-[72ch] text-sm leading-relaxed text-text-secondary">
          <div className="text-xs text-text-muted">
            {new Date(ev.ts).toLocaleString()} · #{ev.channel_name || "?"} · msg{" "}
            <span className="num">{ev.msg_id || "?"}</span>
          </div>
          {ev.rationale && <div className="mt-1">{ev.rationale}</div>}
          {ev.sentiment && (
            <div className="mt-1 text-xs text-text-muted">
              Sentiment {ev.sentiment}
              {ev.conviction ? ` · conviction ${ev.conviction}` : ""}
              {ev.premium ? ` · ${ev.premium}` : ""}
            </div>
          )}
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
      <div className="card text-sm text-text-muted">
        {isFetching ? "Loading today's activity…" : "No data."}
      </div>
    );
  }

  const authors = data.authors;
  return (
    <div className="card">
      <div className="mb-3 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-text-primary">
          Today's activity
        </h3>
        <span className="text-xs text-text-muted">
          <span className="num">{data.date}</span> ·{" "}
          <span className="num">{data.total_events}</span> event{data.total_events === 1 ? "" : "s"} ·{" "}
          <span className="num">{authors.length}</span> trader{authors.length === 1 ? "" : "s"}
        </span>
        {isFetching && (
          <span className="text-xs text-text-muted animate-pulse ml-auto">refreshing…</span>
        )}
      </div>

      {authors.length === 0 ? (
        <div className="text-sm text-text-muted py-2">
          No extracted events yet today.
        </div>
      ) : (
        <div className="space-y-4">
          {authors.map((a) => {
            const isCollapsed = collapsed[a.author];
            return (
              <div key={a.author}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((m) => ({ ...m, [a.author]: !m[a.author] }))
                  }
                  className="mb-1 flex min-h-11 items-center gap-2 transition-opacity hover:opacity-80 md:min-h-0"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="text-text-muted" />
                  ) : (
                    <ChevronDown size={12} className="text-text-muted" />
                  )}
                  <span className="font-semibold text-sm text-text-primary">
                    {a.author}
                  </span>
                  <span className="num text-xs text-text-muted">
                    {a.count} event{a.count === 1 ? "" : "s"}
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
      )}
    </div>
  );
}
