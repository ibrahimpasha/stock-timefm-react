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
import { Segmented } from "../../../components/Glass";
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
      className="num inline-block font-semibold text-xs text-text-primary hover:text-accent-blue"
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
    <div className="space-y-1.5 border-t border-border pt-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        <Icon size={13} className="text-text-muted" />
        {title}
        {count !== undefined && (
          <span className="num text-xs font-normal text-text-muted">{count}</span>
        )}
      </h4>
      {children}
    </div>
  );
}

function BriefBody({ content }: { content: SynthesisContent }) {
  return (
    <div className="max-w-[72ch] space-y-3">
      {/* Sentiment + overall view */}
      <div>
        <div className="flex items-center gap-2 mb-1 text-xs">
          <span className="text-text-muted">Sentiment</span>
          <span
            className="font-semibold capitalize"
            style={{ color: sentColor(content.overall_sentiment) }}
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
        <Section icon={Target} title="Top thesis">
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {content.top_thesis}
          </p>
        </Section>
      )}

      {/* Sectors */}
      {content.sector_focus.length > 0 && (
        <Section
          icon={Sparkles}
          title="Sector focus"
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
                <span className="text-xs num text-text-muted w-10 text-right">
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
          title="High conviction"
          count={content.high_conviction.length}
        >
          <div className="space-y-1.5">
            {content.high_conviction.map((h) => (
              <div key={h.ticker} className="flex items-start gap-2 text-sm leading-snug">
                <div className="flex flex-col items-center w-12 shrink-0">
                  <PickTicker t={h.ticker} />
                  <span className="text-xs font-medium" style={{ color: sentColor(h.sentiment) }} title={h.sentiment}>
                    {h.sentiment[0]?.toUpperCase()}
                  </span>
                  <span className="num text-xs text-text-muted" title="Evidence count">×{h.evidence_count}</span>
                </div>
                <p className="text-text-secondary leading-relaxed">{h.thesis}</p>
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
          title="Private to public proxies"
          count={content.private_companies.length}
        >
          <div className="space-y-1">
            {content.private_companies.map((p, idx) => (
              <div key={idx} className="text-sm text-text-secondary leading-snug">
                <span className="font-semibold text-text-primary">{p.name}</span>
                <span className="text-text-muted"> — {p.rationale}</span>
                {p.public_proxies.length > 0 && (
                  <div className="mt-0.5 ml-3">
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
          title="Watch list"
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

  const { data, isFetching, isError, error, refetch } = useVoicesSynthesis(
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
          <Brain size={14} className="text-text-muted" />
          <span className="text-sm font-semibold text-text-primary">
            Voice brief
          </span>
          <span className="text-xs text-text-muted">
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
          {!hasContent && !isFetching && !isError && (
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
            <Segmented
              ariaLabel="Voice brief window"
              value={String(windowDays)}
              onChange={(v) => setWindowDays(Number(v))}
              options={WINDOW_OPTIONS.map((w) => ({ value: String(w.days), label: w.label }))}
            />

            {data?.n_tweets != null && (
              <span className="text-xs text-text-muted">
                <span className="num">{data.n_tweets}</span> tweets
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


          {generate.isError && (
            <div className="text-xs text-accent-red" role="alert">
              {generate.error instanceof Error && generate.error.message
                ? generate.error.message
                : "The voice brief could not be generated. Try again."}
            </div>
          )}

          {isError && !data && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-accent-red" role="alert">
              <span>
                {error instanceof Error && error.message
                  ? error.message
                  : "The cached voice brief could not be loaded."}
              </span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-text-secondary hover:text-text-primary"
              >
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          )}

          {!generate.isPending && !isError && !hasContent && (
            <div className="text-center py-4 text-sm text-text-muted">
              No brief cached for this window. Click{" "}
              <span className="font-medium text-text-primary">Generate</span>{" "}
              (single LLM call, ~30-90s).
            </div>
          )}

          {hasContent && content && <BriefBody content={content} />}
        </div>
      )}
    </div>
  );
}
