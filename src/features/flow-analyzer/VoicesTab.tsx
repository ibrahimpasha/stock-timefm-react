/**
 * VoicesTab — feed of analyzed tweets from tracked X accounts ("voices").
 *
 * Sits inside CommandCenterPage as the 5th sub-tab (Flow Trader / iFlow Tracker
 * / Flow Intel / Flow Chat / Voices). Data flows in via the hooks in
 * `src/api/voices.ts`; LLM analysis happens server-side on a daily cron.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ voice selector | window | trending tickers + themes  │
 *   ├──────────────────────────┬───────────────────────────┤
 *   │ tweet feed (chrono)      │ selected tweet detail     │
 *   │ (left, scrolls indep.)   │ (right, scrolls indep.)   │
 *   └──────────────────────────┴───────────────────────────┘
 *
 * Filter sources:
 *   - "all"            → useVoicesFeed
 *   - {ticker:"NVDA"}  → useVoicesByTicker
 *   - {theme:"AI"}     → useVoicesByTheme
 */
import { useMemo, useState } from "react";
import {
  Heart,
  Repeat2,
  MessageSquare,
  ExternalLink,
  TrendingUp,
  Sparkles,
  X,
  Filter,
  Zap,
  Brain,
  List,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Chip, Segmented } from "../../components/Glass";
import { relativeAge, absoluteAge } from "../../lib/utils";
import {
  useVoicesByTheme,
  useVoicesByTicker,
  useVoicesFeed,
  useVoicesList,
  useVoicesStats,
  useVoicesTrending,
  type VoiceSentiment,
  type VoiceTweet,
} from "../../api/voices";
import { PatternsView } from "./voices/PatternsView";
import { SynthesisView } from "./voices/SynthesisView";
import { VoiceBriefPanel } from "./voices/VoiceBriefPanel";

// ── filter model ────────────────────────────────────────────

type ActiveFilter =
  | { kind: "all" }
  | { kind: "ticker"; value: string }
  | { kind: "theme"; value: string };

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

// ── sentiment color map (matches existing CSS vars) ─────────

function sentimentColor(s: VoiceSentiment): string {
  switch (s) {
    case "bullish":
      return "var(--accent-green)";
    case "bearish":
      return "var(--accent-red)";
    case "mixed":
      return "var(--accent-orange)";
    default:
      return "var(--text-muted)";
  }
}

function sentimentLabel(s: VoiceSentiment): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── small atoms ─────────────────────────────────────────────

function SentimentDot({ s, size = 8 }: { s: VoiceSentiment; size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: sentimentColor(s),
        flexShrink: 0,
      }}
    />
  );
}

function VoiceInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-xs font-bold shrink-0"
      style={{
        width: 24,
        height: 24,
        background: "color-mix(in srgb, var(--accent-purple) 14%, transparent)",
        color: "var(--accent-purple)",
      }}
    >
      {initials}
    </span>
  );
}

function TickerChip({
  ticker,
  sentiment,
  onClick,
  active,
}: {
  ticker: string;
  sentiment?: VoiceSentiment;
  onClick?: () => void;
  active?: boolean;
}) {
  const color = sentiment ? sentimentColor(sentiment) : "var(--accent-blue)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold transition-colors hover:brightness-110"
      style={{
        background: active ? color : `color-mix(in srgb, ${color} 14%, transparent)`,
        color: active ? "var(--bg-primary)" : color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {sentiment && <SentimentDot s={sentiment} size={6} />}
      {ticker}
    </button>
  );
}

function ThemeChip({
  label,
  kind,
  onClick,
  active,
}: {
  label: string;
  kind?: "sector" | "theme";
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:brightness-110"
      style={{
        background: active ? "var(--accent-purple)" : "var(--glass-bg)",
        color: active ? "var(--bg-primary)" : "var(--text-secondary)",
        border: `1px solid ${
          kind === "sector"
            ? "color-mix(in srgb, var(--accent-purple) 30%, transparent)"
            : "var(--border)"
        }`,
      }}
    >
      {label}
    </button>
  );
}

// ── header bar with voice + window + filter chip ────────────

function HeaderBar({
  voiceUsername,
  voices,
  onVoiceChange,
  windowDays,
  onWindowChange,
  activeFilter,
  onClearFilter,
  stats,
}: {
  voiceUsername: string | null;
  voices: { username: string; display_name: string }[];
  onVoiceChange: (u: string | null) => void;
  windowDays: number;
  onWindowChange: (d: number) => void;
  activeFilter: ActiveFilter;
  onClearFilter: () => void;
  stats: { total: number; analyzed: number; latest: string | null };
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap pb-2">
      {/* Voice selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-[0.08em] text-text-secondary font-semibold">Voice</span>
        <select
          value={voiceUsername ?? ""}
          onChange={(e) => onVoiceChange(e.target.value || null)}
          className="border border-border px-2 py-1 text-xs text-text-primary font-mono"
          style={{ borderRadius: "var(--radius-control)", background: "var(--glass-bg)" }}
        >
          <option value="">All voices</option>
          {voices.map((v) => (
            <option key={v.username} value={v.username}>
              @{v.username}
            </option>
          ))}
        </select>
      </div>

      {/* Window selector */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs uppercase tracking-[0.08em] text-text-secondary font-semibold">Window</span>
        <Segmented
          value={String(windowDays)}
          onChange={(v) => onWindowChange(Number(v))}
          options={WINDOW_OPTIONS.map((w) => ({ value: String(w.days), label: w.label }))}
        />
      </div>

      {/* Active filter chip */}
      {activeFilter.kind !== "all" && (
        <Chip tone="blue">
          <Filter size={11} />
          <span>{activeFilter.kind === "ticker" ? "Ticker" : "Theme"}</span>
          <span className="font-mono font-semibold">{activeFilter.value}</span>
          <button
            type="button"
            onClick={onClearFilter}
            className="p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Clear filter"
          >
            <X size={11} />
          </button>
        </Chip>
      )}

      {/* Stats */}
      <div className="ml-auto flex items-center gap-3 text-xs text-text-muted">
        <span>
          <span className="num text-text-primary">{stats.analyzed}</span> analyzed
          {stats.total !== stats.analyzed && (
            <span className="ml-1 text-text-muted num">/ {stats.total} total</span>
          )}
        </span>
        {stats.latest && (
          <span title={absoluteAge(stats.latest) || ""}>
            latest {relativeAge(stats.latest)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── trending strip ──────────────────────────────────────────

function TrendingStrip({
  windowDays,
  voiceUsername,
  activeFilter,
  onPickTicker,
  onPickTheme,
}: {
  windowDays: number;
  voiceUsername: string | null;
  activeFilter: ActiveFilter;
  onPickTicker: (t: string) => void;
  onPickTheme: (t: string) => void;
}) {
  const { data } = useVoicesTrending(windowDays, 12, voiceUsername);
  const tickers = data?.tickers ?? [];
  const themes = data?.themes ?? [];
  if (!tickers.length && !themes.length) return null;
  const activeTicker = activeFilter.kind === "ticker" ? activeFilter.value : null;
  const activeTheme = activeFilter.kind === "theme" ? activeFilter.value : null;
  return (
    <div className="flex flex-col gap-1.5 py-2">
      {tickers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.08em] text-text-secondary font-semibold">
            <TrendingUp size={11} />
            Tickers
          </span>
          {tickers.map((t) => {
            const lean: VoiceSentiment =
              t.bullish > t.bearish ? "bullish" : t.bearish > t.bullish ? "bearish" : "neutral";
            return (
              <TickerChip
                key={t.ticker}
                ticker={`${t.ticker} ${t.mentions}`}
                sentiment={lean}
                active={activeTicker === t.ticker}
                onClick={() => onPickTicker(t.ticker)}
              />
            );
          })}
        </div>
      )}
      {themes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.08em] text-text-secondary font-semibold">
            <Sparkles size={11} />
            Themes
          </span>
          {themes.map((t) => (
            <ThemeChip
              key={`${t.kind}:${t.label}`}
              label={`${t.label} ${t.mentions}`}
              kind={t.kind}
              active={activeTheme === t.label}
              onClick={() => onPickTheme(t.label)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── one tweet row ───────────────────────────────────────────

function TweetRow({
  tweet,
  selected,
  onSelect,
  onPickTicker,
  onPickTheme,
}: {
  tweet: VoiceTweet;
  selected: boolean;
  onSelect: () => void;
  onPickTicker: (t: string) => void;
  onPickTheme: (t: string) => void;
}) {
  const xUrl = `https://x.com/${tweet.voice_username}/status/${tweet.tweet_id}`;
  const visibleText = tweet.text;
  const pending = tweet.analysis_status === "pending";
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer p-3 border-b border-border transition-colors ${
        selected ? "" : "hover:bg-bg-card-hover"
      }`}
      style={{
        background: selected
          ? "color-mix(in srgb, var(--accent-blue) 8%, transparent)"
          : undefined,
        borderLeft: selected
          ? "2px solid var(--accent-blue)"
          : "2px solid transparent",
      }}
    >
      <div className="flex items-start gap-2">
        <VoiceInitials name={tweet.voice_display_name || tweet.voice_username} />
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-text-primary truncate">
              {tweet.voice_display_name}
            </span>
            <span className="text-xs text-text-muted font-mono">
              @{tweet.voice_username}
            </span>
            <span
              className="text-xs text-text-muted"
              title={absoluteAge(tweet.posted_at) || ""}
            >
              · {relativeAge(tweet.posted_at)}
            </span>
            <span className="flex-1" />
            {pending && (
              <span className="text-[9px] uppercase text-text-muted">analyzing…</span>
            )}
            {!pending && (
              <SentimentDot s={tweet.overall_sentiment} />
            )}
            <a
              href={xUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-text-muted hover:text-text-primary"
              aria-label="Open on X"
            >
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Tweet text */}
          <div
            className="text-sm text-text-primary leading-snug whitespace-pre-wrap"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }}
          >
            {visibleText}
          </div>

          {/* Ticker chips */}
          {tweet.tickers.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {tweet.tickers.map((t) => (
                <TickerChip
                  key={t.ticker}
                  ticker={t.ticker}
                  sentiment={t.sentiment}
                  onClick={(e?: React.MouseEvent) => {
                    e?.stopPropagation?.();
                    onPickTicker(t.ticker);
                  }}
                />
              ))}
            </div>
          )}

          {/* Theme chips */}
          {(tweet.sectors.length > 0 || tweet.themes.length > 0) && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {tweet.sectors.map((s) => (
                <ThemeChip
                  key={`s:${s}`}
                  label={s}
                  kind="sector"
                  onClick={(e?: any) => {
                    e?.stopPropagation?.();
                    onPickTheme(s);
                  }}
                />
              ))}
              {tweet.themes.map((th) => (
                <ThemeChip
                  key={`t:${th}`}
                  label={th}
                  kind="theme"
                  onClick={(e?: any) => {
                    e?.stopPropagation?.();
                    onPickTheme(th);
                  }}
                />
              ))}
            </div>
          )}

          {/* Engagement */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted num">
            <span className="inline-flex items-center gap-1">
              <Heart size={10} /> {tweet.like_count.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <Repeat2 size={10} /> {tweet.retweet_count.toLocaleString()}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={10} /> {tweet.reply_count.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── detail panel ────────────────────────────────────────────

function TweetDetail({
  tweet,
  onPickTicker,
  onPickTheme,
}: {
  tweet: VoiceTweet | null;
  onPickTicker: (t: string) => void;
  onPickTheme: (t: string) => void;
}) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  if (!tweet) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-text-muted">
        Pick a tweet from the feed to see the full analysis.
      </div>
    );
  }
  const xUrl = `https://x.com/${tweet.voice_username}/status/${tweet.tweet_id}`;
  const pending = tweet.analysis_status === "pending";
  return (
    <div className="space-y-3 text-sm leading-snug">
      {/* Header */}
      <div className="flex items-start gap-2">
        <VoiceInitials name={tweet.voice_display_name || tweet.voice_username} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-primary">
              {tweet.voice_display_name}
            </span>
            <a
              href={`https://x.com/${tweet.voice_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-text-muted hover:text-accent-blue"
            >
              @{tweet.voice_username}
            </a>
          </div>
          <div
            className="text-xs text-text-muted"
            title={absoluteAge(tweet.posted_at) || ""}
          >
            {new Date(tweet.posted_at).toLocaleString()} · {relativeAge(tweet.posted_at)}
          </div>
        </div>
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border border-border text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors"
        >
          Open on X <ExternalLink size={11} />
        </a>
      </div>

      {/* Full text */}
      <div
        className="p-3 border border-border whitespace-pre-wrap text-text-primary"
        style={{ borderRadius: "var(--radius-control)", background: "var(--glass-bg)" }}
      >
        {tweet.text}
      </div>

      {pending && (
        <div className="text-xs text-text-muted italic">
          Analysis pending — will appear shortly after the next cron pass.
        </div>
      )}

      {/* Sentiment + summary */}
      {!pending && (
        <>
          <div className="flex items-center gap-2">
            <SentimentDot s={tweet.overall_sentiment} size={10} />
            <span className="text-xs uppercase text-text-muted">
              Overall sentiment
            </span>
            <span
              className="text-xs font-semibold"
              style={{ color: sentimentColor(tweet.overall_sentiment) }}
            >
              {sentimentLabel(tweet.overall_sentiment)}
            </span>
            {tweet.is_market_related === 0 && (
              <span className="text-xs uppercase text-text-muted ml-2 px-1 py-0.5 rounded border border-border">
                non-market
              </span>
            )}
          </div>

          {tweet.summary && (
            <div className="text-sm text-text-secondary italic border-l-2 border-accent-purple pl-3 leading-relaxed">
              {tweet.summary}
            </div>
          )}
        </>
      )}

      {/* Tickers with confidence */}
      {tweet.tickers.length > 0 && (
        <div>
          <div className="text-xs uppercase text-text-muted font-semibold mb-1.5">
            Tickers ({tweet.tickers.length})
          </div>
          <div className="space-y-1">
            {tweet.tickers.map((t) => (
              <div
                key={t.ticker}
                className="flex items-center gap-2 p-1.5 rounded hover:bg-bg-card-hover cursor-pointer"
                onClick={() => {
                  setActiveTicker(t.ticker);
                  onPickTicker(t.ticker);
                }}
              >
                <SentimentDot s={t.sentiment} />
                <span className="font-mono font-semibold text-xs text-text-primary w-16">
                  {t.ticker}
                </span>
                <span
                  className="text-xs font-semibold uppercase"
                  style={{ color: sentimentColor(t.sentiment) }}
                >
                  {t.sentiment}
                </span>
                <div className="flex-1 h-1 bg-bg-card rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(t.confidence * 100)}%`,
                      background: sentimentColor(t.sentiment),
                    }}
                  />
                </div>
                <span className="text-xs num text-text-muted w-8 text-right">
                  {Math.round(t.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sectors + themes */}
      {(tweet.sectors.length > 0 || tweet.themes.length > 0) && (
        <div>
          <div className="text-xs uppercase text-text-muted font-semibold mb-1.5">
            Tags
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {tweet.sectors.map((s) => (
              <ThemeChip key={`s:${s}`} label={s} kind="sector" onClick={() => onPickTheme(s)} />
            ))}
            {tweet.themes.map((th) => (
              <ThemeChip key={`t:${th}`} label={th} kind="theme" onClick={() => onPickTheme(th)} />
            ))}
          </div>
        </div>
      )}

      {/* Engagement */}
      <div className="flex items-center gap-4 pt-2 border-t border-border text-xs text-text-muted num">
        <span className="inline-flex items-center gap-1">
          <Heart size={12} /> {tweet.like_count.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Repeat2 size={12} /> {tweet.retweet_count.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={12} /> {tweet.reply_count.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          quotes {tweet.quote_count.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ── main component ──────────────────────────────────────────

type VoicesMode = "feed" | "patterns" | "synthesis";

const MODE_TABS: { id: VoicesMode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "feed", label: "Feed", icon: List, hint: "Chronological tweets with per-tweet analysis" },
  {
    id: "patterns",
    label: "Patterns",
    icon: Zap,
    hint: "Velocity + co-occurrence baskets (no LLM)",
  },
  {
    id: "synthesis",
    label: "Synthesis",
    icon: Brain,
    hint: "One LLM call distilling all tweets in the window",
  },
];

export function VoicesTab() {
  const { data: voices } = useVoicesList();
  const [voiceUsername, setVoiceUsername] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(7);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>({ kind: "all" });
  const [selectedTweetId, setSelectedTweetId] = useState<string | null>(null);
  const [mode, setMode] = useState<VoicesMode>("feed");
  const { data: stats } = useVoicesStats(voiceUsername);

  // Feed comes from one of three endpoints depending on filter mode.
  const feedAll = useVoicesFeed(voiceUsername, {
    limit: 100,
    marketOnly: true,
  });
  const feedByTicker = useVoicesByTicker(
    activeFilter.kind === "ticker" ? activeFilter.value : null,
    { days: windowDays, limit: 60 },
  );
  const feedByTheme = useVoicesByTheme(
    activeFilter.kind === "theme" ? activeFilter.value : null,
    { days: windowDays, limit: 60 },
  );

  const tweets: VoiceTweet[] = useMemo(() => {
    if (activeFilter.kind === "ticker") return feedByTicker.data?.tweets ?? [];
    if (activeFilter.kind === "theme") return feedByTheme.data?.tweets ?? [];
    return feedAll.data?.tweets ?? [];
  }, [activeFilter, feedAll.data, feedByTicker.data, feedByTheme.data]);

  const selectedTweet = useMemo(
    () => tweets.find((t) => t.tweet_id === selectedTweetId) ?? tweets[0] ?? null,
    [tweets, selectedTweetId],
  );

  const isLoading =
    activeFilter.kind === "ticker"
      ? feedByTicker.isLoading
      : activeFilter.kind === "theme"
        ? feedByTheme.isLoading
        : feedAll.isLoading;

  return (
    <div className="space-y-2">
      <HeaderBar
        voiceUsername={voiceUsername}
        voices={voices ?? []}
        onVoiceChange={setVoiceUsername}
        windowDays={windowDays}
        onWindowChange={setWindowDays}
        activeFilter={activeFilter}
        onClearFilter={() => setActiveFilter({ kind: "all" })}
        stats={{
          total: stats?.total_tweets ?? 0,
          analyzed: stats?.analyzed ?? 0,
          latest: stats?.latest_tweet_at ?? null,
        }}
      />

      {/* Mode switcher — Feed / Patterns / Synthesis */}
      <Segmented<VoicesMode>
        value={mode}
        onChange={setMode}
        options={MODE_TABS.map((m) => {
          const Icon = m.icon;
          return {
            value: m.id,
            label: (
              <span className="inline-flex items-center gap-1.5" title={m.hint}>
                <Icon size={11} />
                {m.label}
              </span>
            ),
          };
        })}
      />

      {mode === "feed" && (
        <>
          {/* Inline Voice Brief — collapsible synthesis panel for the
              currently-selected voice. Renders nothing when "All voices"
              is selected (synthesis is per-voice). Mirrors the Trader
              Brief panel on the Traders page. */}
          <VoiceBriefPanel voiceUsername={voiceUsername} />

          <TrendingStrip
            windowDays={windowDays}
            voiceUsername={voiceUsername}
            activeFilter={activeFilter}
            onPickTicker={(t) => {
              setActiveFilter({ kind: "ticker", value: t });
              setSelectedTweetId(null);
            }}
            onPickTheme={(t) => {
              setActiveFilter({ kind: "theme", value: t });
              setSelectedTweetId(null);
            }}
          />

          <div
            className="grid grid-cols-12 gap-3 items-start"
            style={{ height: "calc(100vh - 460px)", minHeight: 420 }}
          >
            {/* Feed */}
            <div className="card col-span-12 lg:col-span-7 h-full overflow-y-auto" style={{ padding: 0 }}>
              {isLoading && tweets.length === 0 ? (
                <div className="p-6 text-sm text-text-muted text-center">
                  Loading tweets…
                </div>
              ) : tweets.length === 0 ? (
                <div className="p-6 text-sm text-text-muted text-center">
                  {activeFilter.kind === "all"
                    ? "No tweets yet — try running the voices cron."
                    : `No tweets matching ${activeFilter.kind} = ${activeFilter.value}.`}
                </div>
              ) : (
                tweets.map((t) => (
                  <TweetRow
                    key={t.tweet_id}
                    tweet={t}
                    selected={selectedTweet?.tweet_id === t.tweet_id}
                    onSelect={() => setSelectedTweetId(t.tweet_id)}
                    onPickTicker={(tk) => {
                      setActiveFilter({ kind: "ticker", value: tk });
                      setSelectedTweetId(null);
                    }}
                    onPickTheme={(th) => {
                      setActiveFilter({ kind: "theme", value: th });
                      setSelectedTweetId(null);
                    }}
                  />
                ))
              )}
            </div>

            {/* Detail */}
            <div className="card col-span-12 lg:col-span-5 h-full overflow-y-auto">
              <TweetDetail
                tweet={selectedTweet}
                onPickTicker={(t) => {
                  setActiveFilter({ kind: "ticker", value: t });
                  setSelectedTweetId(null);
                }}
                onPickTheme={(t) => {
                  setActiveFilter({ kind: "theme", value: t });
                  setSelectedTweetId(null);
                }}
              />
            </div>
          </div>
        </>
      )}

      {mode === "patterns" && (
        <PatternsView
          windowDays={windowDays}
          onWindowChange={setWindowDays}
          voiceUsername={voiceUsername}
        />
      )}

      {mode === "synthesis" && (
        <SynthesisView
          voiceUsername={voiceUsername}
          windowDays={windowDays}
          onWindowChange={setWindowDays}
        />
      )}
    </div>
  );
}
