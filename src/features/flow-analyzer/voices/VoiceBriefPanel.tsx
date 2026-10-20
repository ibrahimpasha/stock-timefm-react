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
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { Segmented } from "../../../components/Glass";
import { CockpitButton, Tile } from "../../../components/Cockpit";
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
      className="ticker inline-block text-sm hover:text-accent"
    >
      {t}
    </button>
  );
}

function TickerList({ tickers }: { tickers: string[] }) {
  return (
    <span className="ml-1 inline-flex flex-wrap items-baseline gap-x-2">
      {tickers.map((t) => (
        <PickTicker key={t} t={t} />
      ))}
    </span>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h4 className="m-0 text-sm font-semibold text-text-primary">
        {title}
        {count !== undefined && (
          <span className="num ml-2 text-xs font-normal text-text-muted">{count}</span>
        )}
      </h4>
      {children}
    </section>
  );
}

/** Weighted sector row; wider label column than Cockpit BarRow (sector names, not tickers). */
function SectorBar({ sector, pct, lean, notes }: { sector: string; pct: number; lean?: string | null; notes?: string | null }) {
  return (
    <div className="grid min-h-6 grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-2.5" title={notes ? `${sector}: ${notes}` : sector}>
      <span className="truncate text-sm capitalize text-text-primary">{sector}</span>
      <div className="h-3.5 rounded-[3px]" style={{ background: "var(--track)" }}>
        <div className="h-3.5 rounded-[3px]" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: sentColor(lean) }} />
      </div>
      <span className="num text-right text-sm" style={{ color: sentColor(lean) }}>{pct}%</span>
    </div>
  );
}

function BriefBody({ content }: { content: SynthesisContent }) {
  const hasAside = content.sector_focus.length > 0 || content.watch_list.length > 0 || content.emerging_themes.length > 0;
  return (
    <div className={`grid gap-8 ${hasAside ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : ""}`}>
      {/* Reading column: the overall view leads */}
      <div className="min-w-0 max-w-[68ch] space-y-6">
        <div className="space-y-2">
          <span
            className="tag capitalize"
            style={{ "--tag": sentColor(content.overall_sentiment) } as React.CSSProperties}
          >
            {content.overall_sentiment}
          </span>
          <p className="m-0 text-lg font-semibold leading-snug text-text-primary text-pretty">
            {content.overall_view || "—"}
          </p>
        </div>

        {content.top_thesis && (
          <Section title="Top thesis">
            <p className="prose-read whitespace-pre-wrap">{content.top_thesis}</p>
          </Section>
        )}

        {content.high_conviction.length > 0 && (
          <Section title="High conviction" count={content.high_conviction.length}>
            <div className="divide-y divide-border">
              {content.high_conviction.map((h) => (
                <div key={h.ticker} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <PickTicker t={h.ticker} />
                    <span
                      className="tag capitalize"
                      style={{ "--tag": sentColor(h.sentiment) } as React.CSSProperties}
                    >
                      {h.sentiment}
                    </span>
                    <span className="num text-xs text-text-muted" title="Evidence count">×{h.evidence_count}</span>
                  </div>
                  <p className="prose-read">{h.thesis}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {content.bottlenecks.length > 0 && (
          <Section title="Bottlenecks" count={content.bottlenecks.length}>
            <ul className="m-0 list-none space-y-3 p-0">
              {content.bottlenecks.map((b, idx) => (
                <li key={idx} className="space-y-0.5">
                  <p className="m-0 text-sm leading-relaxed text-text-primary">{b.description}</p>
                  {b.exposed_tickers.length > 0 && (
                    <p className="m-0 text-xs text-text-muted">
                      Exposed <TickerList tickers={b.exposed_tickers} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {content.private_companies.length > 0 && (
          <Section title="Private to public proxies" count={content.private_companies.length}>
            <ul className="m-0 list-none space-y-3 p-0">
              {content.private_companies.map((p, idx) => (
                <li key={idx} className="space-y-0.5">
                  <div className="text-sm font-semibold text-text-primary">{p.name}</div>
                  <p className="m-0 text-sm leading-relaxed text-text-secondary">{p.rationale}</p>
                  {p.public_proxies.length > 0 && (
                    <p className="m-0 text-xs text-text-muted">
                      Proxies <TickerList tickers={p.public_proxies} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      {hasAside && (
        <aside className="min-w-0 space-y-6 lg:border-l lg:border-border lg:pl-6">
          {content.sector_focus.length > 0 && (
            <Section title="Sector focus" count={content.sector_focus.length}>
              {content.sector_focus.map((s) => (
                <SectorBar key={s.sector} sector={s.sector} pct={s.weight_pct} lean={s.lean} notes={s.notes} />
              ))}
            </Section>
          )}

          {content.watch_list.length > 0 && (
            <Section title="Watch list" count={content.watch_list.length}>
              <div className="divide-y divide-border">
                {content.watch_list.map((w, idx) => (
                  <div key={idx} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2">
                    <PickTicker t={w.ticker} />
                    <span className="text-sm leading-relaxed text-text-secondary">{w.why_watch}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {content.emerging_themes.length > 0 && (
            <Section title="Emerging themes" count={content.emerging_themes.length}>
              <ul className="m-0 list-none space-y-2 p-0">
                {content.emerging_themes.map((t, idx) => (
                  <li key={idx} className="text-sm leading-relaxed text-text-secondary">
                    <span className="font-medium text-text-primary">{t.theme}</span> — {t.rationale}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
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
    <Tile
      span={12}
      title={
        <span className="inline-flex items-center gap-2">
          <Brain size={15} className="text-text-muted" /> Voice brief
        </span>
      }
      meta={
        <>
          @{voiceUsername}
          {data?.generated_at && (
            <span title={absoluteAge(data.generated_at) || ""}> · {relativeAge(data.generated_at)}</span>
          )}
          {!hasContent && !isFetching && !isError && <span> · not generated yet</span>}
        </>
      }
      actions={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-card-hover hover:text-text-primary"
        >
          {open ? "Hide" : "Show"}
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      }
    >
      {open && (
        <div className="space-y-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
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

            <span className="ml-auto">
              <CockpitButton disabled={generate.isPending} onClick={handleGenerate} primary={!hasContent}>
                {generate.isPending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <RefreshCw size={13} />
                    {hasContent ? "Re-generate" : "Generate"}
                  </>
                )}
              </CockpitButton>
            </span>
          </div>

          {generate.isPending && !hasContent && (
            <div className="py-6 text-center text-sm text-text-muted">
              <Loader2 size={16} className="mb-1.5 inline-block animate-spin" />
              <div>
                One LLM call summarizing @{voiceUsername}'s last {windowDays}d. 30-90s.
              </div>
            </div>
          )}

          {generate.isError && (
            <div className="callout" style={{ "--callout": "var(--accent-red)" } as React.CSSProperties} role="alert">
              {generate.error instanceof Error && generate.error.message
                ? generate.error.message
                : "The voice brief could not be generated. Try again."}
            </div>
          )}

          {isError && !data && (
            <div className="callout flex flex-wrap items-center gap-2" style={{ "--callout": "var(--accent-red)" } as React.CSSProperties} role="alert">
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
            <div className="py-4 text-center text-sm text-text-muted">
              No brief cached for this window. Click{" "}
              <span className="font-medium text-text-primary">Generate</span>{" "}
              (single LLM call, ~30-90s).
            </div>
          )}

          {hasContent && content && <BriefBody content={content} />}
        </div>
      )}
    </Tile>
  );
}
