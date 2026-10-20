import { useState } from "react";
import { useIntelGraphContext, useThemePulse } from "../../api/intelGraph";
import { useAppStore } from "../../store/useAppStore";
import type { ThemePulseTicker } from "../../lib/types";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

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
    <div className={`flex items-start gap-3 rounded-md px-2 py-2 ${active ? "bg-bg-card-hover" : ""}`}>
      <button
        type="button"
        onClick={() => onClick(r.ticker)}
        className="shrink-0 w-16 text-left cursor-pointer hover:text-accent-blue"
      >
        <span className="num block text-sm font-semibold text-text-primary">{r.ticker}</span>
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
        className="num shrink-0 text-sm font-semibold text-text-primary text-right w-8"
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
      <div className="flex items-center gap-2 px-2 pb-1 text-sm font-semibold text-text-primary">
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
      <div className="card animate-pulse">
        <div className="h-4 w-40 rounded bg-text-muted/20 mb-3" />
        <div className="h-12 w-full rounded bg-text-muted/10 mb-2" />
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
    <div className="card flex flex-col gap-3">
      {/* Header: the title toggles expand/collapse; the download icon pulls
          every generated theme pulse as a CSV for manual analysis. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 min-w-0 basis-full cursor-pointer items-center gap-1.5 text-sm font-semibold text-text-primary transition-opacity hover:opacity-90 sm:min-h-0 sm:basis-auto sm:flex-1"
        >
          {expanded ? <ChevronDown size={14} className="text-text-muted" /> : <ChevronRight size={14} className="text-text-muted" />}
          Theme pulse
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
            {theme} · <span className="num">{data.n}</span> names
          </span>
          <a
            href="/api/intel-graph/theme-pulse/export?format=csv"
            download
            title="Download all theme pulses (CSV) for manual analysis"
            aria-label="download all theme pulses"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:text-text-primary sm:min-h-0 sm:min-w-0"
          >
            <Download size={14} />
          </a>
        </div>
      </div>

      {!expanded ? (
        // Collapsed: bucket tally + the top plays as plain ticker links.
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
            {(["play", "watch", "wait"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: BUCKET[k].color }} />
                <span className="num font-semibold text-text-primary">
                  {k === "play" ? plays.length : k === "watch" ? watch.length : wait.length}
                </span>
                {k === "play" ? "plays" : k}
              </span>
            ))}
          </div>
          {plays.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {plays.slice(0, 5).map((r) => (
                <button
                  key={r.ticker}
                  type="button"
                  onClick={() => setActiveTicker(r.ticker)}
                  title={r.why}
                  className="num inline-flex items-baseline gap-1 cursor-pointer text-text-primary hover:text-accent-blue"
                >
                  <span className="font-semibold">{r.ticker}</span>
                  <span className="text-xs text-text-muted">{r.play_score}</span>
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
            className="text-xs text-text-muted hover:text-text-secondary text-left cursor-pointer transition-colors"
          >
            Show theme read and all <span className="num">{data.n}</span> names
          </button>
        </div>
      ) : (
        <>
          {data.theme_read && (
            <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">{data.theme_read}</p>
          )}

          <Bucket kind="play" rows={plays} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="watch" rows={watch} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="wait" rows={wait} active={ticker} onClick={setActiveTicker} />

          <div className="text-xs text-text-muted pt-3 border-t border-border">
            Ranked by flow accumulation, catalyst proximity, technicals, momentum, and role.
          </div>
        </>
      )}
    </div>
  );
}
