/**
 * NewsTab — chronological feed of tagged breaking-news headlines.
 *
 * Per-message LLM does ONE thing: bullish/bearish/neutral + signed score.
 * No rewrites. No window summaries. The visual signal is the density of
 * green vs red row tints over time — high-confidence rows are more
 * saturated, neutral rows are transparent. Reading the column of colors
 * top-down tells you market direction faster than any text summary.
 */
import { useId, useMemo, useState } from "react";
import { Filter, X, Clock } from "lucide-react";
import { Chip, Segmented } from "../../components/Glass";
import { BarRow, HeatTile, KpiTile, Tile, TileGrid } from "../../components/Cockpit";
import { QueryNotice } from "../../components/QueryNotice";
import { parseLocalDate, daysFromToday } from "../../lib/dateOnly";
import { useAppStore } from "../../store/useAppStore";
import { relativeAge, absoluteAge } from "../../lib/utils";
import {
  useNewsFeed,
  useNewsByTicker,
  useNewsStats,
  type NewsItem,
  type NewsSentiment,
} from "../../api/news";

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function sentimentColor(s: NewsSentiment): string {
  switch (s) {
    case "bullish":
      return "var(--accent-green)";
    case "bearish":
      return "var(--accent-red)";
    case "neutral":
      return "var(--text-muted)";
    default:
      return "var(--text-muted)";
  }
}

// Row tint alpha = |sentiment_score| × 0.32, capped at 0.35.
// → score 0 (neutral) renders transparent
// → score ±0.3 (routine) → ~0.10 alpha
// → score ±0.7 (material) → ~0.22 alpha
// → score ±1.0 (shock)   → ~0.32 alpha
// Effect: a column of strong-bull headlines forms a saturated green stripe;
// noise neutrals fade out; the column read IS the market signal.
function confidenceAlpha(score: number | null | undefined): number {
  if (score === null || score === undefined) return 0;
  return Math.min(0.35, Math.abs(score) * 0.32);
}

function sentimentBgColor(s: NewsSentiment, alpha: number): string {
  if (alpha <= 0) return "transparent";
  const pct = Math.round(alpha * 100);
  switch (s) {
    case "bullish":
      return `color-mix(in srgb, var(--accent-green) ${pct}%, transparent)`;
    case "bearish":
      return `color-mix(in srgb, var(--accent-red) ${pct}%, transparent)`;
    default:
      return "transparent";
  }
}

function groupByDate(items: NewsItem[]): Array<{ date: string; rows: NewsItem[] }> {
  const map = new Map<string, NewsItem[]>();
  for (const it of items) {
    const day = it.posted_at.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(it);
  }
  return Array.from(map.entries()).map(([date, rows]) => ({ date, rows }));
}

function formatHeaderDate(iso: string): string {
  const d = parseLocalDate(iso);
  const diff = -daysFromToday(iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Sub-components ───────────────────────────────────────────

function NewsRow({ item }: { item: NewsItem }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const [expanded, setExpanded] = useState(false);
  const isAnalyzed = item.analysis_status === "done";
  const score = item.sentiment_score ?? 0;
  const sentColor = sentimentColor(item.sentiment);
  const rowAlpha = confidenceAlpha(item.sentiment_score);
  const detailsId = useId();
  const hasDetails = item.sentiment_score !== null || !!item.summary;
  return (
    <div
      className="grid cursor-pointer grid-cols-[2.75rem_minmax(0,1fr)_3rem] items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-bg-card-hover"
      style={{ background: sentimentBgColor(item.sentiment, rowAlpha * 0.5) }}
      onClick={() => setExpanded((v) => !v)}
    >
      <span className="num pt-0.5 text-xs text-text-muted" title={absoluteAge(item.posted_at)}>
        {item.posted_at.slice(11, 16)}
      </span>
      <div className="min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          aria-expanded={expanded}
          aria-controls={hasDetails ? detailsId : undefined}
          className="block w-full text-left text-sm font-medium leading-snug text-text-primary text-pretty"
        >
          {item.headline}
        </button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          {item.tickers.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={`Select ${t} ticker`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTicker(t);
              }}
              className="ticker rounded-md border border-border bg-bg-card px-1.5 py-0.5 text-xs transition-colors hover:border-accent hover:text-accent"
            >
              {t}
            </button>
          ))}
          {!isAnalyzed && (
            <span className="animate-pulse" title="awaiting LLM analysis">
              pending
            </span>
          )}
          <span>
            {item.author_username} · {relativeAge(item.posted_at)}
          </span>
        </div>
        {expanded && hasDetails && (
          <div id={detailsId} className="mt-2 space-y-1 text-xs text-text-muted">
            {item.summary && <p className="m-0 max-w-[72ch] text-sm leading-relaxed text-text-secondary">{item.summary}</p>}
            {item.sentiment_score !== null && (
              <div>
                Tagged by LLM · sentiment score <span className="num">{item.sentiment_score?.toFixed(2)}</span>
                {item.tickers.length > 0 && ` · ${item.tickers.length} ticker(s) extracted`}
              </div>
            )}
          </div>
        )}
      </div>
      <span
        className="num pt-0.5 text-right text-xs font-semibold"
        style={{ color: sentColor }}
        title={isAnalyzed && item.sentiment ? `${item.sentiment} · sentiment_score ${score.toFixed(2)} (row tint α=${rowAlpha.toFixed(2)})` : undefined}
      >
        {isAnalyzed && item.sentiment ? (Math.abs(score) > 0 ? `${score > 0 ? "+" : ""}${score.toFixed(1)}` : item.sentiment.slice(0, 4)) : ""}
      </span>
    </div>
  );
}

function StatsStrip({ items }: { items: NewsItem[] }) {
  const { data } = useNewsStats();
  const bull = items.filter((i) => i.sentiment === "bullish").length;
  const bear = items.filter((i) => i.sentiment === "bearish").length;
  const net = bull + bear > 0 ? ((bull - bear) / (bull + bear)) * 100 : null;
  return (
    <TileGrid>
      <KpiTile
        label="Headlines"
        value={data ? data.total_canonical.toLocaleString() : "—"}
        sub={data && data.duplicates > 0 ? `${data.duplicates} relay duplicates hidden` : "canonical, deduped"}
      />
      <KpiTile
        label="Tagged"
        value={data ? data.analyzed.toLocaleString() : "—"}
        sub={data && data.pending > 0 ? `${data.pending} pending` : "all analyzed"}
      />
      <KpiTile
        label="Tone in view"
        value={net == null ? "—" : `${net >= 0 ? "+" : ""}${net.toFixed(0)}`}
        delta={net == null ? undefined : net >= 0 ? "bull" : "bear"}
        tone={net == null ? "neutral" : net > 0 ? "up" : net < 0 ? "down" : "neutral"}
        sub={`${bull} bullish · ${bear} bearish`}
      />
      <KpiTile
        label="Latest"
        value={data?.latest_posted_at ? <span title={absoluteAge(data.latest_posted_at)}>{relativeAge(data.latest_posted_at)}</span> : "—"}
        sub={<span className="inline-flex items-center gap-1"><Clock size={11} /> newest headline</span>}
      />
    </TileGrid>
  );
}

// ── Main ─────────────────────────────────────────────────────

export function NewsTab() {
  const activeTicker = useAppStore((s) => s.activeTicker);
  const [windowDays, setWindowDays] = useState(1);
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);

  const feed = useNewsFeed(windowDays);
  const byTicker = useNewsByTicker(tickerFilter ?? "", 30);

  const items: NewsItem[] = useMemo(() => {
    if (tickerFilter) return byTicker.data?.items ?? [];
    return feed.data?.items ?? [];
  }, [tickerFilter, byTicker.data, feed.data]);

  const groups = useMemo(() => groupByDate(items), [items]);
  const isLoading = tickerFilter ? byTicker.isLoading : feed.isLoading;
  const active = tickerFilter ? byTicker : feed;

  // Pure derivations over the loaded items for the side tiles.
  const side = useMemo(() => {
    const counts = new Map<string, { n: number; net: number }>();
    let bull = 0;
    let bear = 0;
    let neutral = 0;
    for (const it of items) {
      if (it.sentiment === "bullish") bull += 1;
      else if (it.sentiment === "bearish") bear += 1;
      else neutral += 1;
      for (const t of it.tickers) {
        const c = counts.get(t) ?? { n: 0, net: 0 };
        c.n += 1;
        c.net += it.sentiment === "bullish" ? 1 : it.sentiment === "bearish" ? -1 : 0;
        counts.set(t, c);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    return { bull, bear, neutral, top, max: top[0]?.[1].n ?? 1 };
  }, [items]);

  const controls = tickerFilter ? (
    <Chip>
      <Filter size={11} />
      <span className="num font-semibold text-text-primary">{tickerFilter}</span>
      <button
        type="button"
        onClick={() => setTickerFilter(null)}
        aria-label={`Clear ${tickerFilter} ticker filter`}
        className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
        title="clear ticker filter"
      >
        <X size={11} />
      </button>
    </Chip>
  ) : (
    <>
      {activeTicker && (
        <button
          type="button"
          onClick={() => setTickerFilter(activeTicker)}
          className="text-xs text-text-muted hover:text-accent"
        >
          Filter to {activeTicker}
        </button>
      )}
      <Segmented
        ariaLabel="News window"
        value={String(windowDays)}
        onChange={(v) => setWindowDays(Number(v))}
        options={WINDOW_OPTIONS.map((opt) => ({
          value: String(opt.days),
          label: opt.label,
        }))}
      />
    </>
  );

  const total = side.bull + side.bear + side.neutral;

  return (
    <div className="space-y-6">
      <StatsStrip items={items} />

      <TileGrid>
        <Tile
          span={8}
          title={tickerFilter ? `Headlines mentioning ${tickerFilter}` : "Headlines"}
          meta={`${items.length} in view · row tint = sentiment strength, click for summary`}
          actions={controls}
        >
          <div className="-mx-1 overflow-y-auto px-1" style={{ maxHeight: "calc(100vh - 360px)", minHeight: 360 }}>
            <QueryNotice queries={[active]} label="News feed" />
            {isLoading ? (
              <div className="animate-pulse py-4 text-center text-sm text-text-muted">Loading...</div>
            ) : active.data?.ok === false ? (
              <p role="alert" className="callout my-4">News feed unavailable.</p>
            ) : items.length === 0 && !active.isError && active.fetchStatus !== "paused" ? (
              <div className="py-4 text-center text-sm text-text-muted">
                No news in this window
                {tickerFilter ? ` mentioning ${tickerFilter}` : ""}.
              </div>
            ) : (
              <div className="space-y-5">
                {groups.map((g) => (
                  <div key={g.date}>
                    <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-border bg-bg-card pb-1.5 pt-1">
                      <h3 className="m-0 text-sm font-semibold text-text-primary">{formatHeaderDate(g.date)}</h3>
                      <span className="num text-xs text-text-muted">{g.rows.length} headlines</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {g.rows.map((item) => (
                        <NewsRow key={item.msg_id} item={item} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tile>

        <div className="flex min-w-0 flex-col gap-3.5 lg:col-span-4">
          <Tile title="Tone" meta={`${total} headlines in view`}>
            <div className="grid grid-cols-2 gap-2">
              <HeatTile
                label="Bullish"
                value={side.bull}
                tone="up"
                intensity={total ? side.bull / total : 0}
                sub={total ? `${Math.round((side.bull / total) * 100)}% of view` : undefined}
              />
              <HeatTile
                label="Bearish"
                value={side.bear}
                tone="down"
                intensity={total ? side.bear / total : 0}
                sub={total ? `${Math.round((side.bear / total) * 100)}% of view` : undefined}
              />
            </div>
            <span className="text-xs text-text-muted">
              <span className="num">{side.neutral}</span> neutral or pending
            </span>
          </Tile>

          <Tile title="Most mentioned" meta="click to filter the feed">
            {side.top.length === 0 ? (
              <span className="text-xs text-text-muted">No tickers extracted in this view.</span>
            ) : (
              side.top.map(([t, c]) => (
                <BarRow
                  key={t}
                  label={t}
                  value={c.n}
                  max={side.max}
                  tone={c.net > 0 ? "up" : c.net < 0 ? "down" : "neutral"}
                  display={c.n}
                  title={`${t}: ${c.n} headlines, net ${c.net >= 0 ? "+" : ""}${c.net} bull minus bear`}
                  onClick={() => setTickerFilter(t)}
                />
              ))
            )}
          </Tile>
        </div>
      </TileGrid>
    </div>
  );
}
