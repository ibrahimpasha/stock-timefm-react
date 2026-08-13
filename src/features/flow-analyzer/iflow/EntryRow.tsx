import { useId } from "react";
import { Star } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { classifySide, dteTag, normExpiry } from "./utils";
import { estimateOptionPnl } from "./estimator";

/**
 * One row inside the flow detail panel. Renders the option contract + a
 * delta/theta-estimated P/L badge that uses the live price when available.
 *
 * The P/L slot is ALWAYS rendered (with "…" / "—" placeholders) so the row
 * doesn't reflow when /market/price resolves. Don't condition the span on
 * `pnl !== null` — that caused the badge-disappearing bug in 2026-05.
 */
export function EntryRow({
  entry,
  ticker,
  price,
  expandedKey,
  entryKey,
  onToggle,
}: {
  entry: any;
  ticker: string;
  price: number;
  expandedKey: string | null;
  entryKey: string;
  onToggle: (k: string) => void;
}) {
  const optType = entry.type || entry.option_type || "";
  const { side, action } = classifySide(optType, entry.ask_pct, entry.vol_oi_ratio, entry.side);
  const color = side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";
  const expanded = expandedKey === entryKey;
  const detailsId = useId();
  const dl = dteTag(entry.dte);

  // Star toggles "watch this contract" — keyed on ticker|strike|type|normExpiry.
  const expiryNorm = normExpiry(entry.expiry) || String(entry.expiry || "");
  const optTypeUpper = optType.toUpperCase().includes("PUT") ? "PUT" : "CALL";
  const contractKey = {
    ticker,
    strike: Number(entry.strike) || 0,
    opt_type: optTypeUpper,
    expiry_norm: expiryNorm,
  };
  const watched = useAppStore((s) =>
    s.watchedContracts.some(
      (c) =>
        c.ticker === contractKey.ticker &&
        c.strike === contractKey.strike &&
        c.opt_type === contractKey.opt_type &&
        c.expiry_norm === contractKey.expiry_norm,
    ),
  );
  const toggleWatchedContract = useAppStore((s) => s.toggleWatchedContract);

  // Use delta-based estimate when we have option fill data; otherwise fall
  // back to underlying % change.
  const uf = entry.underlying_price || 0;
  const optFill = entry.avg_price || 0;
  const strike = entry.strike || 0;
  const dte = entry.dte ?? 30;
  const flowDate = entry._date || entry.flow_date || "";

  let pnl: number | null = null;
  if (price > 0 && uf > 0 && optFill > 0 && strike > 0) {
    pnl = estimateOptionPnl(uf, price, optFill, strike, dte, optType, flowDate);
  } else if (price > 0 && uf > 0) {
    pnl = Math.round(((price - uf) / uf) * 100 * (optType.toUpperCase().includes("PUT") ? -1 : 1));
    pnl = Math.max(-100, pnl);
  }

  const priceLoading = price <= 0;
  const pnlMissing = !priceLoading && uf <= 0;
  const pnlLabel =
    pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl}%` : priceLoading ? "…" : pnlMissing ? "—" : "—";
  const pnlColor =
    pnl !== null ? (pnl >= 0 ? "var(--accent-green)" : "var(--accent-red)") : "var(--text-muted)";

  return (
    <div>
      <div
        className="flex min-w-0 cursor-pointer items-start gap-1 rounded px-0 py-1.5 text-xs transition-colors hover:bg-bg-card-hover lg:items-center lg:gap-2 lg:px-2"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleWatchedContract(contractKey);
          }}
          className="-ml-0.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded p-0.5 transition-colors hover:bg-bg-card-hover lg:min-h-0 lg:min-w-0"
          title={watched ? "Unwatch contract" : "Watch contract"}
          aria-label={watched ? `Unwatch ${ticker} contract` : `Watch ${ticker} contract`}
          aria-pressed={watched}
        >
          <Star
            size={11}
            aria-hidden="true"
            style={{
              color: watched ? "var(--accent-orange)" : "var(--text-muted)",
              fill: watched ? "var(--accent-orange)" : "none",
              opacity: watched ? 1 : 0.45,
            }}
          />
        </button>
        <button
          type="button"
          onClick={() => onToggle(entryKey)}
          aria-expanded={expanded}
          aria-controls={entry.analysis ? detailsId : undefined}
          className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded text-left lg:min-h-6 lg:flex-nowrap"
        >
          <span className="shrink-0 font-mono font-semibold lg:w-10" style={{ color }}>
            {side}
          </span>
          <span className="shrink-0 italic text-text-muted lg:w-16">{action}</span>
          <span className="num font-bold text-text-primary">
            ${entry.strike} {optType}
          </span>
          <span className="num text-text-muted">{entry.expiry}</span>
          {dl && (
            <span className="num px-1 rounded-full" style={{ color: dl.color, background: dl.bg }}>
              {dl.text}
            </span>
          )}
          {entry.vol_oi_ratio > 0 && (
            <span className="text-accent-cyan num">
              {Number(entry.vol_oi_ratio).toFixed(1)}x
            </span>
          )}
          {entry.ask_pct > 0 && (
            <span className="text-accent-orange num">{entry.ask_pct}%ask</span>
          )}
          <span
            className="num font-bold shrink-0"
            style={{ color: pnlColor, minWidth: 48, textAlign: "right" }}
            title={
              pnl !== null
                ? "Estimated P/L since fill"
                : priceLoading
                ? "Loading current price…"
                : "No fill data"
            }
          >
            {pnlLabel}
          </span>
          <span className="text-text-secondary ml-auto num">{entry.premium}</span>
        </button>
      </div>
      {expanded && entry.analysis && (
        <div
          id={detailsId}
          className="ml-12 mr-2 mb-2 px-2 py-1.5 rounded text-xs text-text-secondary leading-relaxed"
          style={{ background: "color-mix(in srgb, var(--bg-card) 50%, transparent)" }}
        >
          {entry.analysis}
          {(entry.underlying_price || entry.avg_price) && (
            <div className="mt-1 num text-text-muted">
              {entry.underlying_price ? `Underlying @ fill: $${entry.underlying_price}` : ""}
              {price > 0 ? ` | Now: $${price.toFixed(2)}` : ""}
              {entry.underlying_price && price > 0
                ? ` (${(((price - entry.underlying_price) / entry.underlying_price) * 100).toFixed(1)}%)`
                : ""}
              {entry.avg_price ? ` | Opt fill: $${entry.avg_price}` : ""}
              {entry.dte ? ` | ${entry.dte} DTE` : ""}
              {pnl !== null ? ` | Est P/L: ${pnl >= 0 ? "+" : ""}${pnl}%` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
