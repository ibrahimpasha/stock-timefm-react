import { useState } from "react";
import { useIntelGraphContext, useThemePulse } from "../../api/intelGraph";
import { useAppStore } from "../../store/useAppStore";
import type { ThemePulseTicker } from "../../lib/types";
import { Activity, TrendingUp, Eye, PauseCircle, ChevronDown, ChevronRight, Download } from "lucide-react";

interface Props {
  ticker: string;
}

const BUCKET = {
  play: { label: "Plays now", color: "var(--accent-green)", icon: <TrendingUp size={11} /> },
  watch: { label: "Watch", color: "var(--accent-yellow, #eab308)", icon: <Eye size={11} /> },
  wait: { label: "Wait", color: "var(--accent-red)", icon: <PauseCircle size={11} /> },
} as const;

const ROLE_ABBR: Record<string, string> = {
  PLATFORM: "PLAT", ENABLER: "ENAB", BOTTLENECK: "BOTT", CONSUMER: "CONS", NEUTRAL: "NEUT",
};

/** One ticker row: clickable ticker + play-score + the LLM "why" + the signal
 *  chips that drove the score (accumulation / earnings / 30d), so the ranking
 *  stays auditable at a glance. */
function PulseRow({
  r,
  color,
  active,
  onClick,
}: {
  r: ThemePulseTicker;
  color: string;
  active: boolean;
  onClick: (t: string) => void;
}) {
  const accum = (r.accum_label || "").replace(/_/g, " ").toLowerCase();
  return (
    <div
      className="flex items-start gap-2 py-1 border-l-2 pl-2"
      style={{ borderColor: active ? color : "transparent" }}
    >
      <button
        type="button"
        onClick={() => onClick(r.ticker)}
        className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono hover:bg-bg-card-hover cursor-pointer transition-colors"
        style={{ background: `${color}14`, color, border: `1px solid ${color}33`, minWidth: 56 }}
      >
        <span className="font-semibold">{r.ticker}</span>
        {r.role && <span className="text-[9px] opacity-60">{ROLE_ABBR[r.role] ?? ""}</span>}
      </button>
      <div
        className="shrink-0 font-mono text-xs tabular-nums pt-0.5"
        style={{ color, width: 22, textAlign: "right" }}
        title="play score (flow + catalyst + technicals + momentum)"
      >
        {r.play_score}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        {r.why && <div className="text-xs leading-snug text-text-secondary">{r.why}</div>}
        <div className="flex flex-wrap gap-1 text-[10px] font-mono text-text-muted">
          {accum && <span style={{ color: r.bucket === "wait" ? "var(--text-muted)" : color }}>{accum}</span>}
          {typeof r.days_to_earnings === "number" && <span>· ER {r.days_to_earnings}d</span>}
          {typeof r.ret_30d === "number" && (
            <span style={{ color: r.ret_30d >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
              · {r.ret_30d >= 0 ? "+" : ""}{r.ret_30d.toFixed(0)}% 30d
            </span>
          )}
        </div>
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
    <div className="flex flex-col gap-0.5">
      <div
        className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider pt-1"
        style={{ color: b.color }}
      >
        {b.icon}
        {b.label}
        <span className="opacity-50">· {rows.length}</span>
      </div>
      {rows.map((r) => (
        <PulseRow key={r.ticker} r={r} color={b.color} active={r.ticker === active} onClick={onClick} />
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
    <div className="card flex flex-col gap-2">
      {/* Header: the title toggles expand/collapse; the download icon pulls
          every generated theme pulse as a CSV for manual analysis. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer hover:opacity-90 transition-opacity text-xs font-mono uppercase tracking-wider text-text-secondary"
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <Activity size={14} className="text-accent-cyan" />
          Theme Pulse
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono text-text-muted">
            {theme} · {data.n} names
          </span>
          <a
            href="/api/intel-graph/theme-pulse/export?format=csv"
            download
            title="Download all theme pulses (CSV) for manual analysis"
            aria-label="download all theme pulses"
            className="text-text-muted hover:text-accent-cyan transition-colors"
          >
            <Download size={13} />
          </a>
        </div>
      </div>

      {!expanded ? (
        // Collapsed (~quarter height): bucket tally + the top plays as chips.
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span style={{ color: BUCKET.play.color }}>{plays.length} plays</span>
            <span className="text-text-muted">·</span>
            <span style={{ color: BUCKET.watch.color }}>{watch.length} watch</span>
            <span className="text-text-muted">·</span>
            <span style={{ color: BUCKET.wait.color }}>{wait.length} wait</span>
          </div>
          {plays.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {plays.slice(0, 5).map((r) => (
                <button
                  key={r.ticker}
                  type="button"
                  onClick={() => setActiveTicker(r.ticker)}
                  title={r.why}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono hover:bg-bg-card-hover cursor-pointer transition-colors"
                  style={{
                    background: `${BUCKET.play.color}14`,
                    color: BUCKET.play.color,
                    border: `1px solid ${BUCKET.play.color}33`,
                  }}
                >
                  <span className="font-semibold">{r.ticker}</span>
                  <span className="opacity-60 tabular-nums">{r.play_score}</span>
                </button>
              ))}
              {plays.length > 5 && (
                <span className="text-[10px] font-mono text-text-muted">+{plays.length - 5}</span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[10px] font-mono text-text-muted hover:text-text-secondary text-left cursor-pointer"
          >
            show theme read + all {data.n} names →
          </button>
        </div>
      ) : (
        <>
          {data.theme_read && (
            <p className="text-xs leading-relaxed text-text-secondary">{data.theme_read}</p>
          )}

          <Bucket kind="play" rows={plays} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="watch" rows={watch} active={ticker} onClick={setActiveTicker} />
          <Bucket kind="wait" rows={wait} active={ticker} onClick={setActiveTicker} />

          <div className="text-[10px] font-mono text-text-muted pt-1 border-t border-border">
            ranked by flow accumulation · catalyst proximity · technicals · momentum · role
          </div>
        </>
      )}
    </div>
  );
}
