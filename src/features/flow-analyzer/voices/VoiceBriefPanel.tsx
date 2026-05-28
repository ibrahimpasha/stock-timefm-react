/**
 * VoiceBriefPanel — inline collapsible Voices synthesis, mirrors TraderBrief.
 *
 * Drops at the top of the Voices Feed view so the synthesis is one click away
 * from the chronological tweet stream. Reuses `useVoicesSynthesis` +
 * `useGenerateSynthesis` from `src/api/voices.ts`. The full-screen Synthesis
 * sub-tab keeps the same data but provides more room for long content; this
 * panel is the ergonomic peek that doesn't force a tab switch.
 *
 * When `voiceUsername` is null, the panel renders nothing — synthesis is
 * a per-voice concept and the "all voices" aggregate isn't meaningful here.
 */
import { useState } from "react";
import {
  Brain,
  RefreshCw,
  Loader2,
  Target,
  Sparkles,
  Eye,
  TrendingUp,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { relativeAge, absoluteAge } from "../../../lib/utils";
import {
  useGenerateSynthesis,
  useVoicesSynthesis,
  type SynthesisContent,
} from "../../../api/voices";

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

function sentColor(s?: string | null): string {
  if (s === "bullish") return "var(--accent-green)";
  if (s === "bearish") return "var(--accent-red)";
  if (s === "mixed") return "var(--accent-orange)";
  return "var(--text-muted)";
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="text-accent-purple" />
        <span className="text-xs uppercase text-text-muted font-semibold">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-xs text-text-muted">({count})</span>
        )}
      </div>
      {children}
    </div>
  );
}

function BriefBody({ content }: { content: SynthesisContent }) {
  return (
    <div className="space-y-3">
      {/* Sentiment + overall view */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs uppercase text-text-muted font-semibold">
            Sentiment
          </span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs uppercase font-bold"
            style={{
              background: `${sentColor(content.overall_sentiment)}20`,
              color: sentColor(content.overall_sentiment),
              border: `1px solid ${sentColor(content.overall_sentiment)}40`,
            }}
          >
            {content.overall_sentiment}
          </span>
        </div>
        <p className="text-sm text-text-primary leading-relaxed">
          {content.overall_view || "—"}
        </p>
      </div>

      {/* Top thesis */}
      {content.top_thesis && (
        <Section icon={Target} title="Top Thesis">
          <p className="text-sm text-text-secondary italic leading-relaxed border-l-2 border-accent-purple pl-3 whitespace-pre-wrap">
            {content.top_thesis}
          </p>
        </Section>
      )}

      {/* Sectors */}
      {content.sector_focus.length > 0 && (
        <Section
          icon={Sparkles}
          title="Sector Focus"
          count={content.sector_focus.length}
        >
          <div className="space-y-1">
            {content.sector_focus.map((s) => (
              <div key={s.sector} className="flex items-center gap-2">
                <span className="text-xs text-text-primary capitalize w-36 truncate">
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
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* High conviction */}
      {content.high_conviction.length > 0 && (
        <Section
          icon={Target}
          title="High Conviction"
          count={content.high_conviction.length}
        >
          <div className="space-y-1.5">
            {content.high_conviction.map((h) => (
              <div key={h.ticker} className="flex items-start gap-2 text-sm leading-snug">
                <div className="flex flex-col items-center w-12 shrink-0">
                  <PickTicker t={h.ticker} />
                  <span className="text-xs uppercase font-semibold" style={{ color: sentColor(h.sentiment) }}>
                    {h.sentiment[0]}
                  </span>
                  <span className="text-xs text-text-muted">×{h.evidence_count}</span>
                </div>
                <p className="text-text-secondary">{h.thesis}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Bottlenecks */}
      {content.bottlenecks.length > 0 && (
        <Section
          icon={AlertTriangle}
          title="Bottlenecks"
          count={content.bottlenecks.length}
        >
          <div className="space-y-1">
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

      {/* Private → public */}
      {content.private_companies.length > 0 && (
        <Section
          icon={Eye}
          title="Private → Public Proxies"
          count={content.private_companies.length}
        >
          <div className="space-y-1">
            {content.private_companies.map((p, idx) => (
              <div key={idx} className="text-sm text-text-secondary leading-snug">
                <span className="font-semibold text-text-primary">{p.name}</span>
                <span className="text-text-muted"> — {p.rationale}</span>
                {p.public_proxies.length > 0 && (
                  <div className="mt-0.5 ml-3">
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
          <ul className="space-y-1 text-sm text-text-secondary leading-snug">
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
        <Section
          icon={Eye}
          title="Watch List"
          count={content.watch_list.length}
        >
          <div className="space-y-1">
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

export function VoiceBriefPanel({
  voiceUsername,
}: {
  voiceUsername: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(30);

  // Per-voice synthesis only — "all voices" aggregate isn't meaningful here.
  // Render nothing when no voice is selected.
  const enabled = !!voiceUsername;

  const { data, isFetching, refetch } = useVoicesSynthesis(
    voiceUsername ?? "",
    windowDays,
    720,
  );
  const generate = useGenerateSynthesis();

  if (!enabled) return null;

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ voice: voiceUsername!, windowDays });
      await refetch();
    } catch (err) {
      console.error("voice-brief generate failed", err);
    }
  };

  const content = data?.content ?? null;
  const hasContent = !!content;

  return (
    <div className="card p-3">
      {/* Collapsed header — clickable */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-accent-purple" />
          <span className="text-sm font-semibold text-text-primary">
            Voice Brief
          </span>
          <span className="text-xs font-mono text-text-muted">
            @{voiceUsername}
          </span>
          {data?.generated_at && (
            <span
              className="text-xs text-text-muted"
              title={absoluteAge(data.generated_at) || ""}
            >
              · {relativeAge(data.generated_at)}
            </span>
          )}
          {!hasContent && !isFetching && (
            <span className="text-xs text-text-muted">not generated yet</span>
          )}
        </div>
        {open ? (
          <ChevronUp size={14} className="text-text-muted" />
        ) : (
          <ChevronDown size={14} className="text-text-muted" />
        )}
      </button>

      {/* Expanded body */}
      {open && (
        <div className="mt-3 space-y-3">
          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase text-text-muted font-semibold">
              Window
            </span>
            <div className="flex items-center rounded border border-border overflow-hidden">
              {WINDOW_OPTIONS.map((w) => {
                const active = w.days === windowDays;
                return (
                  <button
                    key={w.label}
                    type="button"
                    onClick={() => setWindowDays(w.days)}
                    className="px-2 py-1 text-xs font-semibold transition-colors"
                    style={{
                      background: active ? "var(--accent-blue)" : "transparent",
                      color: active
                        ? "var(--bg-primary)"
                        : "var(--text-secondary)",
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>

            {data?.n_tweets != null && (
              <span className="text-xs text-text-muted">
                {data.n_tweets} tweets
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
                  Generating…
                </>
              ) : (
                <>
                  <RefreshCw size={11} />
                  {hasContent ? "Re-generate" : "Generate"}
                </>
              )}
            </button>
          </div>

          {/* Body */}
          {generate.isPending && !hasContent && (
            <div className="text-center py-6 text-sm text-text-muted">
              <Loader2 size={16} className="animate-spin inline-block mb-1.5" />
              <div>
                One LLM call summarizing @{voiceUsername}'s last {windowDays}d. 30-90s.
              </div>
            </div>
          )}

          {!generate.isPending && !hasContent && (
            <div className="text-center py-4 text-sm text-text-muted">
              No brief cached for this window. Click{" "}
              <span className="text-accent-purple">Generate</span>{" "}
              (single LLM call, ~30-90s).
            </div>
          )}

          {hasContent && content && <BriefBody content={content} />}
        </div>
      )}
    </div>
  );
}
