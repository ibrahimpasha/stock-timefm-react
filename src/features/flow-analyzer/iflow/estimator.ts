/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ⚠  ESTIMATOR PARITY — DO NOT DIVERGE                                    ║
 * ║                                                                          ║
 * ║  This is the canonical TS option P/L estimator. Its Python mirror is     ║
 * ║  `_estimate_option_pnl_pct()` in                                         ║
 * ║      ~/stock-timefm/server/api_routes.py                                 ║
 * ║                                                                          ║
 * ║  The Python version powers /flow/iflow/returns ranking; this version     ║
 * ║  powers per-row P/L badges. If they drift, badges and the Highest        ║
 * ║  Returns sort will disagree — silently.                                  ║
 * ║                                                                          ║
 * ║  Keep these aligned, byte-for-byte:                                      ║
 * ║    - moneyness → delta bucket boundaries                                 ║
 * ║    - gamma boost on >5% move                                             ║
 * ║    - theta = optFill / (effective_dte * 1.8)                             ║
 * ║    - theta cap at 60% of premium                                         ║
 * ║    - -100% floor, no upper cap                                           ║
 * ║    - 2-decimal rounding                                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Estimate option P/L % using delta approximation + linear time decay.
 *
 * Approach:
 *   1. Estimate delta from moneyness (ATM ~0.50, ITM 0.58-0.72, OTM 0.10-0.35)
 *   2. Boost delta when stock moved >5% (gamma effect, capped at 0.90)
 *   3. Option price change ≈ delta × stock_move − theta × days_elapsed
 *   4. Theta capped at 60% of premium (an option can't decay further than that
 *      in this rough model)
 *   5. Floor at -100% (premium paid is the max loss); no upper cap.
 *
 * Returns null if any of the four required inputs are 0/missing.
 */
export function estimateOptionPnl(
  underlyingAtFill: number,
  currentPrice: number,
  optFill: number,
  strike: number,
  dteAtFill: number,
  optType: string,
  flowDate?: string,
): number | null {
  if (!underlyingAtFill || !currentPrice || !optFill || optFill <= 0 || !strike) return null;

  const isPut = optType.toUpperCase().includes("PUT");
  const stockMove = currentPrice - underlyingAtFill;

  // Moneyness: how far ITM/OTM as a fraction of strike.
  const moneyness = isPut
    ? (strike - currentPrice) / strike
    : (currentPrice - strike) / strike;

  // Delta estimate from moneyness bucket.
  let delta: number;
  if (moneyness > 0.10) delta = 0.72;       // deep ITM
  else if (moneyness > 0.02) delta = 0.58;  // slightly ITM
  else if (moneyness > -0.02) delta = 0.50; // ATM
  else if (moneyness > -0.10) delta = 0.35; // slightly OTM
  else if (moneyness > -0.20) delta = 0.20; // OTM
  else delta = 0.10;                        // deep OTM

  // Gamma boost when the underlying moved a lot.
  const pctMove = Math.abs(stockMove / underlyingAtFill);
  if (pctMove > 0.05) delta = Math.min(0.90, delta + 0.10);

  // Intrinsic value change driven by stock movement.
  const optionDelta = isPut ? -delta : delta;
  const deltaGain = optionDelta * stockMove;

  // Linear time decay since the fill date.
  let daysElapsed = 0;
  if (flowDate) {
    const fd = new Date(flowDate);
    const now = new Date();
    daysElapsed = Math.max(0, Math.round((now.getTime() - fd.getTime()) / 86400000));
  }
  const effectiveDte = Math.max(dteAtFill || 30, 5);
  const dailyTheta = optFill / (effectiveDte * 1.8);
  const thetaLoss = Math.min(dailyTheta * daysElapsed, optFill * 0.6);

  const estCurrentOpt = Math.max(0.01, optFill + deltaGain - thetaLoss);
  const pnlPct = ((estCurrentOpt - optFill) / optFill) * 100;

  // Floor at -100% (premium = max loss). No upper cap. Round to 2dp to match
  // the Python mirror — badges therefore display "+42.37%" not "+42%".
  return Math.round(Math.max(-100, pnlPct) * 100) / 100;
}
