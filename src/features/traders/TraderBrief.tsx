/**
 * TraderBrief — collapsible LLM digest panel inside the trader detail view.
 *
 * Mirrors the Voices SynthesisView pattern: one click → one Claude call →
 * structured brief covering current view, trading style, open thesis,
 * sectors, active positions, watchlist, recent outcomes, catalysts, style.
 *
 * Renders BETWEEN the trader header card and the Positions list inside
 * TraderProfile. Defaults to collapsed; hits cache if generated in last 24h.
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
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { relativeAge, absoluteAge } from "../../lib/utils";
import {
  useTraderBrief,
  useGenerateTraderBrief,
  type TraderBriefContent,
} from "../../api/alerts";

const WINDOW_OPTIONS: { label: string; days: number }[] = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
];

const STYLE_COLORS: Record<string, string> = {
  scalp: "var(--accent-orange)",
  swing: "var(--accent-blue)",
  leap: "var(--accent-purple)",
  mixed: "var(--text-secondary)",
  defensive: "var(--accent-green)",
};

function sectorLeanColor(lean: string): string {
  if (lean === "bullish") return "var(--accent-green)";
  if (lean === "bearish") return "var(--accent-red)";
  if (lean === "mixed") return "var(--accent-orange)";
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

function BriefBody({ content }: { content: TraderBriefContent }) {
  const styleColor = STYLE_COLORS[content.trading_style] ?? "var(--text-secondary)";
  return (
    <div className="space-y-3">
      {/* Hero — current view + trading style */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs uppercase text-text-muted font-semibold">
            Style
          </span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs uppercase font-bold"
            style={{
              background: `${styleColor}20`,
              color: styleColor,
              border: `1px solid ${styleColor}40`,
            }}
          >
            {content.trading_style}
          </span>
        </div>
        <p className="text-sm text-text-primary leading-relaxed">
          {content.current_view}
        </p>
      </div>

      {/* Open thesis */}
      {content.open_thesis && (
        <Section icon={Target} title="Open Thesis">
          <p className="text-sm text-text-secondary italic leading-relaxed border-l-2 border-accent-purple pl-3 whitespace-pre-wrap">
            {content.open_thesis}
          </p>
        </Section>
      )}

      {/* Sectors */}
      {content.sectors_focus.length > 0 && (
        <Section
          icon={Sparkles}
          title="Sectors in Focus"
          count={content.sectors_focus.length}
        >
          <div className="space-y-1">
            {content.sectors_focus.map((s) => (
              <div key={s.sector} className="flex items-center gap-2">
                <span className="text-xs text-text-primary capitalize w-40 truncate">
                  {s.sector}
                </span>
                <div className="flex-1 h-2 rounded-full bg-bg-card overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, s.weight_pct)}%`,
                      background: sectorLeanColor(s.lean),
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-text-muted w-10 text-right">
                  {s.weight_pct}%
                </span>
                <span
                  className="text-xs uppercase font-semibold"
                  style={{ color: sectorLeanColor(s.lean) }}
                >
                  {s.lean[0]}
                </span>
              </div>
            ))}
            {content.sectors_focus.some((s) => s.notes) && (
              <div className="mt-1.5 space-y-0.5 text-sm text-text-secondary leading-snug">
                {content.sectors_focus
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

      {/* Active positions recap */}
      {content.active_positions_recap.length > 0 && (
        <Section
          icon={Target}
          title="Active Positions"
          count={content.active_positions_recap.length}
        >
          <div className="space-y-1.5">
            {content.active_positions_recap.map((p, idx) => (
              <div key={`${p.ticker}-${idx}`} className="text-sm leading-snug">
                <div className="flex items-baseline gap-2">
                  <PickTicker t={p.ticker} />
                  <span className="text-text-secondary">{p.thesis}</span>
                </div>
                {p.current_view && (
                  <div className="text-xs text-text-muted ml-12">
                    Latest: {p.current_view}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Watching */}
      {content.watching.length > 0 && (
        <Section
          icon={Eye}
          title="Watching (no position yet)"
          count={content.watching.length}
        >
          <div className="space-y-1">
            {content.watching.map((w, idx) => (
              <div key={`${w.ticker}-${idx}`} className="text-sm leading-snug">
                <PickTicker t={w.ticker} />
                <span className="text-text-muted ml-2">{w.why_watching}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Recent outcomes */}
      {content.recent_outcomes.length > 0 && (
        <Section
          icon={TrendingUp}
          title="Recent Outcomes"
          count={content.recent_outcomes.length}
        >
          <div className="space-y-1">
            {content.recent_outcomes.map((o, idx) => {
              const isWin = o.outcome.includes("+");
              const isLoss = o.outcome.includes("-");
              const color = isWin
                ? "var(--accent-green)"
                : isLoss
                  ? "var(--accent-red)"
                  : "var(--text-secondary)";
              return (
                <div
                  key={`${o.ticker}-${idx}`}
                  className="flex items-baseline gap-2 text-sm leading-snug"
                >
                  <PickTicker t={o.ticker} />
                  <span
                    className="font-mono font-semibold text-xs"
                    style={{ color }}
                  >
                    {o.outcome}
                  </span>
                  {o.note && (
                    <span className="text-text-muted">{o.note}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Catalysts */}
      {content.catalysts_flagged.length > 0 && (
        <Section
          icon={Calendar}
          title="Catalysts Flagged"
          count={content.catalysts_flagged.length}
        >
          <ul className="space-y-0.5 text-sm text-text-secondary leading-snug">
            {content.catalysts_flagged.map((c, idx) => (
              <li key={idx}>• {c}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Style notes */}
      {content.style_notes && (
        <Section icon={Sparkles} title="Style Notes">
          <p className="text-sm text-text-secondary leading-snug">
            {content.style_notes}
          </p>
        </Section>
      )}
    </div>
  );
}

export function TraderBrief({ author }: { author: string }) {
  const [open, setOpen] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(7);
  const { data, isFetching, refetch } = useTraderBrief(author, windowDays, 720);
  const generate = useGenerateTraderBrief();

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({ author, windowDays });
      await refetch();
    } catch (err) {
      console.error("trader-brief generate failed", err);
    }
  };

  const content = data?.content ?? null;
  const hasContent = !!content;

  return (
    <div className="card p-3">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-accent-purple" />
          <span className="text-sm font-semibold text-text-primary">
            Trader Brief
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

            {data?.n_messages != null && (
              <span className="text-xs text-text-muted">
                {data.n_messages} msgs
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
              <div>One LLM call summarizing this trader's last {windowDays}d. 30-90s.</div>
            </div>
          )}

          {!generate.isPending && !hasContent && (
            <div className="text-center py-4 text-sm text-text-muted">
              No brief cached. Click{" "}
              <span className="text-accent-purple">Generate</span> above (single
              LLM call, ~30-90s).
            </div>
          )}

          {hasContent && content && <BriefBody content={content} />}
        </div>
      )}
    </div>
  );
}
