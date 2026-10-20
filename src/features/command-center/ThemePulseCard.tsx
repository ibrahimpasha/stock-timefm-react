import { useState } from "react";
import { useIntelGraphContext, useThemePulse } from "../../api/intelGraph";
import { useAppStore } from "../../store/useAppStore";
import type { ThemePulseTicker } from "../../lib/types";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { BarRow, Kpi, Tile } from "../../components/Cockpit";

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

/** One ticker row: play-score bar (click = make active) + the LLM "why" and
 *  the signals that drove the score, so the ranking stays auditable. */
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
  const meta = [
    r.role ? ROLE_LABEL[r.role] ?? "" : "",
    accum,
    typeof r.days_to_earnings === "number" ? `earnings in ${r.days_to_earnings}d` : "",
  ].filter(Boolean);
  return (
    <div className={`flex flex-col gap-0.5 rounded-md py-1 ${active ? "bg-bg-card-hover" : ""}`}>
      <BarRow
        label={r.ticker}
        value={r.play_score}
        max={100}
        tone="info"
        display={r.play_score}
        trailing={
          typeof r.ret_30d === "number" ? (
            <span style={{ color: r.ret_30d >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
              {r.ret_30d >= 0 ? "+" : ""}
              {r.ret_30d.toFixed(0)}%
            </span>
          ) : (
            ""
          )
        }
        onClick={() => onClick(r.ticker)}
        title="play score (flow + catalyst + technicals + momentum) · 30d return"
      />
      {(r.why || meta.length > 0) && (
        <p className="pl-[4.875rem] pr-1 text-xs leading-relaxed text-text-muted">
          {r.why && <span className="text-text-secondary">{r.why}</span>}
          {r.why && meta.length > 0 ? " · " : ""}
          {meta.join(" · ")}
        </p>
      )}
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 pt-2 text-xs font-semibold text-text-secondary">
        <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: b.color }} />
        {b.label}
        <span className="num font-normal text-text-muted">{rows.length}</span>
        <span className="ml-auto font-normal text-text-muted">score · 30d</span>
      </div>
      {rows.map((r) => (
        <PulseRow key={r.ticker} r={r} active={r.ticker === active} onClick={onClick} />
      ))}
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
      <div className="flex animate-pulse flex-col gap-3 rounded-xl border border-border bg-bg-card p-4">
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

  const total = plays.length + watch.length + wait.length;

  return (
    <Tile
      title={
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 cursor-pointer items-center gap-1.5 text-left hover:text-accent sm:min-h-0"
        >
          Theme pulse
          {expanded ? <ChevronDown size={15} className="text-text-muted" /> : <ChevronRight size={15} className="text-text-muted" />}
        </button>
      }
      meta={
        <span className="truncate">
          {theme} · <span className="num">{data.n}</span> names
        </span>
      }
      actions={
        <a
          href="/api/intel-graph/theme-pulse/export?format=csv"
          download
          title="Download all theme pulses (CSV) for manual analysis"
          aria-label="download all theme pulses"
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-card-hover hover:text-text-primary sm:min-h-8 sm:min-w-8"
        >
          <Download size={15} />
        </a>
      }
    >
      {/* Bucket mix: one stacked bar + counts */}
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--track)" }} aria-hidden>
        {(["play", "watch", "wait"] as const).map((k) => {
          const n = k === "play" ? plays.length : k === "watch" ? watch.length : wait.length;
          return n > 0 ? <span key={k} style={{ width: `${(n / total) * 100}%`, background: BUCKET[k].color }} /> : null;
        })}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={BUCKET.play.label} value={plays.length} size="md" />
        <Kpi label={BUCKET.watch.label} value={watch.length} size="md" />
        <Kpi label={BUCKET.wait.label} value={wait.length} size="md" />
      </div>

      {!expanded ? (
        <>
          {plays.length > 0 && (
            <div className="flex flex-col gap-1 pt-1">
              <span className="text-xs text-text-muted">Top plays · score</span>
              {plays.slice(0, 5).map((r) => (
                <BarRow
                  key={r.ticker}
                  label={r.ticker}
                  value={r.play_score}
                  max={100}
                  tone="info"
                  display={r.play_score}
                  onClick={() => setActiveTicker(r.ticker)}
                  title={r.why}
                />
              ))}
              {plays.length > 5 && <span className="num text-xs text-text-muted">+{plays.length - 5} more</span>}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-sm font-medium text-accent hover:underline cursor-pointer"
          >
            Show theme read and all <span className="num">{data.n}</span> names
          </button>
        </>
      ) : (
        <>
          {data.theme_read && (
            <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">{data.theme_read}</p>
          )}

          <Bucket kind="play" rows={plays} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="watch" rows={watch} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="wait" rows={wait} active={ticker} onClick={setActiveTicker} />

          <div className="border-t border-border pt-3 text-xs text-text-muted">
            Ranked by flow accumulation, catalyst proximity, technicals, momentum, and role. Score at right.
          </div>
        </>
      )}
    </Tile>
  );
}
