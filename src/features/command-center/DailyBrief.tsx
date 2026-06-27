import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Calendar,
  Flame,
  Snowflake,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Loader2,
  Activity,
  Zap,
  Eye,
  Target,
  History,
  Send,
  MessageSquare,
  Star,
  Bell,
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
import { changeColor, relativeAge } from "../../lib/utils";

const PLAY_COLOR: Record<string, string> = {
  ACCUMULATE: "var(--accent-green)",
  WATCH: "var(--accent-blue)",
  AVOID: "var(--accent-red)",
  MANAGE: "var(--accent-orange)",
  TRIM: "var(--accent-purple)",
  HEDGE: "var(--accent-cyan)",
};

const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

const POSTURE_COLOR: Record<string, string> = {
  "risk-on": "var(--accent-green)",
  neutral: "var(--accent-orange)",
  "risk-off": "var(--accent-red)",
};

function useSetTicker() {
  return useAppStore((s) => s.setActiveTicker);
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-wider text-text-muted mb-1.5 flex items-center gap-1">
      {icon}
      {children}
    </div>
  );
}

/* ── Regime pill ─────────────────────────────────────────────────────────── */
function RegimePill({ r }: { r: BriefRegime }) {
  const color = POSTURE_COLOR[r.posture] || "var(--text-muted)";
  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs"
      style={{ background: tint(color, 8), border: `1px solid ${tint(color, 22)}` }}
    >
      <Activity size={12} style={{ color }} />
      <span className="font-semibold uppercase" style={{ color }}>{r.posture}</span>
      <span className="text-text-muted">·</span>
      <span className="font-mono text-text-secondary" title={`VIX regime: ${r.vix_regime}`}>
        VIX {r.vix.toFixed(1)}
      </span>
      <span className="text-text-muted">·</span>
      <span className="font-mono" style={{ color: changeColor(r.spy_change_pct) }}>
        SPY {r.spy_change_pct >= 0 ? "+" : ""}{r.spy_change_pct.toFixed(2)}%
      </span>
      <span className="text-text-muted">·</span>
      <span className="font-mono text-text-secondary" title="VIX-based position sizing">
        {r.sizing} size
      </span>
    </div>
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
    <div
      className="inline-flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: tint("var(--text-muted)", 8) }}
    >
      {SESSION_ORDER.map((s) => {
        const enabled = available.includes(s);
        const isActive = s === active;
        const isLive = s === live;
        return (
          <button
            key={s}
            disabled={!enabled}
            onClick={() => enabled && onSelect(s)}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={
              isActive
                ? { background: "var(--accent-blue)", color: "#fff", fontWeight: 600 }
                : { color: "var(--text-secondary)" }
            }
            title={enabled ? SESSION_LABELS[s] : `${SESSION_LABELS[s]} — not captured this day`}
          >
            {isLive && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: isActive ? "#fff" : "var(--accent-green)" }}
                title="live session right now"
              />
            )}
            {SESSION_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

/* ── A clickable move chip (ticker + %) ──────────────────────────────────── */
function MoveChip({ m }: { m: BriefMover }) {
  const setTicker = useSetTicker();
  const color = changeColor(m.pct);
  return (
    <button
      onClick={() => setTicker(m.ticker)}
      className="inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
      style={{
        color,
        background: tint(color, 12),
        border: `1px solid ${m.on_radar ? color : tint(color, 26)}`,
      }}
      title={
        (m.on_radar ? "On your radar (flow/holding) · " : "Market-wide mover · ") +
        (m.intel || m.ticker)
      }
    >
      {m.on_radar && <Zap size={9} style={{ color }} />}
      <span className="font-bold">{m.ticker}</span>
      <span>{m.pct >= 0 ? "+" : ""}{m.pct.toFixed(1)}%</span>
      {m.earnings_in != null && m.earnings_in >= 0 && m.earnings_in <= 7 && (
        <span title={`reports in ${m.earnings_in}d`} className="text-accent-orange">ER{m.earnings_in}</span>
      )}
    </button>
  );
}

/* ── Plays — concrete actionable setups (the JARVIS layer) ────────────────── */
function PlaysBlock({ plays }: { plays: BriefPlay[] }) {
  const setTicker = useSetTicker();
  if (!plays || plays.length === 0) return null;
  return (
    <div>
      <SectionLabel icon={<Target size={11} />}>Plays &amp; actions</SectionLabel>
      <div className="space-y-1.5">
        {plays.map((p, i) => {
          const color = PLAY_COLOR[(p.action || "").toUpperCase()] || "var(--text-muted)";
          return (
            <div
              key={i}
              className="rounded-md px-2 py-1.5 text-xs"
              style={{ background: tint(color, 6), border: `1px solid ${tint(color, 20)}` }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span
                  className="font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-xs"
                  style={{ color, background: tint(color, 14) }}
                >
                  {p.action}
                </span>
                <button
                  onClick={() => setTicker(p.ticker)}
                  className="font-mono font-bold text-text-primary hover:text-accent-blue"
                >
                  {p.ticker}
                </button>
                <span className="text-text-secondary">{p.thesis}</span>
              </div>
              <div className="text-text-muted leading-snug pl-0.5">
                <span className="text-text-secondary">Trigger:</span> {p.trigger}
              </div>
              <div className="text-text-muted leading-snug pl-0.5">
                <span style={{ color: "var(--accent-red)" }}>Risk:</span> {p.risk}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Movers explained (the Claude causal list) ───────────────────────────── */
function MoversExplained({ rows }: { rows: BriefRead["movers_explained"] }) {
  const setTicker = useSetTicker();
  if (!rows || rows.length === 0) return null;
  return (
    <div>
      <SectionLabel icon={<Zap size={11} />}>What moved &amp; why</SectionLabel>
      <div className="space-y-1.5">
        {rows.map((m, i) => {
          const up = !m.move.includes("-");
          const color = up ? "var(--accent-green)" : "var(--accent-red)";
          return (
            <div key={i} className="text-xs leading-snug">
              <button
                onClick={() => setTicker(m.ticker)}
                className="font-mono font-bold hover:underline"
                style={{ color }}
                title={`Open ${m.ticker}`}
              >
                {m.ticker} {m.move}
              </button>
              <span className="text-text-secondary"> — {m.why}</span>
              {m.flag && (
                <span className="inline-flex items-start gap-1 ml-1 text-accent-orange">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                  {m.flag}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Deterministic desk blocks ───────────────────────────────────────────── */
function MoversStrip({ ctx }: { ctx: BriefContext }) {
  const { gainers, losers } = ctx.movers;
  if (gainers.length === 0 && losers.length === 0) {
    return (
      <div>
        <SectionLabel icon={<TrendingUp size={11} />}>Session movers</SectionLabel>
        <div className="text-xs text-text-muted">Populates after the open.</div>
      </div>
    );
  }
  return (
    <div>
      <SectionLabel icon={<TrendingUp size={11} />}>Session movers</SectionLabel>
      <div className="space-y-1.5">
        {gainers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TrendingUp size={11} className="text-accent-green" />
            {gainers.map((m) => <MoveChip key={m.ticker} m={m} />)}
          </div>
        )}
        {losers.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <TrendingDown size={11} className="text-accent-red" />
            {losers.map((m) => <MoveChip key={m.ticker} m={m} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function EarningsBlock({ ctx }: { ctx: BriefContext }) {
  const setTicker = useSetTicker();
  const { this_week, flow_into_earnings } = ctx.earnings;
  return (
    <div>
      <SectionLabel icon={<Calendar size={11} />}>Earnings ahead</SectionLabel>
      {this_week.length === 0 && flow_into_earnings.length === 0 && (
        <div className="text-xs text-text-muted">Nothing in the next week.</div>
      )}
      {this_week.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          {this_week.map((e) => (
            <button
              key={e.ticker}
              onClick={() => setTicker(e.ticker)}
              className="inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
              style={{
                color: e.has_flow ? "var(--accent-blue)" : "var(--text-secondary)",
                background: tint(e.has_flow ? "var(--accent-blue)" : "var(--text-muted)", 12),
              }}
              title={`${e.ticker} reports ${e.date}${e.has_flow ? " · has flow today" : ""}`}
            >
              <span className="font-bold">{e.ticker}</span>
              <span className="text-text-muted">{e.days_out}d</span>
              {e.has_flow && <Zap size={9} className="text-accent-blue" />}
            </button>
          ))}
        </div>
      )}
      {flow_into_earnings.length > 0 && (
        <div className="text-xs text-text-secondary">
          <span className="text-text-muted">Flow into print: </span>
          {flow_into_earnings.map((e, i) => (
            <span key={e.ticker}>
              {i > 0 && ", "}
              <button onClick={() => setTicker(e.ticker)} className="font-mono font-semibold text-accent-blue hover:underline">
                {e.ticker}
              </button>
              <span className="text-text-muted"> ({e.days_out}d)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FlowBlock({ ctx }: { ctx: BriefContext }) {
  const setTicker = useSetTicker();
  if (!ctx.flow || ctx.flow.length === 0) return null;
  return (
    <div>
      <SectionLabel icon={<Eye size={11} />}>Unusual flow today</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {ctx.flow.map((f) => {
          const color = f.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
          return (
            <button
              key={f.ticker}
              onClick={() => setTicker(f.ticker)}
              className="inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
              style={{ color, background: tint(color, 12), border: `1px solid ${tint(color, 26)}` }}
              title={`${f.side} · ML ${f.ml ?? "?"} · $${Math.round(f.premium).toLocaleString()} premium${
                f.earnings_in != null ? ` · reports in ${f.earnings_in}d` : ""
              }`}
            >
              <span className="font-bold">{f.ticker}</span>
              {f.ml != null && <span className="text-text-muted">ML{f.ml}</span>}
              {f.earnings_in != null && f.earnings_in >= 0 && f.earnings_in <= 10 && (
                <span className="text-accent-orange">ER{f.earnings_in}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ThemesBlock({ ctx }: { ctx: BriefContext }) {
  const { hot, cooling } = ctx.themes;
  if (hot.length === 0 && cooling.length === 0) return null;
  return (
    <div>
      <SectionLabel icon={<Flame size={11} />}>Theme heat</SectionLabel>
      <div className="space-y-1 text-xs">
        {hot.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <Flame size={11} className="text-accent-green" />
            {hot.slice(0, 4).map((t) => (
              <span key={t.category} className="font-mono px-1.5 py-0.5 rounded"
                style={{ color: "var(--accent-green)", background: tint("var(--accent-green)", 12) }}>
                {t.category} <span className="opacity-70">{t.ratio}x</span>
              </span>
            ))}
          </div>
        )}
        {cooling.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <Snowflake size={11} className="text-accent-red" />
            {cooling.slice(0, 3).map((t) => (
              <span key={t.category} className="font-mono px-1.5 py-0.5 rounded"
                style={{ color: "var(--accent-red)", background: tint("var(--accent-red)", 12) }}>
                {t.category} <span className="opacity-70">{t.ratio}x</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BooksFootnote({ ctx }: { ctx: BriefContext }) {
  if (!ctx.books || ctx.books.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted pt-2 border-t border-border">
      <span className="uppercase tracking-wider">Your books</span>
      {ctx.books.map((b) => (
        <span key={b.label} className="font-mono">
          {b.label}{" "}
          <span style={{ color: changeColor(b.return_pct ?? 0) }}>
            {(b.return_pct ?? 0) >= 0 ? "+" : ""}{(b.return_pct ?? 0).toFixed(1)}%
          </span>
          <span className="text-text-muted/70"> ({b.open_positions}p</span>
          {b.near_stop > 0 && <span className="text-accent-red"> · {b.near_stop} near stop</span>}
          <span className="text-text-muted/70">)</span>
        </span>
      ))}
    </div>
  );
}

/* ── L4 — "Since you last looked" deltas ─────────────────────────────────── */
function DeltasStrip({ deltas }: { deltas: BriefDeltas }) {
  const markSeen = useMarkSeen();
  if (!deltas || !deltas.items || deltas.items.length === 0) return null;
  return (
    <div
      className="mt-2 rounded-md px-2 py-1.5"
      style={{ background: tint("var(--accent-blue)", 8), border: `1px solid ${tint("var(--accent-blue)", 22)}` }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "var(--accent-blue)" }}>
          <Bell size={11} /> Since you last looked
          {deltas.since && (
            <span className="text-text-muted font-normal">· {relativeAge(deltas.since)}</span>
          )}
        </span>
        <button
          onClick={() => markSeen.mutate()}
          disabled={markSeen.isPending}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors disabled:opacity-60"
          title="Mark caught up — resets the deltas"
        >
          <Check size={11} /> caught up
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {deltas.items.map((d, i) => {
          const color =
            d.dir === "up" ? "var(--accent-green)" : d.dir === "down" ? "var(--accent-red)" : "var(--text-secondary)";
          return (
            <span
              key={i}
              className="font-mono text-xs px-1.5 py-0.5 rounded"
              style={{ color, background: tint(color, 10) }}
            >
              {d.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── L5 — Your focus + anticipation rule flags ───────────────────────────── */
function FocusBlock({ ctx }: { ctx: BriefContext }) {
  const setTicker = useSetTicker();
  if (!ctx.focus || ctx.focus.length === 0) return null;
  return (
    <div>
      <SectionLabel icon={<Star size={11} />}>Your focus</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {ctx.focus.map((f) => {
          const color = f.pct == null ? "var(--accent-blue)" : changeColor(f.pct);
          return (
            <button
              key={f.ticker}
              onClick={() => setTicker(f.ticker)}
              className="inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded hover:opacity-80 transition-opacity"
              style={{ color, background: tint(color, 12), border: `1px solid ${tint(color, 24)}` }}
              title={`Viewed ${f.views}x recently${f.in_book ? " · in a book" : ""}`}
            >
              <span className="font-bold">{f.ticker}</span>
              {f.pct != null && <span>{f.pct >= 0 ? "+" : ""}{f.pct.toFixed(1)}%</span>}
              {f.earnings_in != null && f.earnings_in >= 0 && f.earnings_in <= 7 && (
                <span className="text-accent-orange">ER{f.earnings_in}</span>
              )}
              <span className="text-text-muted">·{f.views}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RuleFlags({ flags }: { flags: string[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{ background: tint("var(--accent-orange)", 7), border: `1px solid ${tint("var(--accent-orange)", 20)}` }}
    >
      <div className="text-xs font-semibold mb-1 inline-flex items-center gap-1" style={{ color: "var(--accent-orange)" }}>
        <ShieldAlert size={11} /> Rule watch
      </div>
      <div className="space-y-0.5">
        {flags.map((f, i) => (
          <div key={i} className="text-xs text-text-secondary leading-snug">• {f}</div>
        ))}
      </div>
    </div>
  );
}

/* ── L3 — Ask the desk (conversational) ──────────────────────────────────── */
function AskDesk() {
  const [q, setQ] = useState("");
  const [thread, setThread] = useState<AskTurn[]>([]);
  const ask = useAskDesk();

  const submit = () => {
    const question = q.trim();
    if (!question || ask.isPending) return;
    ask.mutate(
      { question, history: thread },
      {
        onSuccess: (data) => {
          setThread((t) => [...t, { q: question, a: data.answer || "(no answer)" }]);
          setQ("");
        },
      }
    );
  };

  return (
    <div className="pt-2 border-t border-border">
      <SectionLabel icon={<MessageSquare size={11} />}>Ask the desk</SectionLabel>
      {thread.length > 0 && (
        <div className="space-y-2 mb-2">
          {thread.map((t, i) => (
            <div key={i} className="space-y-1">
              <div className="text-xs font-mono text-accent-blue">{t.q}</div>
              <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{t.a}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. should I worry about my U position? what's the read on AVGO?"
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-muted outline-none rounded px-2 py-1.5"
          style={{ border: "1px solid var(--border)" }}
        />
        <button
          onClick={submit}
          disabled={ask.isPending || !q.trim()}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded transition-colors disabled:opacity-50"
          style={{ color: "var(--accent-blue)", background: tint("var(--accent-blue)", 12) }}
        >
          {ask.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          ask
        </button>
      </div>
      {ask.isPending && <div className="text-xs text-text-muted mt-1">desk is thinking…</div>}
    </div>
  );
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export function DailyBrief() {
  const [histDate, setHistDate] = useState<string>(""); // "" = today (live)
  const isHistory = !!histDate;
  const live = currentSession();
  const [activeSession, setActiveSession] = useState<BriefSession>(live);
  const { data, isLoading } = useCommandBrief(histDate || undefined, activeSession);
  const { data: datesData } = useBriefDates();
  const refresh = useRefreshBrief(activeSession);
  const [expanded, setExpanded] = useState(true);
  const setTicker = useSetTicker();

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

  if (isLoading && !data) {
    return (
      <div className="card flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={14} className="animate-spin" />
        Assembling daily brief…
      </div>
    );
  }
  if (!data) return null;

  const ctx = data.context;
  const read = (data.read || {}) as Partial<BriefRead>;
  const regime = ctx.regime as BriefRegime;
  const hasRegime = regime && typeof regime.vix === "number";
  const accent = hasRegime ? POSTURE_COLOR[regime.posture] || "var(--accent-purple)" : "var(--accent-purple)";

  return (
    <div className="card" style={{ borderLeft: `3px solid ${accent}` }}>
      {/* Header strip */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-text-primary hover:text-accent-blue transition-colors"
        >
          <Sparkles size={16} style={{ color: accent }} />
          <span className="text-sm font-semibold">Daily Brief</span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {hasRegime && !isHistory && <RegimePill r={regime} />}
          {/* History date picker — review past briefs to judge accuracy */}
          <div
            className="inline-flex items-center gap-1 text-xs rounded px-1.5 py-1"
            style={{ background: tint("var(--text-muted)", 8) }}
            title="Review a past day's brief"
          >
            <History size={12} className="text-text-muted" />
            <select
              value={histDate}
              onChange={(e) => selectDate(e.target.value)}
              className="bg-transparent text-text-secondary outline-none cursor-pointer"
            >
              <option value="">Today (live)</option>
              {(datesData?.dates || [])
                .filter((d) => d.pt_date !== data.pt_date || isHistory)
                .map((d) => (
                  <option key={d.pt_date} value={d.pt_date}>
                    {d.pt_date}
                  </option>
                ))}
            </select>
          </div>
          {isHistory ? (
            <span
              className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ color: "var(--accent-purple)", background: tint("var(--accent-purple)", 12) }}
            >
              historical · {data.pt_date}
            </span>
          ) : (
            <>
              {data.read_as_of && !data.pending && (
                <span className="text-xs text-text-muted" title={data.read_as_of}>
                  {data.stale ? "stale · " : ""}read {relativeAge(data.read_as_of)}
                </span>
              )}
              <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors disabled:opacity-60"
                title={`Regenerate the ${SESSION_LABELS[activeSession]} Read (~3 min)`}
              >
                <RefreshCw size={12} className={refresh.isPending ? "animate-spin" : ""} />
                {refresh.isPending ? "thinking…" : "refresh"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Session tabs — pre-market / midday / after-hours */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <SessionTabs
          available={availableSessions}
          active={activeSession}
          live={isHistory ? null : live}
          onSelect={setActiveSession}
        />
        {isHistory && (
          <span className="text-xs text-text-muted">
            {data.session_label || SESSION_LABELS[activeSession]} ·{" "}
            {data.read_as_of ? relativeAge(data.read_as_of) : ""}
          </span>
        )}
      </div>

      {/* Headline — always visible */}
      {read.headline ? (
        <div className="mt-2 text-sm font-semibold text-text-primary leading-snug">{read.headline}</div>
      ) : data.pending ? (
        <div className="mt-2 text-xs text-text-muted italic">
          {SESSION_LABELS[activeSession]} brief generates around {fmtGenEta(data.gen_eta_min)} — the
          live desk blocks below are current.
        </div>
      ) : (
        <div className="mt-2 text-xs text-text-muted italic">
          No Read yet today — hit refresh to generate the synthesis (the desk blocks below are live).
        </div>
      )}

      {/* L4 — proactive deltas (live only) */}
      {!isHistory && data.deltas && <DeltasStrip deltas={data.deltas} />}

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* THE READ — causal market narrative */}
          {read.read && <p className="text-xs text-text-secondary leading-relaxed">{read.read}</p>}
          <MoversExplained rows={read.movers_explained || []} />
          {read.watch && read.watch.length > 0 && (
            <div>
              <SectionLabel icon={<Eye size={11} />}>Watch</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {read.watch.map((w, i) => (
                  <button
                    key={i}
                    onClick={() => setTicker(w.ticker)}
                    className="text-left rounded px-2 py-1 hover:bg-bg-card-hover transition-colors"
                    style={{ background: tint("var(--accent-blue)", 6), border: "1px solid var(--border)" }}
                    title={w.why}
                  >
                    <span className="font-mono text-xs font-bold text-accent-blue">{w.ticker}</span>
                    <span className="text-xs text-text-muted ml-1.5">{w.why}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <PlaysBlock plays={read.plays || []} />
          {read.heads_up && read.heads_up.length > 0 && (
            <div className="space-y-1">
              {read.heads_up.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                  <AlertTriangle size={11} className="text-accent-orange mt-0.5 shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
            </div>
          )}

          {/* L5 — anticipation: deterministic rule flags */}
          <RuleFlags flags={ctx.rule_flags || []} />

          {/* THE DESK — deterministic, always accurate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border">
            <MoversStrip ctx={ctx} />
            <EarningsBlock ctx={ctx} />
            <FlowBlock ctx={ctx} />
            <ThemesBlock ctx={ctx} />
          </div>

          {/* L5 — personalisation: your most-clicked names */}
          <FocusBlock ctx={ctx} />

          <BooksFootnote ctx={ctx} />

          {/* L3 — ask the desk (live only) */}
          {!isHistory && <AskDesk />}
        </div>
      )}
    </div>
  );
}
