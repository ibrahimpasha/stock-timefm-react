/**
 * VoicesTab — feed of analyzed tweets from tracked X accounts ("voices").
 *
 * Sits inside CommandCenterPage as the 5th sub-tab (Flow Trader / iFlow Tracker
 * / Flow Intel / Flow Chat / Voices). Data flows in via the hooks in
 * `src/api/voices.ts`; LLM analysis happens server-side on a daily cron.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ mode | voice | window | filter;  KPI strip (4 tiles) │
 *   ├──────────────────────────┬───────────────────────────┤
 *   │ tweet cards (chrono)     │ selected tweet detail     │
 *   │ (left, scrolls indep.)   │ (right, scrolls indep.)   │
 *   └──────────────────────────┴───────────────────────────┘
 *
 * Filter sources:
 *   - "all"            → useVoicesFeed
 *   - {ticker:"NVDA"}  → useVoicesByTicker
 *   - {theme:"AI"}     → useVoicesByTheme
 */
import { useId, useMemo, useState, type MouseEvent } from "react";
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
import { BarRow, CockpitButton, KpiTile, Tile, TileGrid } from "../../components/Cockpit";
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

function VoiceInitials({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{
        width: size,
        height: size,
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
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filter by ${ticker}`}
      className={`ticker inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs transition-colors ${
        active
          ? "border-transparent bg-accent text-[var(--accent-ink)]"
          : "border-border bg-bg-card hover:border-accent hover:text-accent"
      }`}
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
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Filter by ${kind ?? "theme"} ${label}`}
      title={kind === "sector" ? "Sector" : "Theme"}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs transition-colors ${
        active
          ? "bg-accent text-[var(--accent-ink)]"
          : `bg-bg-card-hover hover:text-accent ${kind === "sector" ? "font-medium text-text-secondary" : "text-text-muted"}`
      }`}
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
}: {
  voiceUsername: string | null;
  voices: { username: string; display_name: string }[];
  onVoiceChange: (u: string | null) => void;
  windowDays: number;
  onWindowChange: (d: number) => void;
  activeFilter: ActiveFilter;
  onClearFilter: () => void;
}) {
  const voiceSelectId = useId();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={voiceSelectId} className="sr-only">
        Voice
      </label>
      <select
        id={voiceSelectId}
        value={voiceUsername ?? ""}
        onChange={(e) => onVoiceChange(e.target.value || null)}
        className="control-surface min-h-8 border px-2 py-1 text-xs text-text-primary"
        style={{ borderRadius: "var(--radius-control)" }}
      >
        <option value="">All voices</option>
        {voices.map((v) => (
          <option key={v.username} value={v.username}>
            @{v.username}
          </option>
        ))}
      </select>

      <Segmented
        ariaLabel="Voices time window"
        value={String(windowDays)}
        onChange={(v) => onWindowChange(Number(v))}
        options={WINDOW_OPTIONS.map((w) => ({ value: String(w.days), label: w.label }))}
      />

      {activeFilter.kind !== "all" && (
        <Chip>
          <Filter size={11} />
          <span>{activeFilter.kind === "ticker" ? "Ticker" : "Theme"}</span>
          <span className={`font-semibold text-text-primary ${activeFilter.kind === "ticker" ? "num" : ""}`}>{activeFilter.value}</span>
          <button
            type="button"
            onClick={onClearFilter}
            className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Clear filter"
          >
            <X size={11} />
          </button>
        </Chip>
      )}
    </div>
  );
}

// ── trending tiles ──────────────────────────────────────────

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
  const maxMentions = Math.max(1, ...tickers.map((t) => t.mentions));
  return (
    <>
      {tickers.length > 0 && (
        <Tile
          span={themes.length > 0 ? 8 : 12}
          title={<span className="inline-flex items-center gap-1.5"><TrendingUp size={14} /> What the voices are talking about</span>}
          meta="mentions in window · color = net lean · click to filter"
        >
          <div className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {tickers.map((t) => {
              const net = t.bullish - t.bearish;
              const on = activeTicker === t.ticker;
              return (
                <div key={t.ticker} className={on ? "rounded-md ring-1 ring-[var(--accent)]" : undefined}>
                  <BarRow
                    label={t.ticker}
                    value={t.mentions}
                    max={maxMentions}
                    tone={net > 0 ? "up" : net < 0 ? "down" : "neutral"}
                    display={t.mentions}
                    trailing={`${t.bullish}/${t.bearish}`}
                    title={`${t.ticker}: ${t.mentions} mentions · ${t.bullish} bullish / ${t.bearish} bearish · last ${relativeAge(t.last_mentioned)}`}
                    onClick={() => onPickTicker(t.ticker)}
                  />
                </div>
              );
            })}
          </div>
        </Tile>
      )}
      {themes.length > 0 && (
        <Tile
          span={tickers.length > 0 ? 4 : 12}
          title={<span className="inline-flex items-center gap-1.5"><Sparkles size={14} /> Themes</span>}
          meta="sectors bold"
        >
          <div className="flex flex-wrap gap-1.5">
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
        </Tile>
      )}
    </>
  );
}

// ── one tweet card ──────────────────────────────────────────

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
    <article
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-2.5 rounded-xl border bg-bg-card p-4 transition-colors ${
        selected ? "border-accent" : "border-border hover:border-[var(--control-boundary)]"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <VoiceInitials name={tweet.voice_display_name || tweet.voice_username} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-text-primary">{tweet.voice_display_name}</div>
          <div className="truncate text-xs text-text-muted">
            @{tweet.voice_username}{" "}
            <span title={absoluteAge(tweet.posted_at) || ""}>· {relativeAge(tweet.posted_at)}</span>
          </div>
        </div>
        {pending ? (
          <span className="text-xs text-text-muted">Analyzing…</span>
        ) : (
          <span
            className="tag"
            style={{ "--tag": sentimentColor(tweet.overall_sentiment) } as React.CSSProperties}
          >
            {sentimentLabel(tweet.overall_sentiment)}
          </span>
        )}
        <a
          href={xUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-text-muted hover:text-text-primary"
          aria-label="Open on X"
        >
          <ExternalLink size={12} />
        </a>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        aria-pressed={selected}
        aria-controls="voice-tweet-detail"
        className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary"
        style={{
          width: "100%",
          textAlign: "left",
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}
      >
        {visibleText}
      </button>

      {(tweet.tickers.length > 0 || tweet.sectors.length > 0 || tweet.themes.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
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

      <div className="num flex items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1">
          <Heart size={11} /> {tweet.like_count.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <Repeat2 size={11} /> {tweet.retweet_count.toLocaleString()}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={11} /> {tweet.reply_count.toLocaleString()}
        </span>
      </div>
    </article>
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
      <div className="flex h-full items-center justify-center py-10 text-sm text-text-muted">
        Pick a tweet from the feed to see the full analysis.
      </div>
    );
  }
  const xUrl = `https://x.com/${tweet.voice_username}/status/${tweet.tweet_id}`;
  const pending = tweet.analysis_status === "pending";
  return (
    <div className="space-y-5 text-sm leading-snug">
      <div className="flex items-start gap-2.5">
        <VoiceInitials name={tweet.voice_display_name || tweet.voice_username} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-semibold text-text-primary">{tweet.voice_display_name}</span>
            <a
              href={`https://x.com/${tweet.voice_username}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-muted hover:text-accent"
            >
              @{tweet.voice_username}
            </a>
          </div>
          <div className="text-xs text-text-muted" title={absoluteAge(tweet.posted_at) || ""}>
            {new Date(tweet.posted_at).toLocaleString()} · {relativeAge(tweet.posted_at)}
          </div>
        </div>
        <CockpitButton href={xUrl} title="Open on X">
          Open on X <ExternalLink size={12} />
        </CockpitButton>
      </div>

      <p className="m-0 whitespace-pre-wrap text-base leading-relaxed text-text-primary">{tweet.text}</p>

      {pending && (
        <div className="callout" style={{ "--callout": "var(--text-muted)" } as React.CSSProperties}>
          Analysis pending — will appear shortly after the next cron pass.
        </div>
      )}

      {!pending && (
        <section className="space-y-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="m-0 text-sm font-semibold text-text-primary">Read</h4>
            <span
              className="tag"
              style={{ "--tag": sentimentColor(tweet.overall_sentiment) } as React.CSSProperties}
              title="Overall sentiment"
            >
              <SentimentDot s={tweet.overall_sentiment} size={6} />
              {sentimentLabel(tweet.overall_sentiment)}
            </span>
            {tweet.is_market_related === 0 && <Chip>Non-market</Chip>}
          </div>
          {tweet.summary && <p className="m-0 text-sm leading-relaxed text-text-secondary">{tweet.summary}</p>}
        </section>
      )}

      {tweet.tickers.length > 0 && (
        <section className="space-y-1.5 border-t border-border pt-4">
          <h4 className="m-0 text-sm font-semibold text-text-primary">
            Tickers <span className="num ml-1 text-xs font-normal text-text-muted">{tweet.tickers.length} · confidence</span>
          </h4>
          {tweet.tickers.map((t) => (
            <BarRow
              key={t.ticker}
              label={t.ticker}
              value={Math.round(t.confidence * 100)}
              max={100}
              tone={t.sentiment === "bullish" ? "up" : t.sentiment === "bearish" ? "down" : "neutral"}
              display={`${Math.round(t.confidence * 100)}%`}
              title={`${t.ticker}: ${sentimentLabel(t.sentiment)}, ${Math.round(t.confidence * 100)}% confidence`}
              onClick={() => {
                setActiveTicker(t.ticker);
                onPickTicker(t.ticker);
              }}
            />
          ))}
        </section>
      )}

      {(tweet.sectors.length > 0 || tweet.themes.length > 0) && (
        <section className="space-y-2 border-t border-border pt-4">
          <h4 className="m-0 text-sm font-semibold text-text-primary">Tags</h4>
          <div className="flex flex-wrap items-center gap-1.5">
            {tweet.sectors.map((s) => (
              <ThemeChip key={`s:${s}`} label={s} kind="sector" onClick={() => onPickTheme(s)} />
            ))}
            {tweet.themes.map((th) => (
              <ThemeChip key={`t:${th}`} label={th} kind="theme" onClick={() => onPickTheme(th)} />
            ))}
          </div>
        </section>
      )}

      <div className="num flex flex-wrap items-center gap-4 border-t border-border pt-3 text-xs text-text-muted">
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

  // KPI strip: pure derivations over the loaded feed.
  const feedKpi = useMemo(() => {
    let bull = 0;
    let bear = 0;
    const counts = new Map<string, number>();
    for (const t of tweets) {
      if (t.overall_sentiment === "bullish") bull += 1;
      else if (t.overall_sentiment === "bearish") bear += 1;
      for (const m of t.tickers) counts.set(m.ticker, (counts.get(m.ticker) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return { bull, bear, bullPct: bull + bear > 0 ? (bull / (bull + bear)) * 100 : null, top };
  }, [tweets]);

  const pickTicker = (t: string) => {
    setActiveFilter({ kind: "ticker", value: t });
    setSelectedTweetId(null);
  };
  const pickTheme = (t: string) => {
    setActiveFilter({ kind: "theme", value: t });
    setSelectedTweetId(null);
  };

  const analyzed = stats?.analyzed ?? 0;
  const total = stats?.total_tweets ?? 0;
  const latest = stats?.latest_tweet_at ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Mode switcher — Feed / Patterns / Synthesis */}
        <Segmented<VoicesMode>
          ariaLabel="Voices view"
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
        <HeaderBar
          voiceUsername={voiceUsername}
          voices={voices ?? []}
          onVoiceChange={setVoiceUsername}
          windowDays={windowDays}
          onWindowChange={setWindowDays}
          activeFilter={activeFilter}
          onClearFilter={() => setActiveFilter({ kind: "all" })}
        />
      </div>

      {mode === "feed" && (
        <>
          <TileGrid>
            <KpiTile
              label="Analyzed tweets"
              value={analyzed.toLocaleString()}
              sub={total !== analyzed ? `of ${total.toLocaleString()} total` : voiceUsername ? `@${voiceUsername}` : "all voices"}
            />
            <KpiTile
              label="Latest tweet"
              value={latest ? <span title={absoluteAge(latest) || ""}>{relativeAge(latest)}</span> : "—"}
              sub={stats?.pending ? `${stats.pending} pending analysis` : "analysis up to date"}
            />
            <KpiTile
              label="Feed lean"
              value={feedKpi.bullPct == null ? "—" : `${feedKpi.bullPct.toFixed(0)}%`}
              delta={feedKpi.bullPct == null ? undefined : feedKpi.bullPct >= 50 ? "bull" : "bear"}
              tone={feedKpi.bullPct == null ? "neutral" : feedKpi.bullPct >= 50 ? "up" : "down"}
              sub={`${feedKpi.bull} bullish · ${feedKpi.bear} bearish of ${tweets.length}`}
            />
            <KpiTile
              label="Most named in feed"
              value={feedKpi.top ? <span className="ticker">{feedKpi.top[0]}</span> : "—"}
              sub={feedKpi.top ? `${feedKpi.top[1]} tweets` : undefined}
            />
          </TileGrid>

          <TileGrid>
            {/* Inline Voice Brief — collapsible synthesis Tile for the
                currently-selected voice. Renders nothing when "All voices"
                is selected (synthesis is per-voice). */}
            <VoiceBriefPanel voiceUsername={voiceUsername} />

            <TrendingStrip
              windowDays={windowDays}
              voiceUsername={voiceUsername}
              activeFilter={activeFilter}
              onPickTicker={pickTicker}
              onPickTheme={pickTheme}
            />

            {/* Feed: one card per tweet */}
            <div
              className="flex min-w-0 flex-col gap-2.5 overflow-y-auto pr-1 lg:col-span-7"
              style={{ maxHeight: "calc(100vh - 260px)", minHeight: 420 }}
            >
              {isLoading && tweets.length === 0 ? (
                <div className="rounded-xl border border-border bg-bg-card p-6 text-center text-sm text-text-muted">
                  Loading tweets…
                </div>
              ) : tweets.length === 0 ? (
                <div className="rounded-xl border border-border bg-bg-card p-6 text-center text-sm text-text-muted">
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
                    onPickTicker={pickTicker}
                    onPickTheme={pickTheme}
                  />
                ))
              )}
            </div>

            {/* Detail */}
            <Tile id="voice-tweet-detail" span={5} title="Selected tweet" className="self-start lg:sticky lg:top-4">
              <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
                <TweetDetail tweet={selectedTweet} onPickTicker={pickTicker} onPickTheme={pickTheme} />
              </div>
            </Tile>
          </TileGrid>
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
