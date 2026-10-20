/**
 * SynthesisView — single-LLM-call cross-tweet meta digest.
 *
 * Renders the JSON synthesis from /api/voices/synthesis as a structured
 * brief: overall view, dominant thesis, sector focus heatmap, high-conviction
 * names with distilled thesis-per-name, bottleneck map, private-companies
 * with public proxies, emerging themes, watch list.
 *
 * "Refresh" button triggers POST /voices/synthesize — one LLM call, 30-90s.
 * Cached up to 24h on the server so default open is instant.
 */
import { useEffect, useState } from "react";
import {
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { Segmented } from "../../../components/Glass";
import { relativeAge, absoluteAge } from "../../../lib/utils";
import {
  useGenerateSynthesis,
  useVoicesSynthesis,
  type SynthesisContent,
} from "../../../api/voices";

const WINDOWS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function sentColor(s?: string | null) {
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

function SentBadge({ s }: { s?: string | null }) {
  const c = sentColor(s);
  const Icon = s === "bullish" ? TrendingUp : s === "bearish" ? TrendingDown : Minus;
  return (
    <span className="tag capitalize" style={{ "--tag": c } as React.CSSProperties}>
      <Icon size={11} />
      {s ?? "—"}
    </span>
  );
}

function Section({
  title,
  count,
  sub,
  children,
}: {
  title: string;
  count?: number;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="section-title">
          {title}
          {count !== undefined && (
            <span className="num ml-2 align-middle text-xs font-normal text-text-muted">{count}</span>
          )}
        </h3>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function PickTicker({ t, size = "sm" }: { t: string; size?: "sm" | "base" }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <button
      type="button"
      onClick={() => setActiveTicker(t)}
      className={`ticker inline-block hover:text-accent-blue ${size === "base" ? "text-base" : "text-sm"}`}
    >
      {t}
    </button>
  );
}

function TickerList({ tickers }: { tickers: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {tickers.map((t) => (
        <PickTicker key={t} t={t} />
      ))}
    </span>
  );
}

function Body({ content }: { content: SynthesisContent }) {
  const hasAside =
    content.sector_focus.length > 0 ||
    content.emerging_themes.length > 0 ||
    content.watch_list.length > 0;
  return (
    <article className="space-y-10">
      {/* Lead: the overall read is the focal point of the page */}
      <header className="max-w-[68ch] space-y-3">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>Overall read</span>
          <SentBadge s={content.overall_sentiment} />
        </div>
        <p className="font-display text-2xl leading-snug text-text-primary text-pretty">
          {content.overall_view || "—"}
        </p>
      </header>

      <div className={`grid gap-10 ${hasAside ? "xl:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
        <div className="min-w-0 space-y-10">
          <Section title="Dominant thesis">
            <p className="prose-read max-w-[68ch] whitespace-pre-wrap">
              {content.top_thesis || "—"}
            </p>
          </Section>

          {content.high_conviction.length > 0 && (
            <Section
              title="High conviction"
              count={content.high_conviction.length}
              sub="Names with the most evidence behind them, thesis distilled per name."
            >
              <div className="divide-y divide-border">
                {content.high_conviction.map((h) => (
                  <div key={h.ticker} className="grid gap-x-5 gap-y-1 py-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                    <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
                      <PickTicker t={h.ticker} size="base" />
                      <SentBadge s={h.sentiment} />
                      <span className="num text-xs text-text-muted" title="Evidence count">
                        {h.evidence_count} mentions
                      </span>
                    </div>
                    <p className="prose-read max-w-[68ch]">{h.thesis}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {content.bottlenecks.length > 0 && (
            <Section title="Bottlenecks and chokepoints" count={content.bottlenecks.length}>
              <ul className="max-w-[68ch] space-y-4">
                {content.bottlenecks.map((b, idx) => (
                  <li key={idx} className="space-y-1">
                    <p className="prose-read text-text-primary">{b.description}</p>
                    {b.exposed_tickers.length > 0 && (
                      <p className="text-xs text-text-muted">
                        Exposed <span className="ml-1"><TickerList tickers={b.exposed_tickers} /></span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {content.private_companies.length > 0 && (
            <Section
              title="Private companies, public proxies"
              count={content.private_companies.length}
            >
              <ul className="max-w-[68ch] space-y-4">
                {content.private_companies.map((p, idx) => (
                  <li key={idx} className="space-y-1">
                    <h4 className="font-display text-lg font-medium text-text-primary">{p.name}</h4>
                    <p className="text-sm leading-relaxed text-text-secondary">{p.rationale}</p>
                    {p.public_proxies.length > 0 && (
                      <p className="text-xs text-text-muted">
                        Proxies <span className="ml-1"><TickerList tickers={p.public_proxies} /></span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {hasAside && (
          <aside className="min-w-0 space-y-10">
            {content.sector_focus.length > 0 && (
              <Section title="Sector focus" count={content.sector_focus.length}>
                <div className="space-y-3">
                  {content.sector_focus.map((s) => (
                    <div key={s.sector} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm capitalize text-text-primary">{s.sector}</span>
                        <span className="num text-sm font-semibold" style={{ color: sentColor(s.lean) }}>
                          {s.weight_pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, s.weight_pct)}%`, background: sentColor(s.lean) }}
                        />
                      </div>
                      <div className="flex items-start gap-2">
                        <SentBadge s={s.lean} />
                        {s.notes && <p className="text-xs leading-relaxed text-text-muted">{s.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {content.emerging_themes.length > 0 && (
              <Section title="Emerging themes" count={content.emerging_themes.length}>
                <ul className="space-y-3">
                  {content.emerging_themes.map((t, idx) => (
                    <li key={idx}>
                      <div className="text-sm font-medium text-text-primary">{t.theme}</div>
                      <p className="text-sm leading-relaxed text-text-secondary">{t.rationale}</p>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {content.watch_list.length > 0 && (
              <Section title="Watch list" count={content.watch_list.length}>
                <div className="divide-y divide-border">
                  {content.watch_list.map((w, idx) => (
                    <div key={idx} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2.5">
                      <PickTicker t={w.ticker} />
                      <span className="text-sm leading-relaxed text-text-secondary">{w.why_watch}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}

export function SynthesisView({
  voiceUsername,
  windowDays,
  onWindowChange,
}: {
  voiceUsername: string | null;
  windowDays: number;
  onWindowChange: (d: number) => void;
}) {
  const voice = voiceUsername || "aleabitoreddit";
  const { data, isLoading, refetch } = useVoicesSynthesis(voice, windowDays, 720);
  const generate = useGenerateSynthesis();
  const [justGenerated, setJustGenerated] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNowMs(Date.now());
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const handleGenerate = async () => {
    setJustGenerated(false);
    try {
      await generate.mutateAsync({ voice, windowDays });
      setJustGenerated(true);
      await refetch();
    } catch (err) {
      // generate.isError / generate.error drive the inline banner below.
      console.error("synthesize failed", err);
    }
  };

  const errMsg =
    generate.isError && generate.error instanceof Error
      ? generate.error.message
      : generate.isError
        ? "Synthesis failed"
        : null;

  const content = data?.content ?? null;
  const hasContent = !!content;
  const stale =
    data?.stale ||
    (!hasContent && !isLoading) ||
    (hasContent && data?.generated_at && nowMs != null && nowMs - new Date(data.generated_at).getTime() > 24 * 3600_000);

  return (
    <div className="space-y-6">
      {/* Header: window + refresh */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Synthesis window"
          value={String(windowDays)}
          onChange={(v) => onWindowChange(Number(v))}
          options={WINDOWS.map((w) => ({ value: String(w.days), label: w.label }))}
        />

        {data?.generated_at && (
          <span
            className="text-xs text-text-muted"
            title={absoluteAge(data.generated_at) || ""}
          >
            @{voice} · generated {relativeAge(data.generated_at)} · <span className="num">{data.n_tweets ?? 0}</span> tweets
          </span>
        )}

        <button
          type="button"
          disabled={generate.isPending}
          onClick={handleGenerate}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-50"
        >
          {generate.isPending ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              Synthesizing…
            </>
          ) : (
            <>
              <RefreshCw size={11} />
              {hasContent ? "Re-synthesize" : "Generate"}
            </>
          )}
        </button>
      </div>

      {/* Error banner — surfaces the real backend reason instead of failing silently */}
      {errMsg && !generate.isPending && (
        <div
          role="alert"
          className="callout flex items-start gap-2"
          style={{ "--callout": "var(--accent-red)" } as React.CSSProperties}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Synthesis failed</div>
            <div className="break-words">{errMsg}</div>
          </div>
        </div>
      )}

      {/* Body */}
      {generate.isPending && !hasContent && (
        <div className="py-12 text-center text-sm text-text-muted">
          <Loader2 size={18} className="mb-2 inline-block animate-spin" />
          <div>One LLM call summarizing all tweets in the window. Takes 2-4 minutes.</div>
        </div>
      )}

      {!generate.isPending && !hasContent && !isLoading && (
        <div className="max-w-[60ch] py-12">
          <h3 className="section-title">No synthesis yet</h3>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Click <span className="font-medium text-text-primary">Generate</span> above to run one (single LLM call, ~2-4 min).
          </p>
        </div>
      )}

      {hasContent && content && (
        <>
          {stale && !justGenerated && (
            <div className="callout max-w-[68ch]">
              Synthesis is older than 24h. Re-synthesize to capture new tweets.
            </div>
          )}
          <Body content={content} />
        </>
      )}
    </div>
  );
}
