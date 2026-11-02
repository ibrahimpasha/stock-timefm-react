import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import apiClient from "../../api/client";
import { useMarketHistory } from "../../api/forecast";
import { BarRow, Tile, TileGrid } from "../../components/Cockpit";
import { DivergingStrip } from "../../components/DivergingStrip";
import { Segmented } from "../../components/Glass";
import { KpiTabs } from "../../components/KpiTabs";
import { SparklineChart } from "../../components/SparklineChart";
import { changeTone, minutesToOpen } from "../../lib/deskMath";

type Point = { date: string; value: number };

interface Book {
  key: string;
  label: string;
  kind: "Stocks" | "Options";
  retired: boolean;
  color: string;
  capital: number;
  returnPct: number;
  value: number;
  open: number;
  history: Point[];
  note?: string;
  href: string;
}

// Color follows the book and never its rank, so a filter can't repaint the survivors.
const BOOK_META: Record<string, { label: string; color: string; note?: string }> = {
  steady: { label: "Steady", color: "var(--series-3)" },
  core: { label: "Core", color: "var(--series-4)" },
  flowfollow: { label: "Flow Follow", color: "var(--series-6)", note: "Control for flow itself" },
  optionslab: { label: "Options Lab", color: "var(--series-8)", note: "Small research book" },
  gemfinder: { label: "Gem Finder", color: "var(--series-1)" },
  supercycle: { label: "Supercycle", color: "var(--series-2)" },
  conviction: { label: "Conviction", color: "var(--series-5)", note: "Hand-picked" },
  smart: { label: "Smart", color: "var(--text-muted)" },
  aggressive: { label: "Aggressive", color: "var(--text-muted)" },
  builder: { label: "Builder", color: "var(--text-muted)" },
  ruby: { label: "Ruby", color: "var(--text-muted)" },
};

const SPY_COLOR = "var(--text-primary)";
const RANGES = [
  { value: "1M", label: "1M", days: 30 },
  { value: "3M", label: "3M", days: 90 },
  { value: "ALL", label: "All", days: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["value"];

const MATRIX_DAYS = 30;
const ARC_TICKS = 41;
/** Past this the gauge is full: -50% needs +100% to recover, and the book is effectively gone. */
const ARC_MAX_DRAWDOWN = 50;
const FLOW_TRADER = "flowtrader";
/** Older than this, a mark has outlived the weekend: the price behind the value is out of date. */
const STALE_MARK_DAYS = 4;

const signed = (n: number, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;
const dollars = (n: number) => `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString()}`;
const toneColor = (n: number) => (n >= 0 ? "var(--accent-green)" : "var(--accent-red)");
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;

/** Last snapshot per date, oldest first. Book snapshots can land several times a day. */
function dailyPoints(rows: { date: string; value: number }[]): Point[] {
  const byDate = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) byDate.set(row.date, row.value);
  return [...byDate.entries()].map(([date, value]) => ({ date, value }));
}

function maxDrawdown(book: Book) {
  let peak = book.capital;
  let worst = 0;
  for (const { value } of book.history) {
    peak = Math.max(peak, value);
    worst = Math.min(worst, (value / peak - 1) * 100);
  }
  return worst;
}

function currentDrawdown(book: Book) {
  const peak = Math.max(book.capital, ...book.history.map((p) => p.value));
  const last = book.history[book.history.length - 1]?.value ?? book.capital;
  return (last / peak - 1) * 100;
}

/** Day-over-day change, dollars and percent. The first snapshot has no prior day to compare. */
function dailyChanges(book: Book) {
  return book.history.slice(1).map((point, i) => ({
    date: point.date,
    dollars: point.value - book.history[i].value,
    pct: (point.value / book.history[i].value - 1) * 100,
  }));
}

interface PersonaRow {
  name: string;
  instrument_kind: "option" | "equity";
  return_pct: number;
  open_positions: number;
  total_value: number;
  retired?: boolean;
}

function useBooks() {
  const personas = useQuery<{ personas: PersonaRow[] }>({
    queryKey: ["smart-trader-personas"],
    queryFn: () => apiClient.get("/smart-trader/personas").then((r) => r.data),
    staleTime: 60_000,
  });
  const rows = useMemo(() => personas.data?.personas ?? [], [personas.data]);
  const histories = useQueries({
    queries: rows.map((p) => ({
      queryKey: ["smart-trader-history", p.name, 365],
      queryFn: () => apiClient.get<Point[]>(`/smart-trader/history?days=365&persona=${p.name}`).then((r) => r.data),
      staleTime: 60_000,
    })),
  });
  const flowSummary = useQuery<{ total_value: number; return_pct: number; open_positions: number }>({
    queryKey: ["flow-paper-summary"],
    queryFn: () => apiClient.get("/flow-paper/summary").then((r) => r.data),
    staleTime: 60_000,
  });
  const flowHistory = useQuery<Point[]>({
    queryKey: ["flow-paper-history", 365],
    queryFn: () => apiClient.get("/flow-paper/history?days=365").then((r) => r.data),
    staleTime: 60_000,
  });
  const historyData = histories.map((h) => h.data);
  const books = useMemo<Book[]>(() => {
    const list: Book[] = rows.map((p, i) => {
      const meta = BOOK_META[p.name] ?? { label: p.name, color: "var(--text-muted)" };
      return {
        key: p.name,
        label: meta.label,
        kind: p.instrument_kind === "option" ? "Options" : "Stocks",
        retired: !!p.retired,
        color: meta.color,
        capital: 20_000,
        returnPct: p.return_pct,
        value: p.total_value,
        open: p.open_positions,
        history: dailyPoints(historyData[i] ?? []),
        note: meta.note,
        href: `/books/traderjoe?book=${p.name}`,
      };
    });
    if (flowSummary.data) {
      list.push({
        key: FLOW_TRADER,
        label: "Flow Trader",
        kind: "Options",
        retired: false,
        color: "var(--series-7)",
        capital: 10_000,
        returnPct: flowSummary.data.return_pct,
        value: flowSummary.data.total_value,
        open: flowSummary.data.open_positions,
        // The API lists newest first; reverse so the day's final snapshot wins.
        history: dailyPoints([...(flowHistory.data ?? [])].reverse()),
        note: "Corrected Nov 1. Older fills paid no spread",
        href: "/books/flow-trader",
      });
    }
    return list;
    // historyData is a new array each render; its members are the stable query results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, flowSummary.data, flowHistory.data, ...historyData]);
  return { books, isLoading: personas.isLoading };
}

function ChartTooltip({ active, payload, label, names }: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
  names: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const rows = new Map(payload.filter((row) => names[row.dataKey]).map((row) => [row.dataKey, row]));
  return (
    <div className="chart-tooltip">
      <div className="mb-1 text-xs text-text-muted">{label}</div>
      {[...rows.values()].sort((a, b) => b.value - a.value).map((row) => (
        <div key={row.dataKey} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-text-secondary">{names[row.dataKey]}</span>
          <span className="num text-text-primary">{signed(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Drawdown read like a fuel gauge: lit ticks are the worst loss so far, the marker is SPY's. */
function DrawdownArc({ worst, spyWorst }: { worst: number; spyWorst: number | null }) {
  const lit = Math.round((Math.min(Math.abs(worst), ARC_MAX_DRAWDOWN) / ARC_MAX_DRAWDOWN) * (ARC_TICKS - 1));
  const spyTick = spyWorst == null ? null : Math.round((Math.min(Math.abs(spyWorst), ARC_MAX_DRAWDOWN) / ARC_MAX_DRAWDOWN) * (ARC_TICKS - 1));
  return (
    <svg viewBox="0 0 200 112" className="block w-full max-w-64 self-center" role="img" aria-label={`Worst drawdown ${worst.toFixed(1)} percent${spyWorst == null ? "" : `, SPY ${spyWorst.toFixed(1)} percent`}, gauge full at ${ARC_MAX_DRAWDOWN} percent`}>
      {Array.from({ length: ARC_TICKS }, (_, i) => {
        const angle = Math.PI * (1 - i / (ARC_TICKS - 1));
        const marker = i === spyTick;
        const inner = marker ? 66 : 76;
        return (
          <line
            key={i}
            x1={100 + inner * Math.cos(angle)}
            y1={104 - inner * Math.sin(angle)}
            x2={100 + 92 * Math.cos(angle)}
            y2={104 - 92 * Math.sin(angle)}
            stroke={marker ? "var(--text-primary)" : i <= lit ? "var(--accent-red)" : "var(--track)"}
            strokeWidth={marker ? 2.5 : 2}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

interface BookDetail {
  cash: number;
  total_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  positions: { ticker: string; current_value: number; last_marked_at?: string }[];
}

function bookDetailQuery(key: string) {
  return {
    queryKey: ["book-detail", key],
    queryFn: () =>
      apiClient.get<BookDetail>(key === FLOW_TRADER ? "/flow-paper/summary" : `/smart-trader/summary?persona=${key}`).then((r) => r.data),
    staleTime: 60_000,
  };
}

/** Positions whose last price is too old to trust, and how old the oldest one is. */
function staleMarks(detail?: BookDetail) {
  const cutoff = Date.now() - STALE_MARK_DAYS * 86_400_000;
  const stale = (detail?.positions ?? []).map((p) => p.last_marked_at).filter((at): at is string => !!at && new Date(at).getTime() < cutoff).sort();
  return { count: stale.length, oldest: stale[0]?.slice(0, 10) };
}

/** Where the book's money sits right now, and how much of its result is banked. */
function CapitalTile({ book }: { book: Book }) {
  const { data } = useQuery(bookDetailQuery(book.key));
  if (!data) return <div className="skeleton min-h-52 flex-1" aria-busy="true" />;
  const held = [...data.positions].sort((a, b) => b.current_value - a.current_value);
  const shown = held.slice(0, 5);
  const rest = held.slice(5).reduce((total, position) => total + position.current_value, 0);
  const total = data.total_value || 1;
  const parts = [
    ...shown.map((position) => ({ key: position.ticker, value: position.current_value })),
    ...(rest > 0 ? [{ key: `${held.length - 5} more`, value: rest }] : []),
    { key: "Cash", value: data.cash },
  ].filter((part) => part.value > 0);
  const biggest = Math.max(Math.abs(data.realized_pnl), Math.abs(data.unrealized_pnl), 1);
  const marks = staleMarks(data);
  const shade = (part: { key: string }, index: number) => ({
    opacity: part.key === "Cash" ? undefined : 1 - index * 0.12,
    background: part.key === "Cash" ? "var(--track)" : book.color,
  });
  return (
    <Tile title="Capital" meta={`${Math.round((1 - data.cash / total) * 100)}% invested`} className="flex-1" bodyClassName="!gap-3">
      <div className="alloc-bar" role="img" aria-label={parts.map((part) => `${part.key} ${Math.round((part.value / total) * 100)} percent`).join(", ")}>
        {parts.map((part, index) => (
          <span
            key={part.key}
            title={`${part.key}: $${Math.round(part.value).toLocaleString()}`}
            style={{ flexGrow: part.value, ...shade(part, index) }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {parts.map((part, index) => (
          <div key={part.key} className="flex min-w-0 items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={shade(part, index)} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium text-text-secondary">{part.key}</span>
            <span className="num text-text-muted">{Math.round((part.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <BarRow labelWidth="5.5rem" label={<span className="font-sans font-medium">Realized</span>} value={data.realized_pnl} max={biggest} diverging display={dollars(data.realized_pnl)} />
        <BarRow labelWidth="5.5rem" label={<span className="font-sans font-medium">Unrealized</span>} value={data.unrealized_pnl} max={biggest} diverging display={dollars(data.unrealized_pnl)} />
      </div>
      {marks.count > 0 && (
        <p className="m-0 text-xs" style={{ color: "var(--accent-orange)" }}>
          {marks.count} of {data.positions.length} positions were last priced {marks.oldest && shortDate(marks.oldest)}, so unrealized P&L and value are out of date.
        </p>
      )}
    </Tile>
  );
}

/** One line per book, one cell per day: did the books lose together, or separately? */
function BookMatrix({ books, selected, onSelect, span }: { books: Book[]; selected: string; onSelect: (key: string) => void; span: 8 | 12 }) {
  const [hover, setHover] = useState<string | null>(null);
  const days = useMemo(
    () => [...new Set(books.flatMap((book) => book.history.slice(1).map((p) => p.date)))].sort().slice(-MATRIX_DAYS),
    [books],
  );
  const changes = useMemo(
    () => new Map(books.map((book) => [book.key, new Map(dailyChanges(book).map((change) => [change.date, change]))])),
    [books],
  );
  if (!days.length) return null;
  return (
    <Tile span={span} title="Every book, every day" meta={hover ?? `last ${days.length} sessions · gray is no change, usually no fresh price`}>
      <div className="flex flex-col gap-1" onPointerLeave={() => setHover(null)}>
        {books.map((book) => (
          <button
            key={book.key}
            type="button"
            className="matrix-row"
            aria-pressed={book.key === selected}
            aria-label={`Show ${book.label}`}
            onClick={() => onSelect(book.key)}
          >
            <span className="truncate text-xs font-medium text-text-secondary">{book.label}</span>
            <span className="matrix-row__cells" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((day) => {
                const change = changes.get(book.key)?.get(day);
                return (
                  <i
                    key={day}
                    data-tone={change ? changeTone(change.pct) : undefined}
                    onPointerEnter={() => setHover(`${book.label} · ${shortDate(day)} · ${change ? `${signed(change.pct, 2)} · ${dollars(change.dollars)}` : "not running"}`)}
                  />
                );
              })}
            </span>
          </button>
        ))}
        <div className="matrix-row__axis text-xs text-text-muted">
          <span>{shortDate(days[0])}</span>
          <span>{shortDate(days[days.length - 1])}</span>
        </div>
      </div>
    </Tile>
  );
}

/** The one loud card on the page, and only while something is actually pending. */
function NextOpenCard({ books }: { books: Book[] }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const left = minutesToOpen(now);
  return (
    <section className="accent-card lg:col-span-4">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[0.9375rem] font-semibold">Starting at the next open</h2>
        <span className="num text-xs">9:30 ET</span>
      </header>
      <p className="num m-0 text-4xl font-medium tracking-tight">
        {left >= 1440 && `${Math.floor(left / 1440)}d `}
        {Math.floor((left % 1440) / 60)}h {String(left % 60).padStart(2, "0")}m
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
        {books.map((book) => (
          <li key={book.key} className="flex min-w-0 justify-between gap-3">
            <span className="font-semibold">{book.label}</span>
            <span className="truncate text-right">{book.note ?? book.kind}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every paper book against SPY on one page. The honest answer to "how are they doing":
 *  no model scores, no alpha claims, just return, risk and the benchmark. */
export function BooksScoreboard() {
  const { books, isLoading } = useBooks();
  const { data: spyRows } = useMarketHistory("SPY", 400);
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>("3M");
  const [showRetired, setShowRetired] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const spy = useMemo(
    () => (spyRows ?? []).map((row) => ({ date: String(row.date).slice(0, 10), value: Number(row.close) })).filter((row) => row.value > 0),
    [spyRows],
  );
  const lastSpy = spy[spy.length - 1]?.value;
  const spySince = (date?: string) => {
    if (!date || !lastSpy) return null;
    const start = spy.find((row) => row.date >= date);
    return start ? (lastSpy / start.value - 1) * 100 : null;
  };

  const started = (b: Book) => b.history.length >= 2;
  const rows = useMemo(() => {
    const scored = books.map((book) => {
      const spyReturn = spySince(book.history[0]?.date);
      return { book, drawdown: maxDrawdown(book), vsSpy: started(book) && spyReturn != null ? book.returnPct - spyReturn : null, spyReturn };
    });
    // Flow Trader goes last among running books: its older fills paid no spread, so its rank would flatter it.
    return scored.sort(
      (a, b) =>
        Number(started(b.book)) - Number(started(a.book)) ||
        Number(a.book.key === FLOW_TRADER) - Number(b.book.key === FLOW_TRADER) ||
        b.book.returnPct - a.book.returnPct,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books, spy]);
  const active = rows.filter((r) => !r.book.retired);
  const retired = rows.filter((r) => r.book.retired);
  const running = active.filter((r) => r.vsSpy != null);
  const pending = active.filter((r) => !started(r.book)).map((r) => r.book);
  const comparable = running.filter((r) => r.book.key !== FLOW_TRADER);
  const ahead = comparable.filter((r) => (r.vsSpy ?? 0) > 0).length;
  const details = useQueries({ queries: running.map((r) => bookDetailQuery(r.book.key)) });
  const staleByBook = new Map(running.map((r, i) => [r.book.key, staleMarks(details[i]?.data)]));
  const staleCount = comparable.filter((r) => (staleByBook.get(r.book.key)?.count ?? 0) > 0).length;

  const current = running.find((r) => r.book.key === picked) ?? running[0];
  const selected = current?.book;

  const charted = useMemo(() => running.map((r) => r.book), [running]);
  const chart = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days ?? 0;
    const today = spy[spy.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
    const bookStart = selected?.history[0]?.date ?? today;
    const windowStart = days
      ? new Date(new Date(`${today}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10)
      : bookStart;
    // Everything starts at 0 on the same day, or "vs SPY" would compare different windows.
    const start = windowStart < bookStart ? bookStart : windowStart;
    const dates = new Set(spy.filter((row) => row.date >= start).map((row) => row.date));
    const series: Record<string, Record<string, number>> = {};
    for (const book of charted) {
      const inRange = book.history.filter((p) => p.date >= start);
      if (!inRange.length) continue;
      // From its own start a book is measured from capital, matching the table. Mid-life, from the range start.
      const base = book.history[0].date >= start ? book.capital : inRange[0].value;
      series[book.key] = Object.fromEntries(inRange.map((p) => [p.date, (p.value / base - 1) * 100]));
      inRange.forEach((p) => dates.add(p.date));
    }
    const spyStart = spy.find((row) => row.date >= start)?.value;
    const spyByDate = Object.fromEntries(spy.map((row) => [row.date, row.value]));
    return [...dates].sort().map((date) => ({
      date,
      ...(spyStart && spyByDate[date] ? { SPY: (spyByDate[date] / spyStart - 1) * 100 } : {}),
      ...Object.fromEntries(Object.entries(series).flatMap(([key, values]) => (values[date] != null ? [[key, values[date]]] : []))),
    })) as ({ date: string; SPY?: number } & Record<string, number | string | undefined>)[];
  }, [charted, spy, range, selected]);

  const firstCharted = selected ? chart.find((row) => row[selected.key] != null)?.date : undefined;
  const pnlBars = useMemo(() => {
    if (!selected) return [];
    return dailyChanges(selected)
      .filter((change) => !firstCharted || change.date >= firstCharted)
      .map((change) => ({
        key: change.date,
        label: shortDate(change.date),
        up: Math.max(change.dollars, 0),
        down: Math.max(-change.dollars, 0),
      }));
  }, [selected, firstCharted]);
  const bestDay = pnlBars.reduce((best, bar) => Math.max(best, bar.up), 0);
  const worstDay = pnlBars.reduce((worst, bar) => Math.max(worst, bar.down), 0);
  const upDays = pnlBars.filter((bar) => bar.up > 0).length;
  const downDays = pnlBars.filter((bar) => bar.down > 0).length;
  const flatDays = pnlBars.length - upDays - downDays;

  const spyWorst = useMemo(() => {
    const start = selected?.history[0]?.date;
    let peak = 0;
    let worst = 0;
    for (const row of spy) {
      if (!start || row.date < start) continue;
      peak = Math.max(peak, row.value);
      worst = Math.min(worst, (row.value / peak - 1) * 100);
    }
    return start ? worst : null;
  }, [spy, selected]);

  if (isLoading) {
    return (
      <TileGrid>
        <div className="skeleton h-24 lg:col-span-12" aria-busy="true" />
        <div className="skeleton h-[30rem] lg:col-span-8" aria-busy="true" />
        <div className="skeleton h-[30rem] lg:col-span-4" aria-busy="true" />
      </TileGrid>
    );
  }

  const tableRows = showRetired ? [...active, ...retired] : active;
  const tabSub = (book: Book, vsSpy: number | null) => {
    if (book.key === FLOW_TRADER) return "Not comparable: older fills paid no spread";
    const stale = staleByBook.get(book.key)?.count ?? 0;
    const spread = vsSpy == null ? "" : `${signed(vsSpy)} vs SPY · `;
    return stale ? (
      <>{spread}<span style={{ color: "var(--accent-orange)" }}>{stale} of {book.open} prices stale</span></>
    ) : `${spread}${book.open} open`;
  };
  const lastSpyRow = [...chart].reverse().find((row) => row.SPY != null);
  const lastSelected = selected ? [...chart].reverse().find((row) => row[selected.key] != null) : undefined;
  const selectedInRange = selected && lastSelected ? (lastSelected[selected.key] as number) : null;
  const spyInRange = lastSpyRow?.SPY ?? null;
  const spread = selectedInRange != null && spyInRange != null ? selectedInRange - spyInRange : null;
  const names = selected ? { [selected.key]: selected.label, SPY: "SPY" } : { SPY: "SPY" };

  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <div>
        <p className="m-0 text-xl font-semibold text-text-primary">
          {comparable.length ? `${ahead} of ${comparable.length} books ahead of SPY` : "No books running yet"}
        </p>
        <p className="m-0 mt-1 max-w-[70ch] text-sm text-text-muted">
          Paper results with modeled fills. Walk-forward testing found no flow signal with a proven edge, so read these
          as risk and tracking, not evidence of skill. Flow Trader isn't counted: its older fills paid no spread.
          {staleCount > 0 && <span style={{ color: "var(--accent-orange)" }}> {staleCount} of {comparable.length} {staleCount === 1 ? "has" : "have"} out-of-date prices, so this count may change.</span>}
        </p>
      </div>

      {current && selected && (
        <>
          <KpiTabs
            ariaLabel="Choose a book"
            value={selected.key}
            onChange={setPicked}
            options={running.map(({ book, vsSpy }) => ({
              key: book.key,
              label: book.label,
              dot: book.color,
              value: signed(book.returnPct),
              sub: tabSub(book, vsSpy),
              title: book.note,
            }))}
          />

          <TileGrid>
            <Tile
              span={8}
              bodyClassName="!gap-3"
              title={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected.color }} aria-hidden="true" />
                  <a
                    href={selected.href}
                    className="truncate text-text-primary no-underline hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(selected.href);
                    }}
                  >
                    {selected.label}
                  </a>
                  <span className="text-xs font-normal text-text-muted max-sm:hidden">{selected.note ?? selected.kind}</span>
                </span>
              }
              actions={<Segmented<RangeKey> ariaLabel="Chart range" options={RANGES.map(({ value, label }) => ({ value, label }))} value={range} onChange={setRange} />}
            >
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num text-4xl font-medium tracking-tight text-text-primary">${Math.round(selected.value).toLocaleString()}</span>
                  {spread != null && (
                    <span className="spread-chip num" data-tone={changeTone(spread)}>{signed(spread)} vs SPY · {firstCharted === selected.history[0]?.date ? "since start" : range}</span>
                  )}
                </div>
                <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-text-secondary">
                  <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: selected.color }} aria-hidden="true" />{selected.label} <span className="num">{selectedInRange == null ? "" : signed(selectedInRange)}</span></li>
                  <li className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: SPY_COLOR }} aria-hidden="true" />SPY <span className="num">{spyInRange == null ? "" : signed(spyInRange)}</span></li>
                  <li className="flex items-center gap-1.5"><span className="h-px w-4" style={{ background: "var(--text-muted)" }} aria-hidden="true" />Other books</li>
                </ul>
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="book-area" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={selected.color} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={selected.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={48} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis width={44} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fill: "var(--text-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={0} stroke="var(--control-boundary)" />
                    <Tooltip cursor={{ stroke: "var(--control-boundary)" }} content={<ChartTooltip names={names} />} isAnimationActive={false} />
                    {/* Flow Trader's scale would flatten every other line, so it only draws when it's the one picked. */}
                    {charted.filter((book) => book.key !== selected.key && book.key !== FLOW_TRADER).map((book) => (
                      <Line key={book.key} dataKey={book.key} stroke="var(--text-muted)" strokeWidth={1} strokeOpacity={0.45} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
                    ))}
                    <Line dataKey="SPY" stroke={SPY_COLOR} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--bg-card)" }} connectNulls isAnimationActive={false} />
                    <Area dataKey={selected.key} stroke={selected.color} strokeWidth={2.5} fill="url(#book-area)" baseValue={0} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg-card)" }} connectNulls isAnimationActive={false} />
                    {lastSelected && selectedInRange != null && (
                      <ReferenceDot x={lastSelected.date} y={selectedInRange} r={4} fill={selected.color} stroke="var(--bg-card)" strokeWidth={2} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {pnlBars.length > 0 && (
                <div className="border-t border-border pt-3">
                  <DivergingStrip
                    ariaLabel={`${selected.label} daily profit and loss. ${upDays} up days, ${downDays} down days.`}
                    summary={`Daily P&L · best ${dollars(bestDay)} · worst ${dollars(-worstDay)} · ${upDays} up, ${downDays} down${flatDays ? `, ${flatDays} unchanged` : ""}`}
                    describe={(bar) => `${bar.label} · ${dollars(bar.up - bar.down)}`}
                    bars={pnlBars}
                    axis={[pnlBars[0].label, pnlBars[Math.floor(pnlBars.length / 2)].label, pnlBars[pnlBars.length - 1].label]}
                  />
                </div>
              )}
            </Tile>

            <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-4">
              <Tile title="Drawdown" meta="peak to trough, since it started" bodyClassName="!gap-1">
                <div className="relative flex flex-col">
                  <DrawdownArc worst={current.drawdown} spyWorst={spyWorst} />
                  <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                    <span className="num text-3xl font-medium tracking-tight text-text-primary">{current.drawdown.toFixed(1)}%</span>
                    <span className="text-xs text-text-muted">worst</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
                  <div className="flex justify-between gap-2"><span className="text-text-secondary">Today</span><span className="num text-text-primary">{currentDrawdown(selected).toFixed(1)}%</span></div>
                  <div className="flex justify-between gap-2"><span className="flex items-center gap-1.5 text-text-secondary"><span className="h-3 w-0.5 rounded-full bg-text-primary" aria-hidden="true" />SPY worst</span><span className="num text-text-primary">{spyWorst == null ? "—" : `${spyWorst.toFixed(1)}%`}</span></div>
                </div>
              </Tile>
              <CapitalTile key={selected.key} book={selected} />
            </div>

            <BookMatrix books={charted} selected={selected.key} onSelect={setPicked} span={pending.length ? 8 : 12} />
            {pending.length > 0 && <NextOpenCard books={pending} />}
          </TileGrid>
        </>
      )}

      <TileGrid>
        {!current && pending.length > 0 && <NextOpenCard books={pending} />}
        <Tile span={12} title="All books" actions={retired.length > 0 ? (
          <button type="button" className="text-xs text-text-secondary hover:text-text-primary" aria-expanded={showRetired} onClick={() => setShowRetired((v) => !v)}>
            {showRetired ? "Hide" : "Show"} {retired.length} retired
          </button>
        ) : undefined}>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-0 border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted">
                  <th scope="col" className="px-1 py-1.5 font-medium">Book</th>
                  <th scope="col" className="px-1 py-1.5 text-right font-medium">Return</th>
                  <th scope="col" className="px-1 py-1.5 text-right font-medium">vs SPY</th>
                  <th scope="col" className="px-1 py-1.5 text-right font-medium max-md:hidden">Max drawdown</th>
                  <th scope="col" className="px-2 py-1.5 font-medium max-md:hidden">Trend</th>
                  <th scope="col" className="px-1 py-1.5 text-right font-medium max-sm:hidden">Open</th>
                  <th scope="col" className="px-1 py-1.5 text-right font-medium max-sm:hidden">Value</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ book, vsSpy, drawdown }) => {
                  const live = started(book);
                  return (
                    <tr
                      key={book.key}
                      className="data-row cursor-pointer border-t border-border"
                      onClick={() => navigate(book.href)}
                    >
                      <td className="px-1 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: book.color }} aria-hidden="true" />
                          <a
                            href={book.href}
                            className="font-medium text-text-primary no-underline hover:underline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigate(book.href);
                            }}
                          >
                            {book.label}
                          </a>
                          <span className="text-xs text-text-muted max-sm:hidden">
                            {book.kind}
                            {book.retired ? " · Retired, running off" : book.note ? ` · ${book.note}` : ""}
                          </span>
                        </div>
                      </td>
                      {live ? (
                        <>
                          <td className="num px-1 py-2 text-right font-medium" style={{ color: toneColor(book.returnPct) }}>{signed(book.returnPct)}</td>
                          <td className="num px-1 py-2 text-right" style={{ color: vsSpy == null ? undefined : toneColor(vsSpy) }}>{vsSpy == null ? "—" : signed(vsSpy)}</td>
                          <td className="num px-1 py-2 text-right text-text-secondary max-md:hidden">{drawdown.toFixed(1)}%</td>
                          <td className="px-2 py-1 max-md:hidden">
                            <SparklineChart data={book.history.map((p) => p.value)} width={96} height={24} color="var(--text-secondary)" />
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="px-1 py-2 text-right text-xs text-text-muted">Not started. First trades after the next open</td>
                      )}
                      <td className="num px-1 py-2 text-right text-text-secondary max-sm:hidden">{book.open}</td>
                      <td className="num px-1 py-2 text-right text-text-secondary max-sm:hidden">${Math.round(book.value).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tile>
      </TileGrid>
    </div>
  );
}
