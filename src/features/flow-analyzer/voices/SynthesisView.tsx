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
  Sparkles,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  AlertTriangle,
  Eye,
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
    <span
      className="inline-flex items-center gap-1 text-xs font-medium capitalize"
      style={{ color: c }}
    >
      <Icon size={11} />
      {s ?? "—"}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <Icon size={13} className="text-text-muted" />
        {title}
        {count !== undefined && (
          <span className="num text-xs font-normal text-text-muted">{count}</span>
        )}
      </h3>
      {children}
    </section>
  );
}

function PickTicker({ t }: { t: string }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <button
      type="button"
      onClick={() => setActiveTicker(t)}
      className="num inline-block font-semibold text-xs text-text-primary hover:text-accent-blue"
    >
      {t}
    </button>
  );
}

function Body({ content }: { content: SynthesisContent }) {
  return (
    <div className="card space-y-4">
      {/* Hero */}
      <div className="max-w-[72ch] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">
            Overall sentiment
          </span>
          <SentBadge s={content.overall_sentiment} />
        </div>
        <p className="text-base text-text-primary leading-relaxed">
          {content.overall_view || "—"}
        </p>
      </div>

      {/* Top thesis */}
      <Section icon={Target} title="Dominant thesis">
        <p className="max-w-[72ch] text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
          {content.top_thesis || "—"}
        </p>
      </Section>

      {/* Sector focus heatmap */}
      {content.sector_focus.length > 0 && (
        <Section icon={Sparkles} title="Sector focus" count={content.sector_focus.length}>
          <div className="space-y-1">
            {content.sector_focus.map((s) => (
              <div key={s.sector} className="flex items-center gap-2">
                <span className="text-xs text-text-primary capitalize w-40 truncate">
                  {s.sector}
                </span>
                <div className="flex-1 h-2 rounded-full bg-bg-card overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, s.weight_pct)}%`,
                      background: sentColor(s.lean),
                    }}
                  />
                </div>
                <span className="text-xs num text-text-muted w-10 text-right">
                  {s.weight_pct}%
                </span>
                <span className="w-20"><SentBadge s={s.lean} /></span>
              </div>
            ))}
            {content.sector_focus.some((s) => s.notes) && (
              <div className="mt-2 max-w-[72ch] space-y-1 text-sm text-text-secondary leading-relaxed">
                {content.sector_focus
                  .filter((s) => s.notes)
                  .map((s) => (
                    <div key={`note-${s.sector}`}>
                      <span className="font-medium text-text-primary capitalize">{s.sector}:</span>{" "}
                      {s.notes}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* High conviction names */}
      {content.high_conviction.length > 0 && (
        <Section
          icon={Target}
          title="High conviction"
          count={content.high_conviction.length}
        >
          <div className="divide-y divide-border">
            {content.high_conviction.map((h) => (
              <div key={h.ticker} className="flex items-start gap-3 py-2">
                <div className="flex w-20 shrink-0 flex-col items-start gap-0.5">
                  <PickTicker t={h.ticker} />
                  <SentBadge s={h.sentiment} />
                  <span className="num text-xs text-text-muted" title="Evidence count">
                    ×{h.evidence_count}
                  </span>
                </div>
                <p className="max-w-[72ch] text-sm text-text-secondary leading-relaxed">
                  {h.thesis}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Bottlenecks */}
      {content.bottlenecks.length > 0 && (
        <Section
          icon={AlertTriangle}
          title="Bottlenecks and chokepoints"
          count={content.bottlenecks.length}
        >
          <div className="space-y-1.5">
            {content.bottlenecks.map((b, idx) => (
              <div key={idx} className="text-sm text-text-secondary leading-snug">
                <span className="text-text-primary">{b.description}</span>
                {b.exposed_tickers.length > 0 && (
                  <span className="ml-2">
                    →{" "}
                    {b.exposed_tickers.map((t, i) => (
                      <span key={t}>
                        {i > 0 && <span className="text-text-muted">, </span>}
                        <PickTicker t={t} />
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Private companies → public proxies */}
      {content.private_companies.length > 0 && (
        <Section
          icon={Eye}
          title="Private companies with public proxies"
          count={content.private_companies.length}
        >
          <div className="space-y-1.5">
            {content.private_companies.map((p, idx) => (
              <div key={idx} className="text-sm text-text-secondary leading-snug">
                <span className="font-semibold text-text-primary">{p.name}</span>
                <span className="text-text-muted"> — {p.rationale}</span>
                {p.public_proxies.length > 0 && (
                  <div className="mt-0.5">
                    <span className="text-xs text-text-muted mr-1">
                      Proxies
                    </span>
                    {p.public_proxies.map((t, i) => (
                      <span key={t}>
                        {i > 0 && <span className="text-text-muted">, </span>}
                        <PickTicker t={t} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Emerging themes */}
      {content.emerging_themes.length > 0 && (
        <Section
          icon={TrendingUp}
          title="Emerging themes"
          count={content.emerging_themes.length}
        >
          <ul className="space-y-1.5 text-sm text-text-secondary leading-snug">
            {content.emerging_themes.map((t, idx) => (
              <li key={idx}>
                <span className="font-semibold text-text-primary">{t.theme}</span>
                <span className="text-text-muted"> — {t.rationale}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Watch list */}
      {content.watch_list.length > 0 && (
        <Section icon={Eye} title="Watch list" count={content.watch_list.length}>
          <div className="space-y-1.5">
            {content.watch_list.map((w, idx) => (
              <div key={idx} className="text-sm leading-snug">
                <PickTicker t={w.ticker} />
                <span className="text-text-muted ml-2">{w.why_watch}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
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
    <div className="space-y-3">
      {/* Header: window + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
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
            Generated {relativeAge(data.generated_at)} · <span className="num">{data.n_tweets ?? 0}</span> tweets
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
          className="card flex items-start gap-2 text-sm"
          style={{ color: "var(--accent-red)", background: "color-mix(in srgb, var(--accent-red) 8%, var(--bg-card))" }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Synthesis failed</div>
            <div className="text-text-secondary break-words">{errMsg}</div>
          </div>
        </div>
      )}

      {/* Body */}
      {generate.isPending && !hasContent && (
        <div className="card p-6 text-center text-sm text-text-muted">
          <Loader2 size={18} className="animate-spin inline-block mb-2" />
          <div>One LLM call summarizing all tweets in the window. Takes 2-4 minutes.</div>
        </div>
      )}

      {!generate.isPending && !hasContent && !isLoading && (
        <div className="card p-6 text-center text-sm text-text-muted">
          No synthesis cached. Click <span className="font-medium text-text-primary">Generate</span> above to run one (single LLM call, ~2-4 min).
        </div>
      )}

      {hasContent && content && (
        <>
          {stale && !justGenerated && (
            <div className="text-xs text-text-muted">
              Synthesis is older than 24h. Re-synthesize to capture new tweets.
            </div>
          )}
          <Body content={content} />
        </>
      )}
    </div>
  );
}
