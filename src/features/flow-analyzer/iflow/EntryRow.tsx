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
  const dte = entry.dte || 30;
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
        className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-bg-card-hover transition-colors cursor-pointer"
        onClick={() => onToggle(entryKey)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleWatchedContract(contractKey);
          }}
          className="p-0.5 -ml-0.5 rounded hover:bg-white/5 transition-colors shrink-0"
          title={watched ? "Unwatch contract" : "Watch contract"}
        >
          <Star
            size={11}
            style={{
              color: watched ? "var(--accent-orange)" : "var(--text-muted)",
              fill: watched ? "var(--accent-orange)" : "none",
              opacity: watched ? 1 : 0.45,
            }}
          />
        </button>
        <span className="font-mono font-semibold w-10 shrink-0" style={{ color }}>
          {side}
        </span>
        <span className="text-text-muted italic w-16 shrink-0">{action}</span>
        <span className="font-mono font-bold text-text-primary">
          ${entry.strike} {optType}
        </span>
        <span className="text-text-muted">{entry.expiry}</span>
        {dl && (
          <span className="font-mono px-1 rounded" style={{ color: dl.color, background: dl.bg }}>
            {dl.text}
          </span>
        )}
        {entry.vol_oi_ratio > 0 && (
          <span className="text-accent-cyan font-mono">
            {Number(entry.vol_oi_ratio).toFixed(1)}x
          </span>
        )}
        {entry.ask_pct > 0 && (
          <span className="text-accent-orange font-mono">{entry.ask_pct}%ask</span>
        )}
        <span
          className="font-mono font-bold shrink-0"
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
        <span className="text-text-secondary ml-auto font-mono">{entry.premium}</span>
      </div>
      {expanded && entry.analysis && (
        <div
          className="ml-12 mr-2 mb-2 px-2 py-1.5 rounded text-xs text-text-secondary leading-relaxed"
          style={{ background: "rgba(13,17,23,0.5)" }}
        >
          {entry.analysis}
          {(entry.underlying_price || entry.avg_price) && (
            <div className="mt-1 font-mono text-text-muted">
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
