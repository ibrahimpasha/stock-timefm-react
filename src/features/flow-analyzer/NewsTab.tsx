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
  return (
    <div
      className="cursor-pointer px-2 py-2 transition-colors hover:bg-bg-card-hover"
      style={{ background: sentimentBgColor(item.sentiment, rowAlpha * 0.5) }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-3">
        <span
          className="num w-11 shrink-0 pt-0.5 text-xs text-text-muted"
          title={absoluteAge(item.posted_at)}
        >
          {item.posted_at.slice(11, 16)}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            aria-controls={item.sentiment_score !== null ? detailsId : undefined}
            className="block w-full max-w-[72ch] text-left text-sm leading-snug text-text-primary"
          >
            {item.headline}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-muted">
            {isAnalyzed && item.sentiment && (
              <span
                className="font-medium"
                style={{ color: sentColor }}
                title={`sentiment_score ${score.toFixed(2)} (row tint α=${rowAlpha.toFixed(2)})`}
              >
                {item.sentiment}
                {Math.abs(score) > 0 && (
                  <span className="num ml-1">
                    {score > 0 ? "+" : ""}
                    {score.toFixed(1)}
                  </span>
                )}
              </span>
            )}
            {!isAnalyzed && (
              <span className="animate-pulse" title="awaiting LLM analysis">
                pending
              </span>
            )}
            {item.tickers.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={`Select ${t} ticker`}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTicker(t);
                }}
                className="num font-semibold text-text-secondary hover:text-accent-blue transition-colors"
              >
                {t}
              </button>
            ))}
            <span>
              {item.author_username} · {relativeAge(item.posted_at)}
            </span>
          </div>
          {expanded && item.sentiment_score !== null && (
            <div id={detailsId} className="mt-1 text-xs text-text-muted">
              Tagged by LLM · sentiment score <span className="num">{item.sentiment_score?.toFixed(2)}</span>
              {item.tickers.length > 0 && ` · ${item.tickers.length} ticker(s) extracted`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsStrip() {
  const { data } = useNewsStats();
  if (!data) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-text-muted">
      <span>
        <span className="text-text-primary num font-semibold">
          {data.total_canonical}
        </span>{" "}
        items
      </span>
      <span>
        <span className="text-accent-green num font-semibold">
          {data.analyzed}
        </span>{" "}
        analyzed
      </span>
      {data.pending > 0 && (
        <span>
          <span className="text-text-primary num font-semibold">
            {data.pending}
          </span>{" "}
          pending
        </span>
      )}
      {data.duplicates > 0 && (
        <span title="Relay duplicates excluded by default">
          <span className="text-text-muted num">{data.duplicates}</span> dup
        </span>
      )}
      {data.latest_posted_at && (
        <span className="flex items-center gap-1" title={absoluteAge(data.latest_posted_at)}>
          <Clock size={11} />
          latest {relativeAge(data.latest_posted_at)}
        </span>
      )}
    </div>
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

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 220px)", minHeight: 420 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 pb-2">
        {tickerFilter ? (
          <Chip>
            <Filter size={11} />
            <span className="num font-semibold text-text-primary">{tickerFilter}</span>
            <button
              type="button"
              onClick={() => setTickerFilter(null)}
              aria-label={`Clear ${tickerFilter} ticker filter`}
              className="p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
              title="clear ticker filter"
            >
              <X size={11} />
            </button>
          </Chip>
        ) : (
          <div className="flex items-center gap-1.5">
            <Segmented
              ariaLabel="News window"
              value={String(windowDays)}
              onChange={(v) => setWindowDays(Number(v))}
              options={WINDOW_OPTIONS.map((opt) => ({
                value: String(opt.days),
                label: opt.label,
              }))}
            />
          </div>
        )}

        {!tickerFilter && activeTicker && (
          <button
            type="button"
            onClick={() => setTickerFilter(activeTicker)}
            className="text-xs text-text-muted hover:text-accent-blue"
          >
            Filter to {activeTicker}
          </button>
        )}

        <div className="ml-auto">
          <StatsStrip />
        </div>
      </div>

      {/* Feed */}
      <div className="card flex-1 overflow-y-auto">
        <QueryNotice queries={[tickerFilter ? byTicker : feed]} label="News feed" />
        {isLoading ? (
          <div className="text-sm text-text-muted animate-pulse py-4 text-center">Loading...</div>
        ) : (tickerFilter ? byTicker : feed).data?.ok === false ? <p role="alert" className="py-4 text-sm text-accent-orange">News feed unavailable.</p> : items.length === 0 && !(tickerFilter ? byTicker : feed).isError && (tickerFilter ? byTicker : feed).fetchStatus !== "paused" ? (
          <div className="text-sm text-text-muted py-4 text-center">
            No news in this window
            {tickerFilter ? ` mentioning ${tickerFilter}` : ""}.
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.date}>
                <div className="sticky top-0 z-10 bg-bg-card py-1.5 text-sm font-semibold text-text-primary">
                  {formatHeaderDate(g.date)}
                  <span className="ml-2 num text-xs font-normal text-text-muted">
                    {g.rows.length}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {g.rows.map((item) => (
                    <NewsRow key={item.msg_id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
