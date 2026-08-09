/**
 * Inline dealer-gamma context.
 *
 * GEX matters at the moment you're judging a specific contract, not on a page
 * you have to remember to visit — so this renders wherever a strike is shown
 * (Top Conviction Flow, Top Signals, persona positions).
 *
 * Reads `useTickerGex()`, which is ONE batched call covering all ~192 tracked
 * tickers and is already cached for an hour. Mounting this on 15 rows costs
 * zero extra requests. The deep per-strike grid (`/gex`) only exists for a
 * dozen names, so it's a link, never a dependency.
 */
import { Link } from "react-router-dom";
import { useTickerGex, type TickerGex } from "../../api/tickerGex";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where spot sits between the walls: 0 = at the put wall, 1 = at the call wall. */
export function wallPosition(g: TickerGex | undefined): number | null {
  if (!g || g.put_wall == null || g.call_wall == null || g.price == null) return null;
  if (!(g.call_wall > g.put_wall) || !(g.price > 0)) return null;
  return clamp((g.price - g.put_wall) / (g.call_wall - g.put_wall), 0, 1);
}

/** -1..+1 dealer-structure tilt. Near the put wall = room above (+). */
export function wallTilt(g: TickerGex | undefined): number | null {
  const p = wallPosition(g);
  return p == null ? null : 1 - 2 * p;
}

function describe(g: TickerGex, strike?: number): string {
  const p = wallPosition(g);
  const where =
    p == null ? "walls unusable"
      : p < 0.25 ? "at put wall — dealer support, room above"
      : p > 0.75 ? "pressed into call wall — resistance"
      : "mid-range between walls";
  const k = strike && g.call_wall != null && g.put_wall != null
    ? strike > g.call_wall ? ` · strike $${strike} is ABOVE the call wall (needs a gamma break)`
      : strike < g.put_wall ? ` · strike $${strike} is BELOW the put wall`
      : ` · strike $${strike} sits inside the walls`
    : "";
  return `Dealer walls $${g.put_wall ?? "?"}–$${g.call_wall ?? "?"}, spot $${
    g.price?.toFixed(2) ?? "?"} — ${where}${k}. Net GEX ${g.net_gex ?? "?"} (${g.regime || "?"}).`;
}

/**
 * Compact wall bar: put wall ─── spot ─── call wall, with the contract's own
 * strike marked when given. Renders nothing when the ticker has no usable
 * wall data, so it never leaves a hole in a dense row.
 */
export function GexWall({
  ticker,
  strike,
  width = 56,
  showLabel = false,
}: {
  ticker: string;
  strike?: number | null;
  width?: number;
  /** Adds the plain-word verdict (room / mid / at wall) next to the bar. */
  showLabel?: boolean;
}) {
  const { data } = useTickerGex();
  const g = data?.[String(ticker || "").toUpperCase()];
  const p = wallPosition(g);
  if (!g || p == null) return null;

  const pw = g.put_wall as number;
  const cw = g.call_wall as number;
  // Strike can sit outside the walls — clamp the marker but keep the flag so
  // the caller still sees it's out of range.
  const kRaw = strike ? (strike - pw) / (cw - pw) : null;
  const kPos = kRaw == null ? null : clamp(kRaw, 0, 1);
  const outside = kRaw != null && (kRaw < 0 || kRaw > 1);

  const tone = p < 0.25 ? "var(--accent-green)"
    : p > 0.75 ? "var(--accent-red)"
      : "var(--accent-yellow)";
  // The word is what makes this readable at a glance; the bar is the detail.
  const word = p < 0.25 ? "room" : p > 0.75 ? "at wall" : "mid";

  return (
    <Link
      to={`/gex?ticker=${encodeURIComponent(ticker)}`}
      title={describe(g, strike ?? undefined)}
      aria-label={describe(g, strike ?? undefined)}
      className="inline-flex items-center gap-1 shrink-0 no-underline"
    >
      <span className="text-[9px] font-semibold text-text-muted leading-none">P</span>
      <span
        className="relative inline-block rounded-full"
        style={{ width, height: 6, background: "var(--bg-card-hover)" }}
      >
        {/* spot between the walls */}
        <span
          className="absolute rounded-full"
          style={{ left: `${p * 100}%`, top: -1, width: 3, height: 8, background: tone,
                   transform: "translateX(-50%)" }}
        />
        {/* this contract's strike — hollow caret so it can't be mistaken for spot */}
        {kPos != null && (
          <span
            className="absolute"
            style={{
              left: `${kPos * 100}%`, top: -5, width: 0, height: 0,
              borderLeft: "3px solid transparent",
              borderRight: "3px solid transparent",
              borderTop: `4px solid ${outside ? "var(--accent-orange)" : "var(--text-primary)"}`,
              opacity: outside ? 1 : 0.65,
              transform: "translateX(-50%)",
            }}
          />
        )}
      </span>
      <span className="text-[9px] font-semibold text-text-muted leading-none">C</span>
      {showLabel && (
        <span className="text-[10px] leading-none" style={{ color: tone }}>{word}</span>
      )}
    </Link>
  );
}

/**
 * One-line explainer. Render once per panel that shows GexWall bars — the bar
 * is compact enough to be cryptic without it.
 */
export function GexWallLegend() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-text-muted mb-1.5">
      <span className="font-semibold">P</span>
      <span className="inline-block rounded-full" style={{ width: 28, height: 5, background: "var(--bg-card-hover)" }} />
      <span className="font-semibold">C</span>
      <span>
        put wall → call wall · <span style={{ color: "var(--accent-green)" }}>▮</span> spot
        (<span style={{ color: "var(--accent-green)" }}>green</span> = at put wall, support with room above;{" "}
        <span style={{ color: "var(--accent-red)" }}>red</span> = pressed into call wall) ·{" "}
        <span style={{ color: "var(--text-primary)" }}>▲</span> this strike
        (<span style={{ color: "var(--accent-orange)" }}>orange</span> = outside the walls). Hover for detail.
      </span>
    </div>
  );
}
