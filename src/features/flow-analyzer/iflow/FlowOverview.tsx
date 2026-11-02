import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "../../../api/client";
import type { Taxonomy } from "../../../api/taxonomy";
import { BarRow, Tile } from "../../../components/Cockpit";
import { DivergingStrip } from "../../../components/DivergingStrip";
import { KpiTabs } from "../../../components/KpiTabs";
import { STALE_TIMES } from "../../../lib/constants";
import { activeFlowInterval } from "../../../lib/liveFeeds";
import type { TrackedTicker } from "../../../lib/types";
import { formatPremium } from "../../../lib/utils";
import { FlowTreemap, type TreemapNode } from "./FlowTreemap";
import { sentenceCase } from "./ThemeSection";
import { parsePremium } from "./utils";

const TOP_TICKERS = 8;
const MAX_DRILL_TILES = 20;
/** Sectors under this share of the lens fold into one tile: unreadable as tiles of their own. */
const FOLD_SHARE = 0.025;
const FOLD_ID = "__other__";

type Lens = "all" | "bull" | "bear" | "other";
interface Sides { bull: number; bear: number; other: number }
interface SessionFlow {
  tickers: Record<string, Sides>;
  slots: ({ time: string } & Sides)[];
}

const sum = (sides: Sides) => sides.bull + sides.bear + sides.other;
const lensValue = (sides: Sides, lens: Lens) => (lens === "all" ? sum(sides) : sides[lens]);
const money = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : formatPremium(n));

/** Multi-date scopes have no per-print totals, so split premium by print counts. */
function estimatedSides(t: TrackedTicker): Sides {
  const total = t.total_premium ?? 0;
  const prints = t.bullish + t.bearish;
  return prints ? { bull: (total * t.bullish) / prints, bear: (total * t.bearish) / prints, other: 0 } : { bull: 0, bear: 0, other: total };
}

interface LatestPrint {
  id: string;
  ticker: string;
  type: string;
  strike: number | null;
  expiry: string | null;
  premium: string | null;
  action: string;
  side: string;
  ts: string | null;
  flow_time: string | null;
}

function printClock(print: LatestPrint) {
  if (print.ts) {
    const when = new Date(`${print.ts.replace(" ", "T")}Z`);
    if (!Number.isNaN(when.getTime())) {
      return when.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: false });
    }
  }
  return print.flow_time ?? "";
}

/** Newest prints first. A print that arrives on a later poll slides in and glows briefly;
 *  the first paint doesn't animate, so opening the page never looks like activity. */
function LatestPrints({ date, onPick }: { date: string; onPick: (ticker: string) => void }) {
  const { data, isLoading } = useQuery<{ prints: LatestPrint[] }>({
    queryKey: ["iflow", "latest", date],
    queryFn: () => apiClient.get(`/flow/iflow/latest?date=${date}&limit=12`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    refetchInterval: () => activeFlowInterval(date),
  });
  const settled = useRef(false);
  useEffect(() => {
    if (data) settled.current = true;
  }, [data]);
  const slideIn = useCallback((row: HTMLElement | null) => {
    if (!row || !settled.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    row.animate(
      [
        { opacity: 0, transform: "translateY(-8px)", backgroundColor: "color-mix(in srgb, var(--accent) 24%, transparent)" },
        { opacity: 1, transform: "none", backgroundColor: "transparent" },
      ],
      { duration: 1100, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, []);
  const prints = data?.prints ?? [];
  return (
    <Tile span={4} className="flow-overview-tile" title="Latest prints" meta={`${date.slice(5)} · newest first`} bodyClassName="!gap-0">
      {isLoading && <div className="skeleton h-64" aria-busy="true" />}
      {!isLoading && prints.length === 0 && <p className="m-0 text-sm text-text-muted">No prints captured for this session yet.</p>}
      {prints.map((print) => {
        const bull = print.side === "Bull";
        const known = print.side === "Bull" || print.side === "Bear";
        return (
          <button key={print.id} ref={slideIn} type="button" className="print-row" onClick={() => onPick(print.ticker)}>
            <span className="num text-xs text-text-muted">{printClock(print)}</span>
            <span className="ticker truncate">{print.ticker}</span>
            <span className="num min-w-0 truncate text-xs text-text-secondary">
              {print.action} {print.strike ?? ""}{print.type?.[0] ?? ""} {print.expiry?.slice(0, 5) ?? ""}
            </span>
            <span className="num text-right text-xs font-medium" style={{ color: known ? (bull ? "var(--accent-green)" : "var(--accent-red)") : undefined }}>
              {print.premium ? formatPremium(parsePremium(print.premium)) : "—"} {known ? print.side : ""}
            </span>
          </button>
        );
      })}
    </Tile>
  );
}

function clockLabel(time: string) {
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12}:${time.slice(3)} ${hour < 12 ? "AM" : "PM"}`;
}

/** Where the money went and when it printed, measured in premium. Ranks by size alone;
 *  no model score decides any of it. */
export function FlowOverview({
  tickers,
  taxonomy,
  latestDate,
  sessionDate,
  scope,
  onPick,
}: {
  tickers: TrackedTicker[];
  taxonomy?: Taxonomy;
  latestDate?: string;
  /** Set when the view is one session: unlocks real premium by side. */
  sessionDate?: string;
  scope: string;
  onPick: (ticker: string) => void;
}) {
  const [lens, setLens] = useState<Lens>("all");
  const [sector, setSector] = useState<string | null>(null);
  const { data: session } = useQuery<SessionFlow>({
    queryKey: ["iflow", "session", sessionDate],
    queryFn: () => apiClient.get(`/flow/iflow/session?date=${sessionDate}`).then((r) => r.data),
    enabled: !!sessionDate,
    staleTime: STALE_TIMES.flow,
    refetchInterval: () => (sessionDate ? activeFlowInterval(sessionDate) : false),
  });
  const exact = !!sessionDate && !!session;

  const rows = useMemo(
    () =>
      tickers.map((t) => ({
        ticker: t,
        sides: (exact ? session.tickers[t.ticker] : undefined) ?? estimatedSides(t),
        category: taxonomy?.ticker_lookup[t.ticker]?.category ?? "Unclassified",
      })),
    [tickers, taxonomy, session, exact],
  );
  const totals = useMemo(
    () => rows.reduce((all, { sides }) => ({ bull: all.bull + sides.bull, bear: all.bear + sides.bear, other: all.other + sides.other }), { bull: 0, bear: 0, other: 0 }),
    [rows],
  );
  const gross = sum(totals);
  const sidesTotal = totals.bull + totals.bear;
  const bullPct = sidesTotal ? Math.round((totals.bull / sidesTotal) * 100) : 0;

  const nodes = useMemo<TreemapNode[]>(() => {
    const tickerNodes = (list: typeof rows): TreemapNode[] =>
      list.map(({ ticker, sides }) => ({
        id: ticker.ticker,
        label: ticker.ticker,
        value: lensValue(sides, lens),
        bull: sides.bull,
        bear: sides.bear,
        other: sides.other,
        detail: `${ticker.total_entries} prints. Open analysis.`,
      })).sort((a, b) => b.value - a.value);
    if (sector && sector !== FOLD_ID) return tickerNodes(rows.filter((row) => row.category === sector)).slice(0, MAX_DRILL_TILES);

    const byCategory = new Map<string, typeof rows>();
    for (const row of rows) byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);
    const all = [...byCategory.entries()].map(([category, members]): TreemapNode => {
      const sides = members.reduce((total, { sides: m }) => ({ bull: total.bull + m.bull, bear: total.bear + m.bear, other: total.other + m.other }), { bull: 0, bear: 0, other: 0 });
      return {
        id: category,
        label: sentenceCase(category),
        value: lensValue(sides, lens),
        ...sides,
        detail: `${members.length} names. Open sector.`,
        names: tickerNodes(members).slice(0, 8).filter((node) => node.value > 0).map(({ label, value }) => ({ label, value })),
      };
    });
    const lensTotal = all.reduce((total, node) => total + node.value, 0);
    const small = all.filter((node) => node.value < lensTotal * FOLD_SHARE);
    if (sector === FOLD_ID) return small;
    if (small.length < 2) return all;
    const total = (key: "value" | "bull" | "bear" | "other") => small.reduce((running, node) => running + node[key], 0);
    return [
      ...all.filter((node) => node.value >= lensTotal * FOLD_SHARE),
      { id: FOLD_ID, label: `${small.length} small sectors`, value: total("value"), bull: total("bull"), bear: total("bear"), other: total("other"), detail: small.map((node) => node.label).join(", ") },
    ];
  }, [rows, lens, sector]);

  const top = useMemo(
    () => [...rows].sort((a, b) => sum(b.sides) - sum(a.sides)).slice(0, TOP_TICKERS),
    [rows],
  );
  const slots = session?.slots ?? [];
  const peak = slots.reduce<(typeof slots)[number] | null>((best, slot) => (!best || sum(slot) > sum(best) ? slot : best), null);
  const entries = tickers.reduce((total, t) => total + t.total_entries, 0);
  const estimate = exact ? "" : " · split estimated from print counts";

  return (
    <>
      <Tile
        span={8}
        className="flow-overview-tile"
        bodyClassName="flex-1 !gap-3"
        title={
          sector ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <button type="button" className="text-text-secondary hover:text-text-primary hover:underline" onClick={() => setSector(null)}>All sectors</button>
              <span className="text-text-muted" aria-hidden="true">/</span>
              <span className="truncate">{sector === FOLD_ID ? "Small sectors" : sentenceCase(sector)}</span>
            </span>
          ) : (
            "Where the money went"
          )
        }
        meta={`${scope}${estimate} · size is premium, color is the side it leans`}
      >
        <KpiTabs<Lens>
          ariaLabel="Size the map by"
          value={lens}
          onChange={setLens}
          options={[
            { key: "all", label: "All premium", value: money(gross), sub: `${tickers.length.toLocaleString()} tickers · ${entries.toLocaleString()} prints` },
            { key: "bull", label: "Bull", dot: "var(--accent-green)", value: money(totals.bull), delta: `${bullPct}%`, deltaColor: "var(--accent-green)", sub: "calls bought, puts sold", title: "Share of premium with a known side" },
            { key: "bear", label: "Bear", dot: "var(--accent-red)", value: money(totals.bear), delta: `${sidesTotal ? 100 - bullPct : 0}%`, deltaColor: "var(--accent-red)", sub: "puts bought, calls sold", title: "Share of premium with a known side" },
            ...(totals.other >= 1 ? [{ key: "other" as const, label: "Side unknown", dot: "var(--text-muted)", value: money(totals.other), delta: `${Math.round((totals.other / gross) * 100)}%`, deltaColor: "var(--text-muted)", sub: "print shows no buy or sell" }] : []),
          ]}
        />
        <FlowTreemap
          nodes={nodes}
          onPick={(id) => {
            if (sector && sector !== FOLD_ID) onPick(id);
            else setSector(id);
          }}
        />
      </Tile>
      {latestDate && <LatestPrints key={latestDate} date={latestDate} onPick={onPick} />}
      {slots.length > 0 && (
        <Tile span={8} className="flow-overview-tile" title="When it printed" meta="premium per half hour, New York time">
          <DivergingStrip
            height={176}
            ariaLabel={`Premium by half hour. Heaviest at ${peak ? clockLabel(peak.time) : "no time"}.`}
            summary={peak ? `Heaviest half hour ${clockLabel(peak.time)} · ${money(peak.bull)} bull · ${money(peak.bear)} bear` : ""}
            describe={(bar) => `${bar.label} · ${money(bar.up)} bull · ${money(bar.down)} bear`}
            bars={slots.map((slot) => ({ key: slot.time, label: clockLabel(slot.time), up: slot.bull, down: slot.bear }))}
            axis={[clockLabel(slots[0].time), clockLabel(slots[Math.floor(slots.length / 2)].time), clockLabel(slots[slots.length - 1].time)]}
          />
        </Tile>
      )}
      <Tile span={slots.length > 0 ? 4 : 12} className="flow-overview-tile" title="Largest flow" meta="premium · % bull · gray is mostly unknown side" bodyClassName="!gap-1">
        {top.map(({ ticker, sides }) => {
          const known = sides.bull + sides.bear;
          const unknown = sides.other > known;
          const bull = known ? Math.round((sides.bull / known) * 100) : 0;
          return (
            <BarRow
              key={ticker.ticker}
              label={ticker.ticker}
              value={sum(sides)}
              max={sum(top[0].sides)}
              display={money(sum(sides))}
              tone={sides.bull >= sides.bear ? "up" : "down"}
              fill={unknown ? "var(--text-muted)" : undefined}
              trailing={unknown ? "—" : `${bull}%`}
              onClick={() => onPick(ticker.ticker)}
              title={`${ticker.ticker}: ${ticker.total_entries} prints, ${money(sides.bull)} bull, ${money(sides.bear)} bear${sides.other >= 1 ? `, ${money(sides.other)} side unknown` : ""}`}
            />
          );
        })}
      </Tile>
    </>
  );
}
