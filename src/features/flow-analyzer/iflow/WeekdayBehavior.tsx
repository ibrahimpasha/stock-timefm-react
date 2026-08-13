/**
 * WeekdayBehavior — per-weekday return structure for one ticker, with the
 * flow/peak-P/L overlay. Answers "how does this stock behave on each weekday"
 * (the RubyBot surge/drop analysis, productized).
 *
 * Top panel: per weekday, avg surge-day return (>= +3%, green up bar), avg
 * drop-day return (<= -3%, red down bar), dots = individual surge/drop days,
 * blue tick = avg ALL-day return. One axis (daily close-to-close %).
 * Middle row: frequency mix (surge / between / drop % of trading days).
 * Bottom row: flow overlay — entries + net premium + median 10d peak P/L of
 * flow printed on that weekday (from the nightly lifetime grading corpus).
 */
import { useMemo, useState } from "react";
import { useMarketHistory } from "../../../api/forecast";
import { useEntryLifetime } from "./hooks";
import { parseLocalDate } from "../../../lib/dateOnly";
import { formatPremium } from "../../../lib/utils";
import { Segmented } from "../../../components/Glass";
import { CalendarDays } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const SURGE = 3;
const DROP = -3;

interface DayStats {
  all: number[];
  surges: number[];
  drops: number[];
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export function WeekdayBehavior({ ticker }: { ticker: string }) {
  const [months, setMonths] = useState<"3M" | "6M">("6M");
  const { data: history } = useMarketHistory(ticker, 200);
  const { data: lifetime } = useEntryLifetime(ticker);

  const stats = useMemo(() => {
    if (!history || history.length < 30) return null;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (months === "3M" ? 91 : 182));
    const byDay: DayStats[] = WEEKDAYS.map(() => ({ all: [], surges: [], drops: [] }));
    for (let i = 1; i < history.length; i++) {
      const d = parseLocalDate(history[i].date);
      if (d < cutoff) continue;
      const prev = history[i - 1].close;
      if (!prev) continue;
      const r = ((history[i].close - prev) / prev) * 100;
      const wd = d.getDay() - 1; // Mon=0..Fri=4
      if (wd < 0 || wd > 4) continue;
      byDay[wd].all.push(r);
      if (r >= SURGE) byDay[wd].surges.push(r);
      else if (r <= DROP) byDay[wd].drops.push(r);
    }
    const flow = WEEKDAYS.map(() => ({ n: 0, prem: 0, peaks: [] as number[] }));
    for (const row of lifetime?.rows ?? []) {
      const d = parseLocalDate(row.flow_date);
      if (d < cutoff) continue;
      const wd = d.getDay() - 1;
      if (wd < 0 || wd > 4) continue;
      flow[wd].n += 1;
      if (row.premium != null)
        flow[wd].prem += row.type.includes("PUT") ? -row.premium : row.premium;
      if (row.peak_pnl_pct_10d != null) flow[wd].peaks.push(row.peak_pnl_pct_10d);
    }
    return { byDay, flow, nDays: byDay.reduce((n, d) => n + d.all.length, 0) };
  }, [history, lifetime, months]);

  if (!stats || stats.nDays < 20) return null;

  // Shared symmetric y-span from the dot extremes (p95-ish via simple clamp).
  const extremes = stats.byDay.flatMap((d) => [...d.surges, ...d.drops]);
  const span = Math.max(6, Math.min(25, Math.max(...extremes.map(Math.abs), 0) * 1.08));
  const W = 520, H = 190, padL = 30, padB = 14;
  const plotW = W - padL - 6, plotH = H - padB - 8;
  const y0 = 8 + plotH / 2;
  const yOf = (v: number) => y0 - (v / span) * (plotH / 2);
  const groupW = plotW / 5;
  const barW = Math.min(26, groupW * 0.3);

  const fmtPct = (v: number | null, dp = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
          <CalendarDays size={12} className="text-accent-cyan" />
          Weekday Behavior
        </div>
        <Segmented
          options={[{ value: "3M", label: "3M" }, { value: "6M", label: "6M" }]}
          value={months}
          onChange={setMonths}
          ariaLabel="Weekday behavior window"
        />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-text-muted mb-1">
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "var(--accent-green)" }} />avg surge day (≥+{SURGE}%)</span>
        <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "var(--accent-red)" }} />avg drop day (≤{DROP}%)</span>
        <span><span className="inline-block w-2 h-0.5 align-middle mr-1" style={{ background: "var(--accent-blue)" }} />avg all days</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* zero line + surge/drop cutoffs */}
        <line x1={padL} x2={W - 4} y1={y0} y2={y0} stroke="var(--border)" strokeWidth={1} />
        {[SURGE, DROP].map((c) => (
          <line key={c} x1={padL} x2={W - 4} y1={yOf(c)} y2={yOf(c)}
            stroke="var(--text-muted)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.4} />
        ))}
        {[span, -span].map((v) => (
          <text key={v} x={padL - 4} y={yOf(v * 0.92) + 3} textAnchor="end"
            className="num" fontSize={8} fill="var(--text-muted)">
            {v > 0 ? "+" : ""}{Math.round(v)}%
          </text>
        ))}
        {stats.byDay.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const avgS = mean(d.surges), avgD = mean(d.drops), avgAll = mean(d.all);
          return (
            <g key={i}>
              {avgS != null && (
                <rect x={cx - barW - 2} y={yOf(avgS)} width={barW} height={y0 - yOf(avgS)}
                  rx={3} fill="var(--accent-green)" opacity={0.55}>
                  <title>{`${WEEKDAYS[i]}: avg surge ${fmtPct(avgS)} across ${d.surges.length} days`}</title>
                </rect>
              )}
              {avgD != null && (
                <rect x={cx + 2} y={y0} width={barW} height={yOf(avgD) - y0}
                  rx={3} fill="var(--accent-red)" opacity={0.55}>
                  <title>{`${WEEKDAYS[i]}: avg drop ${fmtPct(avgD)} across ${d.drops.length} days`}</title>
                </rect>
              )}
              {/* individual surge/drop days */}
              {d.surges.map((v, j) => (
                <circle key={`s${j}`} cx={cx - barW / 2 - 2 + ((j % 5) - 2) * 3} cy={yOf(v)} r={2}
                  fill="var(--accent-green)" stroke="var(--bg-card)" strokeWidth={0.75}>
                  <title>{`${WEEKDAYS[i]} surge ${fmtPct(v, 2)}`}</title>
                </circle>
              ))}
              {d.drops.map((v, j) => (
                <circle key={`d${j}`} cx={cx + barW / 2 + 2 + ((j % 5) - 2) * 3} cy={yOf(v)} r={2}
                  fill="var(--accent-red)" stroke="var(--bg-card)" strokeWidth={0.75}>
                  <title>{`${WEEKDAYS[i]} drop ${fmtPct(v, 2)}`}</title>
                </circle>
              ))}
              {/* avg all-day marker */}
              {avgAll != null && (
                <line x1={cx - barW - 4} x2={cx + barW + 4} y1={yOf(avgAll)} y2={yOf(avgAll)}
                  stroke="var(--accent-blue)" strokeWidth={2}>
                  <title>{`${WEEKDAYS[i]}: avg all-day ${fmtPct(avgAll, 2)} over ${d.all.length} days`}</title>
                </line>
              )}
              {avgS != null && (
                <text x={cx - barW / 2 - 2} y={Math.max(10, yOf(Math.max(...d.surges)) - 5)}
                  textAnchor="middle" className="num" fontSize={8} fill="var(--text-secondary)">
                  {fmtPct(avgS)}·n{d.surges.length}
                </text>
              )}
              {avgD != null && (
                <text x={cx + barW / 2 + 2} y={Math.min(H - padB - 4, yOf(Math.min(...d.drops)) + 10)}
                  textAnchor="middle" className="num" fontSize={8} fill="var(--text-secondary)">
                  {fmtPct(avgD)}·n{d.drops.length}
                </text>
              )}
              <text x={cx} y={H - 2} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                {WEEKDAYS[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {/* frequency mix */}
      <div className="grid grid-cols-5 gap-1.5 mt-1" style={{ paddingLeft: padL / (W / 100) + "%" }}>
        {stats.byDay.map((d, i) => {
          const n = d.all.length || 1;
          const pS = (d.surges.length / n) * 100, pD = (d.drops.length / n) * 100;
          return (
            <div key={i} title={`${WEEKDAYS[i]}: surge ${pS.toFixed(0)}% · between ${(100 - pS - pD).toFixed(0)}% · drop ${pD.toFixed(0)}% of ${d.all.length} days`}>
              <div className="flex h-2 rounded-full overflow-hidden" style={{ gap: 1 }}>
                <div style={{ width: `${pS}%`, background: "var(--accent-green)" }} />
                <div style={{ width: `${100 - pS - pD}%`, background: "var(--border)" }} />
                <div style={{ width: `${pD}%`, background: "var(--accent-red)" }} />
              </div>
              <div className="flex justify-between text-[9px] num mt-0.5">
                <span style={{ color: "var(--accent-green)" }}>{pS.toFixed(0)}%</span>
                <span style={{ color: "var(--accent-red)" }}>{pD.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* flow + peak P/L overlay */}
      <div className="grid grid-cols-5 gap-1.5 mt-2 pt-2 border-t border-border">
        {stats.flow.map((f, i) => {
          const med = median(f.peaks);
          return (
            <div key={i} className="text-[9px] num leading-tight"
              title={`${WEEKDAYS[i]}: ${f.n} flow prints in window · net premium ${formatPremium(Math.abs(f.prem))} ${f.prem >= 0 ? "bull" : "bear"} · median 10d peak P/L ${fmtPct(med)} (${f.peaks.length} graded)`}>
              <div className="text-text-muted">{f.n} fl · <span style={{ color: f.prem >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{formatPremium(Math.abs(f.prem))}</span></div>
              <div>
                <span className="text-text-muted">pk </span>
                <span style={{ color: med == null ? "var(--text-muted)" : med >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                  {fmtPct(med, 0)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-text-muted mt-1">
        close-to-close daily returns, last {months === "3M" ? "3" : "6"} months · flow row = prints landed that weekday, median 10d peak P/L from the nightly grading corpus
      </div>
    </div>
  );
}
