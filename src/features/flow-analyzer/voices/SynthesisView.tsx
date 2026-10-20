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
import { CockpitButton, KpiTile, Tile, TileGrid } from "../../../components/Cockpit";
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

/** Weighted sector row; wider label column than Cockpit BarRow (sector names, not tickers). */
function SectorBar({ sector, pct, lean, notes }: { sector: string; pct: number; lean?: string | null; notes?: string | null }) {
  return (
    <div className="space-y-0.5" title={notes ? `${sector}: ${notes}` : sector}>
      <div className="grid min-h-6 grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-2.5">
        <span className="truncate text-sm capitalize text-text-primary">{sector}</span>
        <div className="h-3.5 rounded-[3px]" style={{ background: "var(--track)" }}>
          <div className="h-3.5 rounded-[3px]" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: sentColor(lean) }} />
        </div>
        <span className="num text-right text-sm font-semibold" style={{ color: sentColor(lean) }}>{pct}%</span>
      </div>
      {notes && <p className="m-0 pl-[8.625rem] text-xs leading-relaxed text-text-muted">{notes}</p>}
    </div>
  );
}

function PickTicker({ t, size = "sm" }: { t: string; size?: "sm" | "base" }) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  return (
    <button
      type="button"
      onClick={() => setActiveTicker(t)}
      className={`ticker inline-block hover:text-accent ${size === "base" ? "text-base" : "text-sm"}`}
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
  const hasSectors = content.sector_focus.length > 0;
  const hasWatch = content.watch_list.length > 0;
  return (
    <TileGrid>
      {/* Lead: the overall read is the focal point of the page (long-form reading, serif) */}
      <Tile span={hasSectors ? 8 : 12} title="Overall read" actions={<SentBadge s={content.overall_sentiment} />}>
        <p className="m-0 max-w-[68ch] font-display text-2xl leading-snug text-text-primary text-pretty">
          {content.overall_view || "—"}
        </p>
        <div className="max-w-[68ch] space-y-1 border-t border-border pt-3">
          <h3 className="m-0 text-sm font-semibold text-text-primary">Dominant thesis</h3>
          <p className="prose-read m-0 whitespace-pre-wrap">{content.top_thesis || "—"}</p>
        </div>
      </Tile>

      {hasSectors && (
        <Tile span={4} title="Sector focus" meta={`${content.sector_focus.length} sectors · weight of discussion`}>
          {content.sector_focus.map((s) => (
            <SectorBar key={s.sector} sector={s.sector} pct={s.weight_pct} lean={s.lean} notes={s.notes} />
          ))}
        </Tile>
      )}

      {content.high_conviction.length > 0 && (
        <Tile
          span={hasWatch ? 8 : 12}
          title="High conviction"
          meta={`${content.high_conviction.length} names · thesis distilled per name`}
        >
          <div className="divide-y divide-border">
            {content.high_conviction.map((h) => (
              <div key={h.ticker} className="grid gap-x-5 gap-y-1 py-3.5 first:pt-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-1">
                  <PickTicker t={h.ticker} size="base" />
                  <SentBadge s={h.sentiment} />
                  <span className="num text-xs text-text-muted" title="Evidence count">
                    {h.evidence_count} mentions
                  </span>
                </div>
                <p className="prose-read m-0 max-w-[68ch]">{h.thesis}</p>
              </div>
            ))}
          </div>
        </Tile>
      )}

      {hasWatch && (
        <Tile span={content.high_conviction.length > 0 ? 4 : 12} title="Watch list" meta={`${content.watch_list.length} names`}>
          <div className="divide-y divide-border">
            {content.watch_list.map((w, idx) => (
              <div key={idx} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 py-2.5 first:pt-0">
                <PickTicker t={w.ticker} />
                <span className="text-sm leading-relaxed text-text-secondary">{w.why_watch}</span>
              </div>
            ))}
          </div>
        </Tile>
      )}

      {content.bottlenecks.length > 0 && (
        <Tile span={content.private_companies.length > 0 ? 6 : 12} title="Bottlenecks and chokepoints" meta={`${content.bottlenecks.length}`}>
          <ul className="m-0 list-none space-y-4 p-0">
            {content.bottlenecks.map((b, idx) => (
              <li key={idx} className="space-y-1">
                <p className="m-0 text-sm leading-relaxed text-text-primary">{b.description}</p>
                {b.exposed_tickers.length > 0 && (
                  <p className="m-0 text-xs text-text-muted">
                    Exposed <span className="ml-1"><TickerList tickers={b.exposed_tickers} /></span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {content.private_companies.length > 0 && (
        <Tile span={content.bottlenecks.length > 0 ? 6 : 12} title="Private companies, public proxies" meta={`${content.private_companies.length}`}>
          <ul className="m-0 list-none space-y-4 p-0">
            {content.private_companies.map((p, idx) => (
              <li key={idx} className="space-y-1">
                <h4 className="m-0 text-sm font-semibold text-text-primary">{p.name}</h4>
                <p className="m-0 text-sm leading-relaxed text-text-secondary">{p.rationale}</p>
                {p.public_proxies.length > 0 && (
                  <p className="m-0 text-xs text-text-muted">
                    Proxies <span className="ml-1"><TickerList tickers={p.public_proxies} /></span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {content.emerging_themes.length > 0 && (
        <Tile span={12} title="Emerging themes" meta={`${content.emerging_themes.length}`}>
          <ul className="m-0 grid list-none gap-x-8 gap-y-3 p-0 md:grid-cols-2 xl:grid-cols-3">
            {content.emerging_themes.map((t, idx) => (
              <li key={idx}>
                <div className="text-sm font-semibold text-text-primary">{t.theme}</div>
                <p className="m-0 text-sm leading-relaxed text-text-secondary">{t.rationale}</p>
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </TileGrid>
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

        <span className="ml-auto">
          <CockpitButton disabled={generate.isPending} onClick={handleGenerate} primary={!hasContent}>
            {generate.isPending ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Synthesizing…
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                {hasContent ? "Re-synthesize" : "Generate"}
              </>
            )}
          </CockpitButton>
        </span>
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
          <h3 className="m-0 text-base font-semibold text-text-primary">No synthesis yet</h3>
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
          <TileGrid>
            <KpiTile
              label="Overall lean"
              value={<span className="capitalize" style={{ color: sentColor(content.overall_sentiment) }}>{content.overall_sentiment ?? "—"}</span>}
              sub={`@${voice} · ${windowDays}d window`}
            />
            <KpiTile label="Tweets read" value={data?.n_tweets ?? "—"} sub="in one LLM call" />
            <KpiTile
              label="High conviction"
              value={content.high_conviction.length}
              sub={content.high_conviction.slice(0, 4).map((h) => h.ticker).join(" ") || "none"}
            />
            <KpiTile
              label="Generated"
              value={data?.generated_at ? <span title={absoluteAge(data.generated_at) || ""}>{relativeAge(data.generated_at)}</span> : "—"}
              sub={stale ? "older than 24h" : "fresh"}
            />
          </TileGrid>
          <Body content={content} />
        </>
      )}
    </div>
  );
}
