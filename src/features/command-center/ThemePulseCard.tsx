import { useState } from "react";
import { useIntelGraphContext, useThemePulse } from "../../api/intelGraph";
import { useAppStore } from "../../store/useAppStore";
import type { ThemePulseTicker } from "../../lib/types";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Stat } from "../../components/Glass";

interface Props {
  ticker: string;
}

const BUCKET = {
  play: { label: "Plays now", color: "var(--accent-green)" },
  watch: { label: "Watch", color: "var(--accent-yellow)" },
  wait: { label: "Wait", color: "var(--accent-red)" },
} as const;

const ROLE_LABEL: Record<string, string> = {
  PLATFORM: "platform", ENABLER: "enabler", BOTTLENECK: "bottleneck", CONSUMER: "consumer", NEUTRAL: "neutral",
};

/** One ticker row: clickable ticker + play-score + the LLM "why" + the signals
 *  that drove the score (accumulation / earnings / 30d), so the ranking stays
 *  auditable at a glance. */
function PulseRow({
  r,
  active,
  onClick,
}: {
  r: ThemePulseTicker;
  active: boolean;
  onClick: (t: string) => void;
}) {
  const accum = (r.accum_label || "").replace(/_/g, " ").toLowerCase();
  return (
    <div className={`data-row flex items-start gap-3 px-2 py-2.5 ${active ? "bg-bg-card-hover" : ""}`}>
      <button
        type="button"
        onClick={() => onClick(r.ticker)}
        className="shrink-0 w-16 text-left cursor-pointer hover:text-accent-blue"
      >
        <span className="ticker block text-sm">{r.ticker}</span>
        {r.role && <span className="block text-xs text-text-muted">{ROLE_LABEL[r.role] ?? ""}</span>}
      </button>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {r.why && <div className="text-sm leading-relaxed text-text-secondary">{r.why}</div>}
        <div className="flex flex-wrap gap-x-1.5 text-xs text-text-muted">
          {accum && <span>{accum}</span>}
          {typeof r.days_to_earnings === "number" && <span>· earnings in <span className="num">{r.days_to_earnings}d</span></span>}
          {typeof r.ret_30d === "number" && (
            <span>
              ·{" "}
              <span className="num" style={{ color: r.ret_30d >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {r.ret_30d >= 0 ? "+" : ""}{r.ret_30d.toFixed(0)}%
              </span>{" "}
              30d
            </span>
          )}
        </div>
      </div>
      <div
        className="num shrink-0 text-base font-semibold text-text-primary text-right w-9"
        title="play score (flow + catalyst + technicals + momentum)"
      >
        {r.play_score}
      </div>
    </div>
  );
}

function Bucket({
  kind,
  rows,
  active,
  onClick,
}: {
  kind: keyof typeof BUCKET;
  rows: ThemePulseTicker[];
  active: string;
  onClick: (t: string) => void;
}) {
  if (rows.length === 0) return null;
  const b = BUCKET[kind];
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-2 pb-1.5 text-sm font-semibold text-text-primary">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
        {b.label}
        <span className="num text-xs font-normal text-text-muted">{rows.length}</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((r) => (
          <PulseRow key={r.ticker} r={r} active={r.ticker === active} onClick={onClick} />
        ))}
      </div>
    </div>
  );
}

export function ThemePulseCard({ ticker }: Props) {
  const setActiveTicker = useAppStore((s) => s.setActiveTicker);
  const [expanded, setExpanded] = useState(false);
  // theme comes from the (cached) graph context — no extra request
  const { data: ctx } = useIntelGraphContext(ticker, 10);
  const theme = ctx?.theme;
  const { data, isLoading } = useThemePulse(theme);

  if (!ticker || !theme) return null;
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-5 w-40 rounded bg-text-muted/20" />
        <div className="h-12 w-full rounded bg-text-muted/10" />
        <div className="h-3 w-full rounded bg-text-muted/10" />
      </div>
    );
  }
  if (!data?.available) return null;

  const plays = data.plays ?? [];
  const watch = data.watch ?? [];
  const wait = data.wait ?? [];
  if (plays.length + watch.length + wait.length === 0) return null;

  return (
    <section className="flex flex-col gap-4" aria-label="Theme pulse">
      {/* Header: the title toggles expand/collapse; the download icon pulls
          every generated theme pulse as a CSV for manual analysis. */}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="section-title flex min-h-11 min-w-0 cursor-pointer items-center gap-1.5 text-left transition-opacity hover:opacity-90 sm:min-h-0"
          >
            Theme pulse
            {expanded ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
          </button>
          <p className="section-sub truncate">
            {theme} · <span className="num">{data.n}</span> names
          </p>
        </div>
        <a
          href="/api/intel-graph/theme-pulse/export?format=csv"
          download
          title="Download all theme pulses (CSV) for manual analysis"
          aria-label="download all theme pulses"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary sm:min-h-8 sm:min-w-8"
        >
          <Download size={15} />
        </a>
      </div>

      {!expanded ? (
        // Collapsed: bucket tally + the top plays as plain ticker links.
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            <Stat label={BUCKET.play.label} value={plays.length} />
            <Stat label={BUCKET.watch.label} value={watch.length} />
            <Stat label={BUCKET.wait.label} value={wait.length} />
          </div>
          {plays.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm">
              <span className="text-xs text-text-muted">Top plays</span>
              {plays.slice(0, 5).map((r) => (
                <button
                  key={r.ticker}
                  type="button"
                  onClick={() => setActiveTicker(r.ticker)}
                  title={r.why}
                  className="inline-flex cursor-pointer items-baseline gap-1 hover:text-accent-blue"
                >
                  <span className="ticker">{r.ticker}</span>
                  <span className="num text-xs text-text-muted">{r.play_score}</span>
                </button>
              ))}
              {plays.length > 5 && (
                <span className="num text-xs text-text-muted">+{plays.length - 5}</span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-sm font-medium text-accent-blue hover:underline cursor-pointer"
          >
            Show theme read and all <span className="num">{data.n}</span> names
          </button>
        </div>
      ) : (
        <>
          {data.theme_read && (
            <p className="prose-read max-w-[72ch] text-text-secondary">{data.theme_read}</p>
          )}

          <Bucket kind="play" rows={plays} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="watch" rows={watch} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="wait" rows={wait} active={ticker} onClick={setActiveTicker} />

          <div className="text-xs text-text-muted pt-3 border-t border-border">
            Ranked by flow accumulation, catalyst proximity, technicals, momentum, and role. Score at right.
          </div>
        </>
      )}
    </section>
  );
}
