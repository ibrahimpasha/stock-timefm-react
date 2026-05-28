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
import { Clock, ChevronDown, ChevronRight } from "lucide-react";
import { useTradersToday, type TraderTodayEvent } from "../../api/alerts";
import { useAppStore } from "../../store/useAppStore";

const EVENT_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  open:   { bg: "rgba(63,185,80,0.12)",  fg: "var(--accent-green)",  label: "OPEN" },
  add:    { bg: "rgba(56,211,168,0.12)", fg: "var(--accent-cyan)",   label: "ADD" },
  trim:   { bg: "rgba(227,127,46,0.12)", fg: "var(--accent-orange)", label: "TRIM" },
  close:  { bg: "rgba(248,81,73,0.12)",  fg: "var(--accent-red)",    label: "CLOSE" },
  stop:   { bg: "rgba(248,81,73,0.16)",  fg: "var(--accent-red)",    label: "STOP" },
  status: { bg: "rgba(88,166,255,0.10)", fg: "var(--accent-blue)",   label: "STATUS" },
  recap:  { bg: "rgba(167,139,250,0.10)", fg: "var(--accent-purple)", label: "RECAP" },
};

function EventTypePill({ type }: { type: string | null }) {
  const c = type ? EVENT_COLORS[type.toLowerCase()] : undefined;
  if (!c) {
    return (
      <span className="font-mono text-xs px-1.5 py-px rounded text-text-muted border border-border">
        —
      </span>
    );
  }
  return (
    <span
      className="font-mono text-xs px-1.5 py-px rounded font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
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
        className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown size={11} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={11} className="text-text-muted shrink-0" />
        )}
        <span className="font-mono text-text-muted w-16 shrink-0">
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
            className="font-mono font-bold text-text-primary hover:text-accent-blue transition-colors"
          >
            {ContractStr(ev)}
          </button>
        )}
        {ev.exit_pct !== null && (
          <span className="font-mono text-accent-orange">{ev.exit_pct}%</span>
        )}
        <span className="text-text-secondary truncate flex-1">
          {ev.rationale || ""}
        </span>
      </div>
      {open && (
        <div className="ml-9 mr-2 mb-1 px-2 py-1.5 rounded text-xs text-text-secondary leading-relaxed bg-bg-tertiary/50 font-mono">
          <div className="text-text-muted">
            {new Date(ev.ts).toLocaleString()} · #{ev.channel_name || "?"} · msg_id {ev.msg_id || "?"}
          </div>
          {ev.rationale && <div className="mt-1">{ev.rationale}</div>}
          {ev.sentiment && (
            <div className="mt-1 text-text-muted">
              sentiment={ev.sentiment}
              {ev.conviction ? ` · conviction=${ev.conviction}` : ""}
              {ev.premium ? ` · ${ev.premium}` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TradersTodayFeed() {
  const { data, isFetching } = useTradersToday();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!data) {
    return (
      <div className="card p-3 text-xs text-text-muted">
        {isFetching ? "Loading today's activity…" : "No data."}
      </div>
    );
  }

  const authors = data.authors;
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} className="text-accent-purple" />
        <h3 className="text-sm font-semibold text-text-primary">Today's Activity</h3>
        <span className="text-xs text-text-muted font-mono">
          {data.date} · {data.total_events} event{data.total_events === 1 ? "" : "s"} ·{" "}
          {authors.length} trader{authors.length === 1 ? "" : "s"}
        </span>
        {isFetching && (
          <span className="text-xs text-text-muted animate-pulse ml-auto">refreshing…</span>
        )}
      </div>

      {authors.length === 0 ? (
        <div className="text-xs text-text-muted py-2 px-1 italic">
          No extracted events yet today.
        </div>
      ) : (
        <div className="space-y-3">
          {authors.map((a) => {
            const isCollapsed = collapsed[a.author];
            return (
              <div key={a.author}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((m) => ({ ...m, [a.author]: !m[a.author] }))
                  }
                  className="flex items-center gap-2 mb-1 hover:opacity-80 transition-opacity"
                >
                  {isCollapsed ? (
                    <ChevronRight size={12} className="text-text-muted" />
                  ) : (
                    <ChevronDown size={12} className="text-text-muted" />
                  )}
                  <span className="font-semibold text-sm text-text-primary">
                    {a.author}
                  </span>
                  <span className="text-xs text-text-muted font-mono">
                    {a.count} event{a.count === 1 ? "" : "s"}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5 ml-1 border-l border-border pl-2">
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
