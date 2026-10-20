import { useState, useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { RefreshCw, Loader2, History, Send, Check } from "lucide-react";
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
  type BriefPlay,
  type BriefRead,
  type BriefRegime,
  type BriefSession,
} from "../../api/commandBrief";
import { useAppStore } from "../../store/useAppStore";
import { relativeAge, formatPremium } from "../../lib/utils";
import {
  TileGrid,
  Tile,
  Kpi,
  KpiTile,
  BarRow,
  HeatTile,
  Gauge,
  ActionCard,
  CockpitButton,
  toneOf,
  toneColor,
} from "../../components/Cockpit";
import { ThemeTrendsChart } from "./ThemeTrendsChart";

/* v3 cockpit home (DESIGN.md "2026-10 v3 cockpit"): toolbar → KPI strip →
 * "needs you today" ActionCards → TileGrid of desk data → full brief in
 * morning-paper style at #full-brief. */

type Tone = Parameters<typeof toneColor>[0];

/* Only states the reader must notice get a tint; the rest stay neutral. */
const PLAY_TONE: Record<string, Tone> = {
  AVOID: "down",
  MANAGE: "warn",
  ACCUMULATE: "up",
  BUY: "up",
};

const POSTURE_TONE: Record<string, Tone> = {
  "risk-on": "up",
  neutral: "warn",
  "risk-off": "down",
};

function mutationError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const signed = (n: number, dp = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
const deltaCls = (n: number) => (n >= 0 ? "delta-up" : "delta-down");
const absMax = (xs: number[]) => xs.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

const btnQuiet =
  "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-60";

function useSetTicker() {
  return useAppStore((s) => s.setActiveTicker);
}

/* Ticker button — the one click target that feeds the shared analysis panel. */
function Tick({ t, className = "" }: { t: string; className?: string }) {
  const setTicker = useSetTicker();
  return (
    <button
      type="button"
      onClick={() => setTicker(t)}
      className={`ticker hover:text-accent! hover:underline ${className}`}
      title={`Open ${t}`}
    >
      {t}
    </button>
  );
}

/* Small "reports soon" marker that fits inside a BarRow label. */
const ErMark = ({ d }: { d: number }) => (
  <span className="ml-1 text-xs font-medium text-accent-orange" title={`reports in ${d}d`}>
    E{d}
  </span>
);

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

/* ── KPI strip ───────────────────────────────────────────────────────────── */
function KpiStrip({ ctx, regime, isHistory }: { ctx: BriefContext; regime: BriefRegime | null; isHistory: boolean }) {
  const books = (ctx.books || []).filter((b) => b.return_pct != null);
  const sorted = [...books].sort((a, b) => (b.return_pct ?? 0) - (a.return_pct ?? 0));
  const best = sorted[0];
  const worst = sorted.length > 1 ? sorted[sorted.length - 1] : undefined;
  const openTotal = (ctx.books || []).reduce((n, b) => n + (b.open_positions ?? 0), 0);
  const snap = isHistory ? " · as captured" : "";
  return (
    <TileGrid>
      {regime ? (
        <>
          <KpiTile
            label="S&P 500 (SPY)"
            value={regime.spy_price ? regime.spy_price.toFixed(2) : "—"}
            delta={signed(regime.spy_change_pct, 2)}
            tone={toneOf(regime.spy_change_pct)}
            sub={`${regime.market_status || "session"}${snap}`}
          />
          <KpiTile
            label="Volatility (VIX)"
            value={regime.vix.toFixed(2)}
            tone={regime.vix >= 25 ? "down" : regime.vix >= 18 ? "warn" : "up"}
            delta={regime.vix_regime.toLowerCase()}
            sub={`VIX-based sizing: ${regime.sizing}${snap}`}
          />
          <KpiTile
            label="Posture"
            value={<span className="capitalize">{regime.posture}</span>}
            delta={`${regime.sizing} size`}
            tone={POSTURE_TONE[regime.posture] ?? "neutral"}
            sub={regime.is_safe ? "regime check passes" : "regime check fails — size down"}
          />
        </>
      ) : (
        <Tile span={9}>
          <span className="text-sm text-text-muted">Regime data not captured for this brief.</span>
        </Tile>
      )}
      {best ? (
        <KpiTile
          label={`Best book · ${best.label}`}
          value={signed(best.return_pct ?? 0)}
          tone={toneOf(best.return_pct)}
          sub={
            worst
              ? `worst ${worst.label} ${signed(worst.return_pct ?? 0)} · ${openTotal} open`
              : `${openTotal} open`
          }
        />
      ) : (
        <KpiTile label="Paper books" value="—" sub="no book data in this brief" />
      )}
    </TileGrid>
  );
}

/* ── "Needs you today" — plays, heads-up, rule flags as ActionCards ──────── */
function NeedsYou({
  plays,
  headsUp,
  flags,
  sessionLabel,
}: {
  plays: BriefPlay[];
  headsUp: string[];
  flags: string[];
  sessionLabel: string;
}) {
  const setTicker = useSetTicker();
  const n = plays.length + headsUp.length + flags.length;
  if (n === 0) return null;
  return (
    <section className="flex flex-col gap-3.5" aria-label="Needs you today">
      <h2 className="m-0 text-2xl font-semibold tracking-tight text-text-primary">
        {n} {n === 1 ? "thing needs" : "things need"} you today
      </h2>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {plays.map((p, i) => {
          const action = (p.action || "").toUpperCase();
          return (
            <ActionCard
              key={`p${i}`}
              kind={<>{p.action} · play</>}
              tone={PLAY_TONE[action] ?? "neutral"}
              when={`from the ${sessionLabel} brief`}
              ticker={<Tick t={p.ticker} />}
              actions={
                <CockpitButton primary onClick={() => setTicker(p.ticker)}>
                  Open analysis
                </CockpitButton>
              }
            >
              <p className="m-0 text-text-primary">{p.thesis}</p>
              <dl className="mt-2.5 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                <dt className="font-medium text-text-muted">Trigger</dt>
                <dd className="m-0">{p.trigger}</dd>
                <dt className="font-medium text-text-muted">Risk</dt>
                <dd className="m-0">{p.risk}</dd>
              </dl>
            </ActionCard>
          );
        })}
        {headsUp.length > 0 && (
          <ActionCard kind="Heads up" tone="warn" when="from the brief" title={`${headsUp.length} ${headsUp.length === 1 ? "note" : "notes"}`}>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
              {headsUp.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </ActionCard>
        )}
        {flags.length > 0 && (
          <ActionCard kind="Rule watch" tone="warn" when="deterministic rule checks" title={`${flags.length} rule ${flags.length === 1 ? "flag" : "flags"}`}>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              {flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </ActionCard>
        )}
      </div>
    </section>
  );
}

/* ── Tiles ───────────────────────────────────────────────────────────────── */
function MoversTile({ ctx }: { ctx: BriefContext }) {
  const setTicker = useSetTicker();
  const { gainers, losers } = ctx.movers;
  const rows = [...gainers, ...losers];
  const max = absMax(rows.map((m) => m.pct));
  return (
    <Tile span={5} title="Session movers" meta={`% change${ctx.movers.priced ? ` · ${ctx.movers.priced} priced` : ""}`}>
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-text-muted">Populates after the open.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((m, i) => (
            <div key={m.ticker} className={i === gainers.length && i > 0 ? "mt-1.5 border-t border-border pt-1.5" : ""}>
              <BarRow
                diverging
                label={
                  <>
                    {m.ticker}
                    {m.on_radar && <span className="ml-1 text-accent" title="on your radar (flow/holding)">•</span>}
                    {m.earnings_in != null && m.earnings_in >= 0 && m.earnings_in <= 7 && <ErMark d={m.earnings_in} />}
                  </>
                }
                value={m.pct}
                max={max}
                display={signed(m.pct)}
                onClick={() => setTicker(m.ticker)}
                title={(m.on_radar ? "On your radar (flow/holding) · " : "Market-wide mover · ") + (m.intel || m.ticker)}
              />
            </div>
          ))}
        </div>
      )}
      <p className="m-0 mt-auto text-xs text-text-muted">
        <span className="text-accent">•</span> on your radar · <span className="text-accent-orange">E3</span> reports in 3d
      </p>
    </Tile>
  );
}

function FlowTile({ ctx }: { ctx: BriefContext }) {
  const setTicker = useSetTicker();
  if (!ctx.flow || ctx.flow.length === 0) return null;
  const max = absMax(ctx.flow.map((f) => f.premium));
  return (
    <Tile span={5} title="Unusual flow today" meta="premium · ML score">
      <div className="flex flex-col gap-1">
        {ctx.flow.map((f) => (
          <BarRow
            key={f.ticker}
            label={
              <>
                {f.ticker}
                {f.earnings_in != null && f.earnings_in >= 0 && f.earnings_in <= 10 && <ErMark d={f.earnings_in} />}
              </>
            }
            value={f.premium}
            max={max}
            display={formatPremium(f.premium)}
            tone={f.side === "Bull" ? "up" : "down"}
            trailing={f.ml != null ? f.ml : "—"}
            onClick={() => setTicker(f.ticker)}
            title={`${f.side} · ML ${f.ml ?? "?"}${f.nscore != null ? ` · NScore ${f.nscore}` : ""} · $${Math.round(
              f.premium
            ).toLocaleString()} premium${f.earnings_in != null ? ` · reports in ${f.earnings_in}d` : ""}`}
          />
        ))}
      </div>
      <p className="m-0 mt-auto flex gap-3.5 text-xs text-text-muted">
        <span>
          <span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--accent-green)" }} /> Bull
        </span>
        <span>
          <span className="inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: "var(--accent-red)" }} /> Bear
        </span>
      </p>
    </Tile>
  );
}

/* Book labels are words, not tickers, so BarRow's 4.25rem ticker column is too
 * narrow; same diverging bar, wider label column. */
function BooksTile({ ctx }: { ctx: BriefContext }) {
  if (!ctx.books || ctx.books.length === 0) return null;
  const max = absMax(ctx.books.map((b) => b.return_pct ?? 0));
  return (
    <Tile span={4} title="Paper books" meta="return since reset">
      <div className="flex flex-col gap-1">
        {ctx.books.map((b) => {
          const r = b.return_pct ?? 0;
          const pct = max > 0 ? Math.min(100, (Math.abs(r) / max) * 100) : 0;
          const bar: CSSProperties = { width: `${Math.max(pct, r ? 2 : 0)}%`, background: toneColor(toneOf(r) === "neutral" ? "info" : toneOf(r)) };
          return (
            <div
              key={b.label}
              className="grid min-h-6 items-center gap-2.5 px-1"
              style={{ gridTemplateColumns: "6.5rem minmax(0,1fr) 4rem" }}
              title={`${b.label} · ${b.open_positions ?? 0} open${b.near_stop > 0 ? ` · ${b.near_stop} near stop` : ""}`}
            >
              <span className="min-w-0 truncate text-[0.8125rem] text-text-secondary">
                {b.label}
                {b.near_stop > 0 && <span className="ml-1 text-xs text-accent-red">{b.near_stop}!</span>}
              </span>
              <div className="grid grid-cols-2">
                <div className="flex justify-end">{r < 0 && <span className="h-3 rounded-l-[3px]" style={bar} />}</div>
                <div className="flex border-l border-border">{r > 0 && <span className="h-3 rounded-r-[3px]" style={bar} />}</div>
              </div>
              <span className={`num text-right text-[0.8125rem] ${deltaCls(r)}`}>{b.return_pct != null ? signed(r) : "—"}</span>
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-auto text-xs text-text-muted">
        {ctx.books.reduce((n, b) => n + (b.open_positions ?? 0), 0)} open positions
        {ctx.books.some((b) => b.near_stop > 0) && (
          <span className="text-accent-red"> · {ctx.books.reduce((n, b) => n + b.near_stop, 0)} near stop</span>
        )}
      </p>
    </Tile>
  );
}

function RegimeTile({ r }: { r: BriefRegime }) {
  return (
    <Tile span={3} title="Market regime">
      <span className="text-xs text-text-muted">
        VIX <span className="num text-text-primary">{r.vix.toFixed(2)}</span> · {r.vix_regime.toLowerCase()}
      </span>
      <Gauge value={r.vix} min={10} max={40} ticks={["10", "20", "30", "40"]} />
      <div className="mt-1 grid grid-cols-2 gap-3">
        <Kpi size="md" label="Posture" value={<span className="capitalize">{r.posture}</span>} />
        <Kpi size="md" label="Sizing" value={<span className="capitalize">{r.sizing}</span>} />
      </div>
      {r.market_status && <span className="text-xs text-text-muted">Market {r.market_status}</span>}
    </Tile>
  );
}

function ThemesTile({ ctx }: { ctx: BriefContext }) {
  const { hot, cooling } = ctx.themes;
  if (hot.length === 0 && cooling.length === 0) return null;
  const cell = (t: BriefContext["themes"]["hot"][number], tone: "up" | "down") => (
    <HeatTile
      key={t.category}
      label={<span title={t.category}>{t.category.replace(/_/g, " ")}</span>}
      value={`${t.ratio}×`}
      tone={tone}
      intensity={tone === "up" ? (t.ratio - 1) / 2 : (1 - t.ratio) * 1.5}
      sub={t.tickers != null ? `${t.tickers} tickers` : undefined}
    />
  );
  return (
    <Tile span={7} title="Theme heat" meta="flow premium vs baseline · 1.0× = normal">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {hot.slice(0, 4).map((t) => cell(t, "up"))}
        {cooling.slice(0, 4).map((t) => cell(t, "down"))}
      </div>
    </Tile>
  );
}

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
};

function EarningsTile({ ctx }: { ctx: BriefContext }) {
  const { this_week, flow_into_earnings } = ctx.earnings;
  const days: { date: string; rows: typeof this_week }[] = [];
  for (const e of [...this_week].sort((a, b) => a.days_out - b.days_out)) {
    const last = days[days.length - 1];
    if (last && last.date === e.date) last.rows.push(e);
    else days.push({ date: e.date, rows: [e] });
  }
  return (
    <Tile span={5} title="Earnings this week" meta={this_week.length ? `${this_week.length} reporting` : undefined}>
      {days.length === 0 && flow_into_earnings.length === 0 && (
        <p className="m-0 text-sm text-text-muted">Nothing in the next week.</p>
      )}
      {days.length > 0 && (
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(4.75rem, 1fr))" }}>
          {days.map((d, i) => (
            <div
              key={d.date}
              className="flex min-w-0 flex-col gap-1.5 rounded-lg p-2.5"
              style={{
                background:
                  i === 0 && d.rows[0].days_out <= 1
                    ? "color-mix(in srgb, var(--accent) 14%, var(--bg-card))"
                    : "var(--track)",
              }}
            >
              <span className="text-xs text-text-muted" title={d.date}>
                {dayLabel(d.date)} · <span className="num">{d.rows[0].days_out}d</span>
              </span>
              <div className="flex flex-col items-start gap-0.5">
                {d.rows.map((e) => (
                  <span
                    key={e.ticker}
                    className="inline-flex items-baseline gap-1 text-[0.8125rem]"
                    title={`${e.ticker} reports ${e.date}${e.session ? ` ${e.session}` : ""}${e.has_flow ? " · has flow today" : ""}`}
                  >
                    <Tick t={e.ticker} />
                    {e.has_flow && <span className="text-xs text-accent" title="has flow today">•</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {flow_into_earnings.length > 0 && (
        <p className="m-0 text-sm text-text-secondary">
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
      {this_week.some((e) => e.has_flow) && (
        <p className="m-0 mt-auto text-xs text-text-muted">
          <span className="text-accent">•</span> has flow today
        </p>
      )}
    </Tile>
  );
}

/* "Since you last looked" — delta text arrives pre-formatted ("VIX 15.5 →
 * 18.4", "Smart $-2,418", "new gainer: IRON"); split into label + value and
 * merge same-label items (the "new gainer" list) into one cell. */
function splitDelta(text: string): [string, string] {
  const colon = text.match(/^(.*?):\s+(.*)$/);
  if (colon) return [colon[1], colon[2]];
  const num = text.match(/^(.*?)\s+([-+$\d].*)$/);
  return num ? [num[1], num[2]] : ["", text];
}

function DeltasTile({ deltas, span }: { deltas: BriefDeltas; span: 7 | 12 }) {
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
    <Tile
      span={span}
      title="Since you last looked"
      meta={deltas.since ? <span title={deltas.since}>{relativeAge(deltas.since)}</span> : undefined}
      actions={
        <button
          type="button"
          onClick={() => markSeen.mutate()}
          disabled={markSeen.isPending}
          className={btnQuiet}
          title="Mark caught up — resets the deltas"
        >
          <Check size={12} /> Caught up
        </button>
      }
    >
      <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0 sm:grid-cols-3">
        {cells.map((c, i) => (
          <li key={i} className="flex min-w-0 flex-col">
            {c.label && <span className="truncate text-xs capitalize text-text-muted">{c.label}</span>}
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
    </Tile>
  );
}

function FocusTile({ ctx, span }: { ctx: BriefContext; span: 5 | 12 }) {
  const setTicker = useSetTicker();
  if (!ctx.focus || ctx.focus.length === 0) return null;
  const max = absMax(ctx.focus.map((f) => f.pct ?? 0));
  return (
    <Tile span={span} title="Your focus" meta="% today · views">
      <div className="flex flex-col gap-1">
        {ctx.focus.map((f) => (
          <BarRow
            key={f.ticker}
            diverging
            label={
              <>
                {f.ticker}
                {f.earnings_in != null && f.earnings_in >= 0 && f.earnings_in <= 7 && <ErMark d={f.earnings_in} />}
              </>
            }
            value={f.pct ?? 0}
            max={max}
            display={f.pct != null ? signed(f.pct) : "—"}
            trailing={`${f.views}v`}
            onClick={() => setTicker(f.ticker)}
            title={`Viewed ${f.views}x recently${f.in_book ? " · in a book" : ""}`}
          />
        ))}
      </div>
    </Tile>
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
    <Tile span={12} title="Ask the desk" meta="today's tape, your books, or a ticker">
      {thread.length > 0 && (
        <div className="flex flex-col gap-4">
          {thread.map((t, i) => (
            <div key={i} className="flex max-w-[72ch] flex-col gap-1.5 border-b border-border pb-4 last:border-b-0">
              <div className="text-sm font-semibold text-text-primary">{t.q}</div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{t.a}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex max-w-[72ch] items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. should I worry about my U position? what's the read on AVGO?"
          className="control-surface min-h-9 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
        <CockpitButton primary onClick={submit} disabled={ask.isPending || !q.trim()}>
          {ask.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          Ask
        </CockpitButton>
      </div>
      {ask.isPending && <div className="text-xs text-text-muted">Desk is thinking…</div>}
      {ask.isError && (
        <div className="text-xs text-accent-red" role="alert">
          {mutationError(ask.error, "The desk could not answer. Try again.")}
        </div>
      )}
    </Tile>
  );
}

/* ── Full brief — morning-paper reading section ──────────────────────────── */
function FullBrief({ read, dateline }: { read: Partial<BriefRead>; dateline: ReactNode }) {
  const movers = read.movers_explained || [];
  const watch = read.watch || [];
  if (!read.headline && !read.read && movers.length === 0 && watch.length === 0) return null;
  return (
    <article id="full-brief" className="flex scroll-mt-24 flex-col gap-6 border-t border-border pt-8">
      <div className="text-sm text-text-muted">{dateline}</div>
      {read.headline && <h2 className="headline max-w-[34ch]">{read.headline}</h2>}
      {read.read && (
        <div className="prose-read whitespace-pre-line lg:columns-2 lg:gap-10">{read.read}</div>
      )}

      {movers.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="m-0 text-base font-semibold text-text-primary">What moved, and why</h3>
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
            {movers.map((m, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-baseline gap-2.5">
                  <Tick t={m.ticker} className="text-base" />
                  <span className={`text-base font-semibold ${m.move.includes("-") ? "delta-down" : "delta-up"}`}>{m.move}</span>
                </div>
                <p className="prose-read m-0">{m.why}</p>
                {m.flag && <div className="callout">{m.flag}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {watch.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-border pt-5">
          <h3 className="m-0 text-base font-semibold text-text-primary">Watch</h3>
          <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
            {watch.map((w, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-1">
                <Tick t={w.ticker} className="self-start text-base" />
                <p className="m-0 text-sm leading-relaxed text-text-secondary">{w.why}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
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
  const sessionLabel = data.session_label || SESSION_LABELS[activeSession];
  const showDeltas = !isHistory && !!data.deltas?.items?.length;
  const showFocus = !!ctx.focus?.length;
  const hasFullRead = !!read.read || !!read.movers_explained?.length || !!read.watch?.length;
  const dateline = (
    <>
      {sessionLabel} · <span className="num">{data.pt_date}</span>
      {isHistory && " · archive"}
      {data.read_as_of && !data.pending && (
        <span title={data.read_as_of}>
          {" · "}
          {!isHistory && data.stale ? "stale · " : ""}read {relativeAge(data.read_as_of)}
        </span>
      )}
    </>
  );


  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar — session, date, freshness, refresh */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {sessionTabs}
          <span className="text-xs text-text-muted">{dateline}</span>
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

      <KpiStrip ctx={ctx} regime={hasRegime ? regime : null} isHistory={isHistory} />

      <NeedsYou
        plays={read.plays || []}
        headsUp={read.heads_up || []}
        flags={ctx.rule_flags || []}
        sessionLabel={sessionLabel}
      />

      <TileGrid>
        {/* Front page — dateline, headline, clamped lede, jump to full read */}
        <Tile span={7} bodyClassName="flex-1 gap-3.5">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-text-muted">
            <span
              className="rounded-full px-2.5 py-0.5 font-semibold text-accent"
              style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
            >
              {sessionLabel} brief
            </span>
            {dateline}
          </div>
          {read.headline ? (
            <h2 className="headline">{read.headline}</h2>
          ) : data.pending ? (
            <p className="m-0 text-base text-text-muted">
              {SESSION_LABELS[activeSession]} brief generates around {fmtGenEta(data.gen_eta_min)} — the live desk
              data is current.
            </p>
          ) : (
            <p className="m-0 text-base text-text-muted">
              No Read yet today — hit Refresh to generate the synthesis (the desk data is live).
            </p>
          )}
          {read.read && (
            <p className="m-0 line-clamp-3 max-w-[70ch] text-[0.9375rem] leading-relaxed text-text-secondary">
              {read.read}
            </p>
          )}
          {(read.movers_explained || []).length > 0 && (
            <div className="flex flex-col divide-y divide-border border-t border-border">
              {(read.movers_explained || []).slice(0, 5).map((m, i) => (
                <div key={i} className="grid grid-cols-[4.25rem_4.5rem_minmax(0,1fr)] items-baseline gap-2.5 py-1.5" title={m.why}>
                  <Tick t={m.ticker} className="justify-self-start text-[0.8125rem]" />
                  <span className={`text-[0.8125rem] font-semibold ${m.move.includes("-") ? "delta-down" : "delta-up"}`}>{m.move}</span>
                  <span className="truncate text-sm text-text-secondary">{m.why}</span>
                </div>
              ))}
            </div>
          )}
          {hasFullRead && (
            <div className="mt-auto flex flex-wrap gap-2.5 pt-1">
              <CockpitButton primary href="#full-brief">
                Read full brief
              </CockpitButton>
            </div>
          )}
        </Tile>
        <MoversTile ctx={ctx} />

        <FlowTile ctx={ctx} />
        <BooksTile ctx={ctx} />
        {hasRegime && <RegimeTile r={regime} />}

        <ThemesTile ctx={ctx} />
        <EarningsTile ctx={ctx} />

        {showDeltas && data.deltas && <DeltasTile deltas={data.deltas} span={showFocus ? 7 : 12} />}
        {showFocus && <FocusTile ctx={ctx} span={showDeltas ? 5 : 12} />}

        {/* Theme heat over time — full width; defaults to a 7-day window. */}
        <ThemeTrendsChart embedded />

        {/* L3 — ask the desk (live only) */}
        {!isHistory && <AskDesk />}
      </TileGrid>

      <FullBrief read={read} dateline={dateline} />
    </div>
  );
}
