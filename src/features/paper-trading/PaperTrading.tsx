import { useState } from "react";
import {
  usePortfolio,
  useWatchlist,
  usePositions,
  useTradeLog,
  useScanWatchlist,
  useResetPortfolio,
} from "../../api/paper";
import { formatCurrency, formatPercentRaw, changeColor, formatDate } from "../../lib/utils";
import {
  Wallet,
  Eye,
  TrendingUp,
  TrendingDown,
  Target,
  Trophy,
  DollarSign,
  RefreshCw,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  BarChart3,
  Clock,
} from "lucide-react";
import type {
  PortfolioSummary,
  WatchlistItem,
  PaperPosition,
  TradeLogEntry,
} from "../../lib/types";

/* ── Portfolio Summary Card ──────────────────────────────── */

function PortfolioSummaryCard({ portfolio }: { portfolio: PortfolioSummary }) {
  const returnColor = changeColor(portfolio.total_return_pct);
  const realizedColor = changeColor(portfolio.realized_pnl);
  const unrealizedColor = changeColor(portfolio.unrealized_pnl);

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={16} className="text-accent-purple" />
        <h3 className="text-sm font-semibold text-text-primary">Portfolio Summary</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Value */}
        <div>
          <div className="text-xs text-text-muted mb-1">Total Value</div>
          <div className="font-mono font-bold text-lg text-text-primary">
            {formatCurrency(portfolio.total_value)}
          </div>
          <div className="font-mono text-xs" style={{ color: returnColor }}>
            {formatPercentRaw(portfolio.total_return_pct)}
          </div>
        </div>

        {/* Cash */}
        <div>
          <div className="text-xs text-text-muted mb-1">Cash</div>
          <div className="font-mono font-bold text-text-primary">
            {formatCurrency(portfolio.cash)}
          </div>
        </div>

        {/* Realized P/L */}
        <div>
          <div className="text-xs text-text-muted mb-1">Realized P/L</div>
          <div className="font-mono font-bold" style={{ color: realizedColor }}>
            {formatCurrency(portfolio.realized_pnl)}
          </div>
        </div>

        {/* Unrealized P/L */}
        <div>
          <div className="text-xs text-text-muted mb-1">Unrealized P/L</div>
          <div className="font-mono font-bold" style={{ color: unrealizedColor }}>
            {formatCurrency(portfolio.unrealized_pnl)}
          </div>
        </div>
      </div>

      {/* Bottom stats row */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <Target size={13} className="text-accent-blue" />
          <div className="text-xs">
            <span className="text-text-muted">Open: </span>
            <span className="font-mono text-text-primary">{portfolio.open_positions}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BarChart3 size={13} className="text-text-secondary" />
          <div className="text-xs">
            <span className="text-text-muted">Closed: </span>
            <span className="font-mono text-text-primary">{portfolio.closed_positions}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Trophy size={13} className="text-accent-orange" />
          <div className="text-xs">
            <span className="text-text-muted">Win Rate: </span>
            <span
              className="font-mono font-semibold"
              style={{ color: portfolio.win_rate >= 50 ? "var(--accent-green)" : "var(--accent-red)" }}
            >
              {portfolio.win_rate.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Watchlist Section ───────────────────────────────────── */

function WatchlistSection({ items }: { items: WatchlistItem[] }) {
  if (items.length === 0) {
    return (
      <div className="card text-center py-6">
        <Eye size={20} className="mx-auto mb-2 text-text-muted opacity-40" />
        <p className="text-xs text-text-muted">Watchlist is empty</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-3">
        <Eye size={12} />
        Watchlist ({items.length})
      </h4>
      <div className="space-y-1.5">
        {items.map((item) => {
          const dipColor = changeColor(item.dip_pct);
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-card-hover transition-colors text-xs"
            >
              <span className="font-mono font-bold text-text-primary w-12">
                {item.ticker}
              </span>
              <span className="font-mono text-text-secondary">
                ${item.strike} {item.option_type}
              </span>
              <span className="text-text-muted">{item.expiry}</span>
              <div className="ml-auto flex items-center gap-3">
                <div>
                  <span className="text-text-muted">Ref: </span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(item.ref_price)}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted">Now: </span>
                  <span className="font-mono text-text-primary">
                    {formatCurrency(item.current_price)}
                  </span>
                </div>
                <span className="font-mono font-semibold" style={{ color: dipColor }}>
                  {formatPercentRaw(item.dip_pct)}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-semibold"
                  style={{
                    color:
                      item.status === "watching"
                        ? "var(--accent-blue)"
                        : "var(--accent-green)",
                    background:
                      item.status === "watching"
                        ? "rgba(88,166,255,0.1)"
                        : "rgba(63,185,80,0.1)",
                  }}
                >
                  {item.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Position Card ───────────────────────────────────────── */

function PositionCard({ position }: { position: PaperPosition }) {
  const pnlColor = changeColor(position.pnl_pct);
  const dirColor =
    position.direction === "bullish" || position.direction === "long"
      ? "var(--accent-green)"
      : "var(--accent-red)";

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-text-primary">
            {position.ticker}
          </span>
          <span
            className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded"
            style={{ color: dirColor, background: `${dirColor}15` }}
          >
            {position.direction}
          </span>
        </div>
        <span className="font-mono font-bold text-sm" style={{ color: pnlColor }}>
          {formatPercentRaw(position.pnl_pct)}
        </span>
      </div>

      <div className="font-mono text-xs text-text-secondary">
        {position.contracts}x ${position.strike} {position.option_type} {position.expiry}
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-text-muted">Entry</div>
          <div className="font-mono text-text-primary">
            {formatCurrency(position.entry_premium)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Current</div>
          <div className="font-mono text-text-primary">
            {formatCurrency(position.current_premium)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">P/L $</div>
          <div className="font-mono" style={{ color: pnlColor }}>
            {formatCurrency(position.pnl_dollars)}
          </div>
        </div>
      </div>

      {position.exit_reason && (
        <div className="text-xs text-text-muted border-t border-border pt-1.5 mt-1">
          Exit: {position.exit_reason}
        </div>
      )}
    </div>
  );
}

/* ── Trade Log ───────────────────────────────────────────── */

function TradeLogSection({ entries }: { entries: TradeLogEntry[] }) {
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, 5);

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full mb-3"
      >
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={12} />
          Trade Log ({entries.length})
        </h4>
        {expanded ? (
          <ChevronUp size={14} className="text-text-muted" />
        ) : (
          <ChevronDown size={14} className="text-text-muted" />
        )}
      </button>

      <div className="space-y-1">
        {visible.map((entry) => {
          const actionColor =
            entry.action.toLowerCase().includes("buy")
              ? "var(--accent-green)"
              : entry.action.toLowerCase().includes("sell") ||
                  entry.action.toLowerCase().includes("close")
                ? "var(--accent-red)"
                : "var(--text-secondary)";

          return (
            <div
              key={entry.id}
              className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-bg-card-hover transition-colors"
            >
              <span className="text-text-muted w-28 shrink-0 font-mono">
                {new Date(entry.timestamp).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className="font-semibold uppercase w-14 shrink-0"
                style={{ color: actionColor }}
              >
                {entry.action}
              </span>
              <span className="font-mono text-text-primary w-12 shrink-0">
                {entry.ticker}
              </span>
              <span className="font-mono text-text-secondary">
                {entry.contracts}x ${entry.strike} {entry.option_type}
              </span>
              <span className="font-mono text-text-primary ml-auto">
                @ {formatCurrency(entry.premium)}
              </span>
            </div>
          );
        })}
      </div>

      {!expanded && entries.length > 5 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-accent-blue hover:underline mt-2"
        >
          Show {entries.length - 5} more entries...
        </button>
      )}
    </div>
  );
}

/* ── Main PaperTrading ───────────────────────────────────── */

export function PaperTrading() {
  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const { data: openPositions, isLoading: openLoading } = usePositions("open");
  const { data: closedPositions, isLoading: closedLoading } = usePositions("closed");
  const { data: tradeLog, isLoading: logLoading } = useTradeLog();

  const scanMutation = useScanWatchlist();
  const resetMutation = useResetPortfolio();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isLoading = portfolioLoading || watchlistLoading || openLoading;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="card h-40" />
        <div className="h-10 w-full rounded bg-text-muted/20" />
        <div className="card h-32" />
        <div className="grid grid-cols-2 gap-3">
          <div className="card h-28" />
          <div className="card h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portfolio summary */}
      {portfolio && <PortfolioSummaryCard portfolio={portfolio} />}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 transition-colors disabled:opacity-50"
        >
          {scanMutation.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Search size={13} />
          )}
          Watch & Scan
        </button>

        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-accent-green/15 text-accent-green hover:bg-accent-green/25 transition-colors disabled:opacity-50"
        >
          {scanMutation.isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          Update Prices
        </button>

        {showResetConfirm ? (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-accent-orange flex items-center gap-1">
              <AlertTriangle size={12} />
              Reset to $10K?
            </span>
            <button
              onClick={() => {
                resetMutation.mutate();
                setShowResetConfirm(false);
              }}
              disabled={resetMutation.isPending}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-accent-red/15 text-accent-red hover:bg-accent-red/25 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1.5 rounded text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors ml-auto"
          >
            <Trash2 size={13} />
            Reset
          </button>
        )}
      </div>

      {/* Watchlist */}
      {watchlist && <WatchlistSection items={watchlist} />}

      {/* Open Positions */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <TrendingUp size={12} />
          Open Positions ({openPositions?.length ?? 0})
        </h4>
        {!openPositions || openPositions.length === 0 ? (
          <div className="card text-center py-4">
            <p className="text-xs text-text-muted">No open positions</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {openPositions.map((pos) => (
              <PositionCard key={pos.id} position={pos} />
            ))}
          </div>
        )}
      </div>

      {/* Closed Positions */}
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <TrendingDown size={12} />
          Closed Positions ({closedPositions?.length ?? 0})
        </h4>
        {!closedPositions || closedPositions.length === 0 ? (
          <div className="card text-center py-4">
            <p className="text-xs text-text-muted">No closed positions</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {closedPositions.map((pos) => (
              <PositionCard key={pos.id} position={pos} />
            ))}
          </div>
        )}
      </div>

      {/* Trade log */}
      {tradeLog && <TradeLogSection entries={tradeLog} />}
    </div>
  );
}
