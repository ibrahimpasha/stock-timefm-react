import { useState, useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  RefreshCw,
  Loader2,
  History,
  Send,
  Check,
  ShieldAlert,
} from "lucide-react";
import {
  useCommandBrief,
  useRefreshBrief,
  useBriefDates,
  useAskDesk,
  useMarkSeen,
  trackTicker,
  currentSession,
  SESSION_ORDER,
  SESSION_LABELS,
  type AskTurn,
  type BriefContext,
  type BriefDeltas,
  type BriefMover,
  type BriefPlay,
  type BriefRead,
  type BriefRegime,
  type BriefSession,
} from "../../api/commandBrief";
import { useAppStore } from "../../store/useAppStore";
import { relativeAge, formatPremium } from "../../lib/utils";
import { ThemeTrendsChart } from "./ThemeTrendsChart";

/* Only states the reader must notice get a tint; the rest stay neutral. */
const PLAY_TONE: Record<string, string> = {
  AVOID: "var(--accent-red)",
  MANAGE: "var(--accent-orange)",
  ACCUMULATE: "var(--accent-green)",
  BUY: "var(--accent-green)",
};

function mutationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const POSTURE_COLOR: Record<string, string> = {
  "risk-on": "var(--accent-green)",
  neutral: "var(--accent-orange)",
  "risk-off": "var(--accent-red)",
};

const signed = (n: number, dp = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const deltaCls = (n: number) => (n >= 0 ? "delta-up" : "delta-down");

const btnQuiet =
  "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-60";

function useSetTicker() {
  return useAppStore((s) => s.setActiveTicker);
}

/* Page section: serif heading, optional sub, then content. No card. */
function Section({
  title,
  sub,
  icon,
  children,
}: {
  title: string;
  sub?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header>
        <h2 className="section-title flex items-center gap-2">
          {icon}
          {title}
        </h2>
        {sub && <p className="section-sub">{sub}</p>}
      </header>
      {children}
    </section>
  );
}

/* Rail group: smaller serif heading over a dense list. */
function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-display text-base font-medium text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

/* Ticker button — the one click target that feeds the shared analysis panel. */
function Tick({ t, color, className = "" }: { t: string; color?: string; className?: string }) {
  const setTicker = useSetTicker();
  return (
    <button
      onClick={() => setTicker(t)}
      className={`ticker hover:text-accent-blue! hover:underline ${className}`}
      style={color ? { color } : undefined}
      title={`Open ${t}`}
    >
      {t}
    </button>
  );
}

const ER = ({ d }: { d: number }) => (
  <span className="tag num" style={{ "--tag": "var(--accent-orange)" } as CSSProperties} title={`reports in ${d}d`}>
    ER {d}d
  </span>
);

/* ── Regime — quiet inline status ────────────────────────────────────────── */
function RegimeStatus({ r }: { r: BriefRegime }) {
  const color = POSTURE_COLOR[r.posture] || "var(--text-muted)";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-text-secondary">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-medium capitalize text-text-primary">{r.posture}</span>
      </span>
      <span className="num" title={`VIX regime: ${r.vix_regime}`}>VIX {r.vix.toFixed(1)}</span>
      <span className="num">
        SPY <span className={deltaCls(r.spy_change_pct)}>{signed(r.spy_change_pct, 2)}</span>
      </span>
      <span className="text-text-muted" title="VIX-based position sizing">{r.sizing} size</span>
    </span>
  );
}

/* ── Session tabs — premarket / midday / afterhours ──────────────────────── */
function fmtGenEta(min?: number | null): string {
  if (min == null) return "soon";
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h < 12 ? "AM" : "PM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ap} PT`;
}

function SessionTabs({
  available,
  active,
  live,
  onSelect,
}: {
  available: BriefSession[];
  active: BriefSession;
  live: BriefSession | null; // current live session (null in history mode)
  onSelect: (s: BriefSession) => void;
}) {
  return (
    <div role="group" aria-label="Brief session" className="segmented-control inline-flex items-center gap-0.5 rounded-full border p-0.5">
      {SESSION_ORDER.map((s) => {
        const enabled = available.includes(s);
        const isActive = s === active;
        return (
          <button
            key={s}
            type="button"
            disabled={!enabled}
            aria-pressed={isActive}
            onClick={() => enabled && onSelect(s)}
            className={`segmented-option inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 max-lg:min-h-11 ${
              isActive ? "segmented-option-active" : "text-text-secondary hover:text-text-primary"
            }`}
            title={enabled ? SESSION_LABELS[s] : `${SESSION_LABELS[s]} — not captured this day`}
          >
            {s === live && (
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent-green)" }} title="live session right now" />
            )}
            {SESSION_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

/* Shared two-column story row: ticker column left, reading column right. */
const storyRow = "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-5 py-4 first:pt-1 sm:grid-cols-[8rem_minmax(0,1fr)]";

/* ── Plays — concrete actionable setups ──────────────────────────────────── */
function PlaysBlock({ plays }: { plays: BriefPlay[] }) {
  if (!plays || plays.length === 0) return null;
  return (
    <Section title="Plays & actions" sub="Setups with an explicit trigger and the risk that kills them">
      <ul className="divide-y divide-border">
        {plays.map((p, i) => {
          const tone = PLAY_TONE[(p.action || "").toUpperCase()];
          return (
            <li key={i} className={storyRow}>
              <div className="flex flex-col items-start gap-1.5">
                <Tick t={p.ticker} className="text-lg" />
                <span
                  className="tag font-semibold"
                  style={tone ? ({ "--tag": tone } as CSSProperties) : undefined}
                >
                  {p.action}
                </span>
              </div>
              <div className="flex min-w-0 max-w-[68ch] flex-col gap-2.5">
                <p className="prose-read">{p.thesis}</p>
                <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm leading-relaxed">
                  <dt className="font-medium text-text-muted">Trigger</dt>
                  <dd className="text-text-secondary">{p.trigger}</dd>
                  <dt className="font-medium text-text-muted">Risk</dt>
                  <dd className="text-text-secondary">{p.risk}</dd>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ── Movers explained (the Claude causal list) ───────────────────────────── */
function MoversExplained({ rows }: { rows: BriefRead["movers_explained"] }) {
  if (!rows || rows.length === 0) return null;
  return (
    <Section title="What moved & why">
      <ul className="divide-y divide-border">
        {rows.map((m, i) => (
          <li key={i} className={storyRow}>
            <div className="flex flex-col items-start leading-tight">
              <Tick t={m.ticker} className="text-lg" />
              <span className={`text-lg font-semibold ${m.move.includes("-") ? "delta-down" : "delta-up"}`}>
                {m.move}
              </span>
            </div>
            <div className="flex min-w-0 max-w-[68ch] flex-col gap-2">
              <p className="prose-read">{m.why}</p>
              {m.flag && <div className="callout">{m.flag}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ── Rail: deterministic desk data ───────────────────────────────────────── */
const railRow = "data-row -mx-2 flex items-baseline justify-between gap-2 px-2 py-2 text-sm";

function MoverRow({ m }: { m: BriefMover }) {
  return (
    <li
      className={railRow}
      title={(m.on_radar ? "On your radar (flow/holding) · " : "Market-wide mover · ") + (m.intel || m.ticker)}
    >
      <span className="flex items-baseline gap-1.5">
        <Tick t={m.ticker} />
        {m.on_radar && <span className="tag">on radar</span>}
        {m.earnings_in != null && m.earnings_in >= 0 && m.earnings_in <= 7 && <ER d={m.earnings_in} />}
      </span>
      <span className={`font-medium ${deltaCls(m.pct)}`}>{signed(m.pct)}</span>
    </li>
  );
}

function MoversStrip({ ctx }: { ctx: BriefContext }) {
  const { gainers, losers } = ctx.movers;
  return (
    <RailGroup title="Session movers">
      {gainers.length === 0 && losers.length === 0 ? (
        <p className="text-sm text-text-muted">Populates after the open.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {([["Gainers", gainers], ["Losers", losers]] as const).map(([label, list]) =>
            list.length > 0 ? (
              <div key={label}>
                <div className="text-xs font-medium text-text-muted">{label}</div>
                <ul className="divide-y divide-border">
                  {list.map((m) => <MoverRow key={m.ticker} m={m} />)}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}
    </RailGroup>
  );
}

function FlowBlock({ ctx }: { ctx: BriefContext }) {
  if (!ctx.flow || ctx.flow.length === 0) return null;
  return (
    <RailGroup title="Unusual flow today">
      <ul className="divide-y divide-border">
        {ctx.flow.map((f) => (
          <li
            key={f.ticker}
            className={railRow}
            title={`${f.side} · ML ${f.ml ?? "?"} · $${Math.round(f.premium).toLocaleString()} premium${
              f.earnings_in != null ? ` · reports in ${f.earnings_in}d` : ""
            }`}
          >
            <span className="flex items-baseline gap-1.5">
              <Tick t={f.ticker} />
              <span className={`text-xs ${f.side === "Bull" ? "delta-up" : "delta-down"}`}>{f.side}</span>
              {f.earnings_in != null && f.earnings_in >= 0 && f.earnings_in <= 10 && <ER d={f.earnings_in} />}
            </span>
            <span className="num text-xs text-text-muted">
              {f.ml != null && <>ML {f.ml} · </>}
              <span className="text-sm text-text-primary">{formatPremium(f.premium)}</span>
            </span>
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}

function EarningsBlock({ ctx }: { ctx: BriefContext }) {
  const { this_week, flow_into_earnings } = ctx.earnings;
  return (
    <RailGroup title="Earnings ahead">
      {this_week.length === 0 && flow_into_earnings.length === 0 && (
        <p className="text-sm text-text-muted">Nothing in the next week.</p>
      )}
      {this_week.length > 0 && (
        <ul className="divide-y divide-border">
          {this_week.map((e) => (
            <li key={e.ticker} className={railRow} title={`${e.ticker} reports ${e.date}${e.has_flow ? " · has flow today" : ""}`}>
              <span className="flex items-baseline gap-1.5">
                <Tick t={e.ticker} />
                {e.has_flow && <span className="tag">flow</span>}
              </span>
              <span className="num text-text-secondary">{e.days_out}d</span>
            </li>
          ))}
        </ul>
      )}
      {flow_into_earnings.length > 0 && (
        <p className="mt-1 text-sm text-text-secondary">
          <span className="text-text-muted">Flow into print: </span>
          {flow_into_earnings.map((e, i) => (
            <span key={e.ticker}>
              {i > 0 && ", "}
              <Tick t={e.ticker} />
              <span className="num text-xs text-text-muted"> ({e.days_out}d)</span>
            </span>
          ))}
        </p>
      )}
    </RailGroup>
  );
}

function ThemesBlock({ ctx }: { ctx: BriefContext }) {
  const { hot, cooling } = ctx.themes;
  if (hot.length === 0 && cooling.length === 0) return null;
  const rows = [
    ...hot.slice(0, 4).map((t) => ({ ...t, cls: "delta-up" })),
    ...cooling.slice(0, 3).map((t) => ({ ...t, cls: "delta-down" })),
  ];
  return (
    <RailGroup title="Theme heat">
      <ul className="divide-y divide-border">
        {rows.map((t) => (
          <li key={t.category} className={railRow}>
            <span className="min-w-0 truncate text-text-secondary" title={t.category}>{t.category}</span>
            <span className={`font-medium ${t.cls}`}>{t.ratio}x</span>
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}

function FocusBlock({ ctx }: { ctx: BriefContext }) {
  if (!ctx.focus || ctx.focus.length === 0) return null;
  return (
    <RailGroup title="Your focus">
      <ul className="divide-y divide-border">
        {ctx.focus.map((f) => (
          <li key={f.ticker} className={railRow} title={`Viewed ${f.views}x recently${f.in_book ? " · in a book" : ""}`}>
            <span className="flex items-baseline gap-1.5">
              <Tick t={f.ticker} />
              {f.earnings_in != null && f.earnings_in >= 0 && f.earnings_in <= 7 && <ER d={f.earnings_in} />}
              <span className="text-xs text-text-muted">{f.views} views</span>
            </span>
            {f.pct != null && <span className={`font-medium ${deltaCls(f.pct)}`}>{signed(f.pct)}</span>}
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}

function BooksFootnote({ ctx }: { ctx: BriefContext }) {
  if (!ctx.books || ctx.books.length === 0) return null;
  return (
    <RailGroup title="Your books">
      <ul className="divide-y divide-border">
        {ctx.books.map((b) => (
          <li key={b.label} className={railRow}>
            <span className="text-text-secondary">
              {b.label}
              <span className="ml-1.5 text-xs text-text-muted">
                {b.open_positions} open
                {b.near_stop > 0 && <span className="text-accent-red"> · {b.near_stop} near stop</span>}
              </span>
            </span>
            <span className={`font-medium ${deltaCls(b.return_pct ?? 0)}`}>{signed(b.return_pct ?? 0)}</span>
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}

/* ── "Since you last looked" — strip of labelled signed values ──────────── */
/* Delta text arrives pre-formatted ("VIX 15.5 → 18.4", "Smart $-2,418",
 * "new gainer: IRON"); split it into label + value, and merge same-label
 * items (the "new gainer" list) into one cell. */
function splitDelta(text: string): [string, string] {
  const colon = text.match(/^(.*?):\s+(.*)$/);
  if (colon) return [colon[1], colon[2]];
  const num = text.match(/^(.*?)\s+([-+$\d].*)$/);
  return num ? [num[1], num[2]] : ["", text];
}

function DeltasStrip({ deltas }: { deltas: BriefDeltas }) {
  const markSeen = useMarkSeen();
  if (!deltas || !deltas.items || deltas.items.length === 0) return null;
  const cells: { label: string; values: { v: string; dir: string }[] }[] = [];
  for (const d of deltas.items) {
    const [label, v] = splitDelta(d.text);
    const prev = cells[cells.length - 1];
    if (prev && label && prev.label === label) prev.values.push({ v, dir: d.dir });
    else cells.push({ label, values: [{ v, dir: d.dir }] });
  }
  const dirCls = (dir: string) =>
    dir === "up" ? "delta-up" : dir === "down" ? "delta-down" : "num text-text-primary";
  return (
    <div className="flex flex-col gap-2 border-y border-border py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">
          Since you last looked
          {deltas.since && (
            <span className="font-normal text-text-muted" title={deltas.since}> · {relativeAge(deltas.since)}</span>
          )}
        </span>
        <button
          onClick={() => markSeen.mutate()}
          disabled={markSeen.isPending}
          className={btnQuiet}
          title="Mark caught up — resets the deltas"
        >
          <Check size={12} /> Caught up
        </button>
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {cells.map((c, i) => (
          <li key={i} className="flex min-w-0 flex-col">
            {c.label && <span className="text-xs capitalize text-text-muted">{c.label}</span>}
            <span className="text-base font-semibold">
              {c.values.map((x, j) => (
                <span key={j}>
                  {j > 0 && <span className="text-text-muted">, </span>}
                  <span className={dirCls(x.dir)}>{x.v}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleFlags({ flags }: { flags: string[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <Section title="Rule watch" icon={<ShieldAlert size={18} className="text-accent-orange" />}>
      <ul className="callout flex max-w-[68ch] list-disc flex-col gap-1 pl-8 text-sm">
        {flags.map((f, i) => <li key={i}>{f}</li>)}
      </ul>
    </Section>
  );
}

/* ── L3 — Ask the desk (conversational) ──────────────────────────────────── */
function AskDesk() {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<AskTurn[]>([]);
  const ask = useAskDesk();

  const submit = () => {
    const submittedDraft = q;
    const question = submittedDraft.trim();
    if (!question || ask.isPending) return;
    ask.mutate(
      { question, history: thread },
      {
        onSuccess: (data) => {
          setThread((t) => [...t, { q: question, a: data.answer || "(no answer)" }]);
          setQ((draft) => (draft === submittedDraft ? "" : draft));
        },
      }
    );
  };

  return (
    <Section title="Ask the desk" sub="Questions about today's tape, your books, or a ticker">
      {thread.length > 0 && (
        <div className="flex flex-col gap-5">
          {thread.map((t, i) => (
            <div key={i} className="flex max-w-[68ch] flex-col gap-1.5">
              <div className="text-sm font-semibold text-text-primary">{t.q}</div>
              <div className="prose-read whitespace-pre-wrap">{t.a}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex max-w-[68ch] items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. should I worry about my U position? what's the read on AVGO?"
          className="control-surface min-w-0 flex-1 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <button
          onClick={submit}
          disabled={ask.isPending || !q.trim()}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-accent-blue transition-colors hover:bg-bg-card-hover disabled:opacity-50"
        >
          {ask.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Ask
        </button>
      </div>
      {ask.isPending && <div className="text-xs text-text-muted">Desk is thinking…</div>}
      {ask.isError && (
        <div className="text-xs text-accent-red" role="alert">
          {mutationError(ask.error, "The desk could not answer. Try again.")}
        </div>
      )}
    </Section>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export function DailyBrief() {
  const [histDate, setHistDate] = useState<string>(""); // "" = today (live)
  const isHistory = !!histDate;
  const live = currentSession();
  const [activeSession, setActiveSession] = useState<BriefSession>(live);
  const { data, isLoading, refetch } = useCommandBrief(histDate || undefined, activeSession);
  const datesQuery = useBriefDates();
  const { data: datesData } = datesQuery;
  const refresh = useRefreshBrief(activeSession);

  // Which session tabs are selectable: all three when live (pending ones show a
  // placeholder); for a past date only the sessions actually captured that day.
  const histEntry = isHistory
    ? datesData?.dates.find((d) => d.pt_date === histDate)
    : undefined;
  const availableSessions: BriefSession[] = isHistory
    ? histEntry?.sessions.map((s) => s.session) ?? []
    : SESSION_ORDER;

  const selectDate = (date: string) => {
    setHistDate(date);
    if (!date) {
      setActiveSession(currentSession());
      return;
    }
    const entry = datesData?.dates.find((d) => d.pt_date === date);
    const avail = entry?.sessions.map((s) => s.session) ?? [];
    // default a past date to its most complete session
    const best = (["afterhours", "midday", "premarket"] as BriefSession[]).find((s) =>
      avail.includes(s)
    );
    if (best) setActiveSession(best);
  };

  // L5 — log ticker views (skip the initial default) to feed "Your focus".
  const activeTicker = useAppStore((s) => s.activeTicker);
  const firstTick = useRef(true);
  useEffect(() => {
    if (firstTick.current) {
      firstTick.current = false;
      return;
    }
    if (activeTicker) trackTicker(activeTicker);
  }, [activeTicker]);

  // Session switch + history date picker — shared by the normal render and the
  // error shell so a failed fetch (missing past session, backend restart) never
  // strands the user without a way back to "Today (live)".
  const sessionTabs = (
    <SessionTabs
      available={availableSessions}
      active={activeSession}
      live={isHistory ? null : live}
      onSelect={setActiveSession}
    />
  );
  const datePicker = (
    <label
      className="control-surface inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-text-secondary"
      title="Review a past day's brief"
    >
      <History size={12} className="text-text-muted" />
      <select
        value={histDate}
        onChange={(e) => selectDate(e.target.value)}
        className="cursor-pointer bg-transparent text-text-secondary outline-none"
      >
        <option value="">Today (live)</option>
        {(datesData?.dates || [])
          .filter((d) => d.pt_date !== data?.pt_date || isHistory)
          .map((d) => (
            <option key={d.pt_date} value={d.pt_date}>
              {d.pt_date}
            </option>
          ))}
      </select>
    </label>
  );

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-text-muted">
        <Loader2 size={14} className="animate-spin" />
        Assembling the brief…
      </div>
    );
  }
  if (!data) {
    // Error / missing brief: keep the pickers mounted (retry:false and no
    // history refetch means unmounting here would be unrecoverable in-place).
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {sessionTabs}
          {datePicker}
        </div>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span>
            {isHistory
              ? `No ${SESSION_LABELS[activeSession]} brief captured for ${histDate}.`
              : "Brief unavailable right now."}
          </span>
          <button onClick={() => refetch()} className={btnQuiet}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const ctx = data.context;
  const read = (data.read || {}) as Partial<BriefRead>;
  const regime = ctx.regime as BriefRegime;
  const hasRegime = regime && typeof regime.vix === "number";

  return (
    <div className="flex flex-col gap-8">
      {/* Toolbar — session, date, freshness, refresh */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {sessionTabs}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {datePicker}
            {!isHistory && (
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className={btnQuiet}
                title={`Regenerate the ${SESSION_LABELS[activeSession]} Read (~3 min)`}
              >
                <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
                {refresh.isPending ? "Thinking…" : "Refresh"}
              </button>
            )}
          </div>
        </div>
        {refresh.isError && (
          <div className="text-xs text-accent-red" role="alert">
            {mutationError(refresh.error, "The brief could not be refreshed. Try again.")}
          </div>
        )}
        {datesQuery.isError && !datesData && (
          <div className="flex items-center gap-2 text-xs text-accent-red" role="alert">
            <span>Brief history could not be loaded.</span>
            <button type="button" onClick={() => void datesQuery.refetch()} className={btnQuiet}>
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Story column — the Read */}
        <div className="flex min-w-0 flex-col gap-10">
          {/* Front page: dateline, headline, lede, deltas */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
              <span>
                {data.session_label || SESSION_LABELS[activeSession]} ·{" "}
                <span className="num">{data.pt_date}</span>
                {isHistory && " · archive"}
                {data.read_as_of && !data.pending && (
                  <span title={data.read_as_of}>
                    {" · "}
                    {!isHistory && data.stale ? "stale · " : ""}read {relativeAge(data.read_as_of)}
                  </span>
                )}
              </span>
              {hasRegime && !isHistory && <RegimeStatus r={regime} />}
            </div>
            {read.headline ? (
              <h2 className="headline max-w-[30ch]">{read.headline}</h2>
            ) : data.pending ? (
              <p className="prose-read text-text-muted">
                {SESSION_LABELS[activeSession]} brief generates around {fmtGenEta(data.gen_eta_min)} — the
                live desk data is current.
              </p>
            ) : (
              <p className="prose-read text-text-muted">
                No Read yet today — hit Refresh to generate the synthesis (the desk data is live).
              </p>
            )}
            {read.read && <p className="prose-read max-w-[68ch] whitespace-pre-line">{read.read}</p>}
            {!isHistory && data.deltas && <DeltasStrip deltas={data.deltas} />}
          </div>

          <MoversExplained rows={read.movers_explained || []} />

          {read.watch && read.watch.length > 0 && (
            <Section title="Watch">
              <ul className="divide-y divide-border">
                {read.watch.map((w, i) => (
                  <li key={i} className={storyRow}>
                    <div><Tick t={w.ticker} className="text-lg" /></div>
                    <p className="prose-read max-w-[68ch]">{w.why}</p>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <PlaysBlock plays={read.plays || []} />

          {read.heads_up && read.heads_up.length > 0 && (
            <Section title="Heads up">
              <ul className="flex max-w-[68ch] flex-col gap-2">
                {read.heads_up.map((a, i) => (
                  <li key={i} className="callout text-sm">{a}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* L5 — anticipation: deterministic rule flags */}
          <RuleFlags flags={ctx.rule_flags || []} />

          {/* L3 — ask the desk (live only) */}
          {!isHistory && <AskDesk />}
        </div>

        {/* Data rail — deterministic, always accurate */}
        <aside className="flex min-w-0 flex-col gap-8 border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-1">
          <MoversStrip ctx={ctx} />
          <FlowBlock ctx={ctx} />
          <EarningsBlock ctx={ctx} />
          <ThemesBlock ctx={ctx} />
          <FocusBlock ctx={ctx} />
          <BooksFootnote ctx={ctx} />
        </aside>
      </div>

      {/* Theme heat over time — full width; defaults to a 7-day window. */}
      <div className="border-t border-border pt-8">
        <ThemeTrendsChart embedded />
      </div>
    </div>
  );
}
