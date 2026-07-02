/**
 * NewsTab — chronological feed of tagged breaking-news headlines.
 *
 * Per-message LLM does ONE thing: bullish/bearish/neutral + signed score.
 * No rewrites. No window summaries. The visual signal is the density of
 * green vs red row tints over time — high-confidence rows are more
 * saturated, neutral rows are transparent. Reading the column of colors
 * top-down tells you market direction faster than any text summary.
 */
import { useMemo, useState } from "react";
import { Filter, X, Globe, Clock } from "lucide-react";
import { Chip, Segmented } from "../../components/Glass";
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
  const d = new Date(iso + "T00:00:00Z");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((today.getTime() - d.getTime()) / dayMs);
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
  return (
    <div
      className="border-l-2 pl-3 py-1.5 transition-colors hover:bg-bg-card-hover/40 cursor-pointer rounded-r"
      style={{
        borderColor: sentColor,
        background: sentimentBgColor(item.sentiment, rowAlpha),
      }}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start gap-2 text-xs">
        <div className="flex flex-col items-center w-12 shrink-0">
          <span
            className="num text-text-muted"
            title={absoluteAge(item.posted_at)}
          >
            {item.posted_at.slice(11, 16)}
          </span>
          <span className="text-[10px] text-text-muted/70 mt-0.5">
            {relativeAge(item.posted_at)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {isAnalyzed && item.sentiment && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{
                  color: sentColor,
                  background: sentimentBgColor(item.sentiment, 0.18),
                }}
                title={`sentiment_score ${score.toFixed(2)} (row tint α=${rowAlpha.toFixed(2)})`}
              >
                {item.sentiment}
                {Math.abs(score) > 0 && (
                  <span className="ml-1 opacity-70">
                    {score > 0 ? "+" : ""}
                    {score.toFixed(1)}
                  </span>
                )}
              </span>
            )}
            {!isAnalyzed && (
              <span
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded text-text-muted bg-bg-card animate-pulse"
                title="awaiting LLM analysis"
              >
                pending
              </span>
            )}
            {item.tickers.map((t) => (
              <button
                key={t}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTicker(t);
                }}
                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors"
              >
                {t}
              </button>
            ))}
            <span className="text-[10px] text-text-muted/70 ml-auto">
              {item.author_username}
            </span>
          </div>
          <div className="text-text-primary leading-snug">{item.headline}</div>
          {expanded && item.sentiment_score !== null && (
            <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-text-muted/70 font-mono">
              tagged by LLM · sentiment_score {item.sentiment_score?.toFixed(2)}
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
          <span className="text-accent-orange num font-semibold">
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
        <div className="flex items-center gap-1.5 text-text-secondary">
          <Globe size={14} />
          <span className="text-xs font-semibold uppercase tracking-[0.08em]">News</span>
        </div>

        {tickerFilter ? (
          <Chip tone="blue">
            <Filter size={11} />
            <span className="font-mono font-bold">{tickerFilter}</span>
            <button
              onClick={() => setTickerFilter(null)}
              className="p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
              title="clear ticker filter"
            >
              <X size={11} />
            </button>
          </Chip>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs text-text-muted">
              <Filter size={12} />
              window
            </span>
            <Segmented
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
            onClick={() => setTickerFilter(activeTicker)}
            className="text-xs text-text-muted hover:text-accent-blue underline"
          >
            filter to {activeTicker}
          </button>
        )}

        <div className="ml-auto">
          <StatsStrip />
        </div>
      </div>

      {/* Feed */}
      <div className="card flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-text-muted animate-pulse py-4 text-center">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-text-muted py-4 text-center">
            No news in this window
            {tickerFilter ? ` mentioning ${tickerFilter}` : ""}.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.date}>
                <div
                  className="text-xs font-semibold text-accent-blue mb-1.5 sticky top-0 backdrop-blur py-1 rounded-md px-1 -mx-1"
                  style={{ background: "var(--glass-bg-strong)" }}
                >
                  {formatHeaderDate(g.date)}
                  <span className="ml-2 text-text-muted/70 font-normal num">
                    ({g.rows.length})
                  </span>
                </div>
                <div className="space-y-1">
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
