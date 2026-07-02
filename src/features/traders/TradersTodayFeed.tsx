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
import { Chip, type ChipTone } from "../../components/Glass";

const EVENT_TONES: Record<string, { tone: ChipTone; label: string }> = {
  open:   { tone: "green",  label: "OPEN" },
  add:    { tone: "cyan",   label: "ADD" },
  trim:   { tone: "orange", label: "TRIM" },
  close:  { tone: "red",    label: "CLOSE" },
  stop:   { tone: "red",    label: "STOP" },
  status: { tone: "blue",   label: "STATUS" },
  recap:  { tone: "purple", label: "RECAP" },
};

function EventTypePill({ type }: { type: string | null }) {
  const c = type ? EVENT_TONES[type.toLowerCase()] : undefined;
  if (!c) {
    return <Chip className="shrink-0">—</Chip>;
  }
  return (
    <Chip tone={c.tone} className="shrink-0">
      {c.label}
    </Chip>
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
        <span className="num text-text-muted w-16 shrink-0">
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
            className="num font-bold text-text-primary hover:text-accent-blue transition-colors"
          >
            {ContractStr(ev)}
          </button>
        )}
        {ev.exit_pct !== null && (
          <span className="num text-accent-orange">{ev.exit_pct}%</span>
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
  // Pass the user's LOCAL calendar day — the backend defaults to the UTC day,
  // which rolls over at 5pm PT and blanks the evening review window.
  const localDay = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
  const { data, isFetching } = useTradersToday(localDay);
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
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Today's Activity
        </h3>
        <span className="num text-xs text-text-muted">
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
                  <span className="num text-xs text-text-muted">
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
