import { useMemo, useState } from "react";
import { TrendingUp, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useThemeHeatHistory } from "../../api/themeHeat";
import { Sparkline } from "../../components/CCPrimitives";
import { Segmented } from "../../components/Glass";

/* Theme Trends — per-category options-flow "heat" (premium vs a 7-day baseline)
 * over time. Rather than plot raw noisy daily ratios on a zero-based line chart,
 * we EMA-WEIGHT each series (recent days count more) so the actual trend shows,
 * and render a HEAT MATRIX (themes × time, colour = heat) sorted hottest-first
 * with a per-theme trend arrow + sparkline. 1.0× = baseline; >1 hot, <1 cooling. */

const WINDOWS = [7, 30, 60, 90] as const;

/** EMA — recent-weighted so a real trend shows through daily noise. Nulls hold
 * the prior value so a quiet day doesn't punch a hole in the trend. */
function ema(vals: (number | null)[], span: number): (number | null)[] {
  const k = 2 / (span + 1);
  let prev: number | null = null;
  return vals.map((v) => {
    if (v == null) return prev;
    prev = prev == null ? v : v * k + prev * (1 - k);
    return prev;
  });
}

/** Heat → colour, diverging around the 1.0× baseline: cool blue below, warm red
 * above. Hardcoded data-viz palette (chart colours are exempt from the CSS-var
 * rule). */
function heatColor(r: number | null): string {
  if (r == null) return "transparent";
  if (r >= 3) return "#dc2626";
  if (r >= 2) return "#ef4444";
  if (r >= 1.5) return "#f97316";
  if (r >= 1.15) return "#f59e0b";
  if (r >= 0.85) return "#4b5563"; // ~baseline neutral
  if (r >= 0.5) return "#3b82f6";
  if (r >= 0.25) return "#2563eb";
  return "#1e3a8a";
}

function TrendArrow({ delta }: { delta: number }) {
  if (delta > 0.15)
    return <ArrowUp size={12} style={{ color: "var(--accent-green)" }} />;
  if (delta < -0.15)
    return <ArrowDown size={12} style={{ color: "var(--accent-red)" }} />;
  return <Minus size={12} style={{ color: "var(--text-muted)" }} />;
}

export function ThemeTrendsChart({ embedded = false }: { embedded?: boolean }) {
  const [days, setDays] = useState<number>(7);
  const { data, isFetching } = useThemeHeatHistory(days);

  // Smooth harder over longer windows (more points to lean on).
  const span = days <= 7 ? 3 : days <= 30 ? 4 : 6;

  const rows = useMemo(() => {
    if (!data) return [];
    return data.categories
      .map((cat) => {
        const raw = data.series[cat] || [];
        const smooth = ema(raw, span);
        const nn = smooth.filter((v): v is number => v != null);
        const current = nn.length ? nn[nn.length - 1] : 0;
        const first = nn.length ? nn[0] : 0;
        return { cat, smooth, spark: nn, current, delta: current - first };
      })
      .sort((a, b) => b.current - a.current);
  }, [data, span]);

  const hasData = data && data.dates.length > 0;

  const windowToggle = (
    <Segmented
      options={WINDOWS.map((w) => ({ value: String(w), label: <span className="num">{w}d</span> }))}
      value={String(days)}
      onChange={(v) => setDays(Number(v))}
    />
  );

  const legend = (
    <div className="flex items-center gap-1 text-xs text-text-muted">
      <span>cooling</span>
      {[0.3, 0.6, 1, 1.5, 2.5, 3.5].map((v) => (
        <span
          key={v}
          className="inline-block w-3 h-3 rounded-sm"
          style={{ background: heatColor(v) }}
        />
      ))}
      <span>hot · 1.0× = baseline · EMA-weighted</span>
    </div>
  );

  return (
    <div className={embedded ? "pt-2" : "card"}>
      <div
        className={`flex items-center justify-between flex-wrap gap-2 ${embedded ? "mb-1.5" : "mb-3"}`}
      >
        {embedded ? (
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary flex items-center gap-1">
            <TrendingUp size={11} />
            Theme trends
            <span className="normal-case tracking-normal font-normal text-text-muted ml-1">
              flow heat over time
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-accent-blue" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Theme Trends
            </h3>
          </div>
        )}
        {windowToggle}
      </div>

      {!hasData ? (
        <div className="h-[120px] flex items-center justify-center text-xs text-text-muted">
          {isFetching ? "loading…" : "No theme-heat history yet."}
        </div>
      ) : (
        <>
          <div className="mb-2">{legend}</div>

          {/* Heat matrix — one row per theme (hottest first), one cell per
              flow-day coloured by EMA-smoothed heat, then current × + trend. */}
          <div className="space-y-1">
            {rows.map((r) => (
              <div
                key={r.cat}
                className="grid items-center gap-2"
                style={{ gridTemplateColumns: "108px 1fr 84px" }}
              >
                <span
                  className="text-xs text-text-secondary truncate"
                  title={r.cat}
                >
                  {r.cat.replace(/_/g, " ")}
                </span>

                <div className="flex gap-px h-4">
                  {r.smooth.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{ background: heatColor(v), minWidth: 2 }}
                      title={`${r.cat} ${data!.dates[i]}: ${v == null ? "—" : v.toFixed(2) + "×"}`}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-end gap-1">
                  <Sparkline points={r.spark} width={36} height={14} color={heatColor(r.current)} />
                  <span
                    className="num text-xs w-9 text-right"
                    style={{ color: heatColor(r.current) }}
                  >
                    {r.current.toFixed(1)}×
                  </span>
                  <TrendArrow delta={r.delta} />
                </div>
              </div>
            ))}
          </div>

          <div className="num text-xs text-text-muted mt-2">
            {data!.dates[0]} → {data!.dates[data!.dates.length - 1]} · {data!.dates.length} flow-days
            {data!.updated_at ? ` · updated ${data!.updated_at.slice(0, 10)}` : ""}
          </div>
        </>
      )}
    </div>
  );
}
