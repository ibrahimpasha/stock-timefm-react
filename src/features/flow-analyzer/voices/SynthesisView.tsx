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
import { useState } from "react";
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
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold uppercase"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}40` }}
    >
      <Icon size={10} />
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
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={13} className="text-accent-purple" />
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        {count !== undefined && (
          <span className="text-xs text-text-muted">({count})</span>
        )}
      </div>
      {children}
    </div>
  );
}

function PickTicker({ t }: { t: string }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <button
      type="button"
      onClick={() => setActiveTicker(t)}
      className="inline-block font-mono font-semibold text-xs text-accent-blue hover:underline"
    >
      {t}
    </button>
  );
}

function Body({ content }: { content: SynthesisContent }) {
  return (
    <div className="space-y-3">
      {/* Hero */}
      <div className="card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-text-muted font-semibold">
            Overall Sentiment
          </span>
          <SentBadge s={content.overall_sentiment} />
        </div>
        <p className="text-sm text-text-primary leading-relaxed">
          {content.overall_view || "—"}
        </p>
      </div>

      {/* Top thesis */}
      <Section icon={Target} title="Dominant Thesis">
        <p className="text-sm text-text-secondary italic leading-relaxed border-l-2 border-accent-purple pl-3 whitespace-pre-wrap">
          {content.top_thesis || "—"}
        </p>
      </Section>

      {/* Sector focus heatmap */}
      {content.sector_focus.length > 0 && (
        <Section icon={Sparkles} title="Sector Focus" count={content.sector_focus.length}>
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
                <span className="text-xs font-mono text-text-muted w-10 text-right">
                  {s.weight_pct}%
                </span>
                <SentBadge s={s.lean} />
              </div>
            ))}
            {content.sector_focus.some((s) => s.notes) && (
              <div className="mt-2 space-y-1 text-sm text-text-secondary leading-relaxed">
                {content.sector_focus
                  .filter((s) => s.notes)
                  .map((s) => (
                    <div key={`note-${s.sector}`}>
                      <span className="font-semibold capitalize">{s.sector}:</span>{" "}
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
          title="High Conviction"
          count={content.high_conviction.length}
        >
          <div className="space-y-2">
            {content.high_conviction.map((h) => (
              <div key={h.ticker} className="flex items-start gap-2">
                <div className="flex flex-col items-center w-14 shrink-0">
                  <PickTicker t={h.ticker} />
                  <SentBadge s={h.sentiment} />
                  <span className="text-[9px] text-text-muted mt-0.5">
                    ×{h.evidence_count}
                  </span>
                </div>
                <p className="text-sm text-text-secondary leading-snug">
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
          title="Bottlenecks / Chokepoints"
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
          title="Private Companies (with public proxies)"
          count={content.private_companies.length}
        >
          <div className="space-y-1.5">
            {content.private_companies.map((p, idx) => (
              <div key={idx} className="text-sm text-text-secondary leading-snug">
                <span className="font-semibold text-text-primary">{p.name}</span>
                <span className="text-text-muted"> — {p.rationale}</span>
                {p.public_proxies.length > 0 && (
                  <div className="mt-0.5">
                    <span className="text-xs uppercase text-text-muted mr-1">
                      Proxies:
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
          title="Emerging Themes"
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
        <Section icon={Eye} title="Watch List" count={content.watch_list.length}>
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

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ voice, windowDays });
      setJustGenerated(true);
      await refetch();
    } catch (err) {
      console.error("synthesize failed", err);
    }
  };

  const content = data?.content ?? null;
  const hasContent = !!content;
  const stale =
    data?.stale ||
    (!hasContent && !isLoading) ||
    (hasContent && data?.generated_at && Date.now() - new Date(data.generated_at).getTime() > 24 * 3600_000);

  return (
    <div className="space-y-3">
      {/* Header: window + refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase text-text-muted font-semibold">
          Window
        </span>
        <div className="flex items-center rounded border border-border overflow-hidden">
          {WINDOWS.map((w) => {
            const active = w.days === windowDays;
            return (
              <button
                key={w.label}
                type="button"
                onClick={() => onWindowChange(w.days)}
                className="px-2 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: active ? "var(--accent-blue)" : "transparent",
                  color: active ? "var(--bg-primary)" : "var(--text-secondary)",
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>

        {data?.generated_at && (
          <span
            className="text-xs text-text-muted"
            title={absoluteAge(data.generated_at) || ""}
          >
            generated {relativeAge(data.generated_at)} · {data.n_tweets ?? 0} tweets
          </span>
        )}

        <button
          type="button"
          disabled={generate.isPending}
          onClick={handleGenerate}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold border border-accent-purple/40 text-accent-purple bg-accent-purple/10 hover:bg-accent-purple/20 disabled:opacity-50"
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

      {/* Body */}
      {generate.isPending && !hasContent && (
        <div className="card p-6 text-center text-sm text-text-muted">
          <Loader2 size={18} className="animate-spin inline-block mb-2" />
          <div>One LLM call summarizing all tweets in the window. 30-90s.</div>
        </div>
      )}

      {!generate.isPending && !hasContent && !isLoading && (
        <div className="card p-6 text-center text-sm text-text-muted">
          No synthesis cached. Click <span className="text-accent-purple">Generate</span> above to run one (single LLM call, ~30-90s).
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
