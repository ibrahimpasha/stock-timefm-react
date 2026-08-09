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
}: {
  ticker: string;
  strike?: number | null;
  width?: number;
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

  return (
    <Link
      to={`/gex?ticker=${encodeURIComponent(ticker)}`}
      title={describe(g, strike ?? undefined)}
      aria-label={describe(g, strike ?? undefined)}
      className="relative inline-block shrink-0 rounded-full"
      style={{ width, height: 6, background: "var(--bg-card-hover)" }}
    >
      {/* spot between the walls */}
      <span
        className="absolute rounded-full"
        style={{ left: `${p * 100}%`, top: -1, width: 3, height: 8, background: tone,
                 transform: "translateX(-50%)" }}
      />
      {/* this contract's strike */}
      {kPos != null && (
        <span
          className="absolute rounded-full"
          style={{
            left: `${kPos * 100}%`, top: -3, width: 2, height: 12,
            background: outside ? "var(--accent-orange)" : "var(--text-primary)",
            opacity: outside ? 0.9 : 0.55,
            transform: "translateX(-50%)",
          }}
        />
      )}
    </Link>
  );
}
