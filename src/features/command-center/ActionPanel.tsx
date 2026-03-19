import { formatCurrency, formatPercentRaw, changeColor } from "../../lib/utils";
import { DIRECTION_COLORS } from "../../lib/constants";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Target,
  ShieldAlert,
  Zap,
  CircleDot,
  Calendar,
  DollarSign,
  BarChart3,
} from "lucide-react";
import type { Signal } from "../../lib/types";

interface ActionPanelProps {
  signal: Signal | null;
  currentPrice?: number;
  isLoading?: boolean;
}

/* ── Trade Setup Card ────────────────────────────────────── */

function TradeSetupCard({
  signal,
  currentPrice,
}: {
  signal: Signal;
  currentPrice?: number;
}) {
  const isBull = signal.direction === "BULL";
  const action = isBull ? "BUY" : signal.direction === "BEAR" ? "SHORT" : "WAIT";
  const actionColor = DIRECTION_COLORS[signal.direction];
  const ActionIcon = isBull ? ArrowUpCircle : ArrowDownCircle;

  const stopLoss = isBull ? signal.entry_low * 0.97 : signal.entry_high * 1.03;

  // Trigger status: are we in the entry zone?
  let triggerStatus = "WAITING";
  let triggerColor = "var(--text-secondary)";
  if (currentPrice) {
    if (currentPrice >= signal.entry_low && currentPrice <= signal.entry_high) {
      triggerStatus = "IN ZONE";
      triggerColor = "var(--accent-green)";
    } else if (
      (isBull && currentPrice < signal.entry_low) ||
      (!isBull && currentPrice > signal.entry_high)
    ) {
      triggerStatus = "BELOW ZONE";
      triggerColor = "var(--accent-orange)";
    } else {
      triggerStatus = "ABOVE ZONE";
      triggerColor = "var(--accent-red)";
    }
  }

  return (
    <div className="card flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <Zap size={13} />
        Trade Setup
      </h3>

      {/* Action badge */}
      <div className="flex items-center justify-between">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold text-sm uppercase"
          style={{ color: actionColor, background: `${actionColor}18` }}
        >
          <ActionIcon size={16} />
          {action}
        </div>
        <span
          className="text-xs font-mono font-semibold px-2 py-1 rounded"
          style={{ color: triggerColor, background: `${triggerColor}15` }}
        >
          {triggerStatus}
        </span>
      </div>

      {/* Entry zone */}
      <div className="flex items-center gap-2 text-sm">
        <Target size={14} className="text-accent-blue shrink-0" />
        <span className="text-text-secondary">Entry:</span>
        <span className="font-mono text-text-primary">
          {formatCurrency(signal.entry_low)} - {formatCurrency(signal.entry_high)}
        </span>
      </div>

      {/* Stop loss */}
      <div className="flex items-center gap-2 text-sm">
        <ShieldAlert size={14} className="text-accent-red shrink-0" />
        <span className="text-text-secondary">Stop:</span>
        <span className="font-mono text-accent-red">{formatCurrency(stopLoss)}</span>
      </div>

      {/* Risk / Reward rough display */}
      {currentPrice && (
        <div className="text-xs text-text-muted border-t border-border pt-2 mt-1">
          Current: <span className="font-mono text-text-primary">{formatCurrency(currentPrice)}</span>
          {" | "}
          Risk: <span className="font-mono text-accent-red">
            {formatPercentRaw(((stopLoss - currentPrice) / currentPrice) * 100)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Option Pick Card ────────────────────────────────────── */

interface OptionPickData {
  strike: number;
  type: "CALL" | "PUT";
  expiry: string;
  premium: number;
  bid: number;
  ask: number;
  iv: number;
}

function OptionPickCard({ option }: { option?: OptionPickData }) {
  if (!option) {
    return (
      <div className="card flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
          <CircleDot size={13} />
          Option Pick
        </h3>
        <p className="text-xs text-text-muted py-4 text-center">
          No option recommendation available
        </p>
      </div>
    );
  }

  const typeColor = option.type === "CALL" ? "var(--accent-green)" : "var(--accent-red)";

  return (
    <div className="card flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <CircleDot size={13} />
        Option Pick
      </h3>

      {/* Contract line */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ color: typeColor, background: `${typeColor}18` }}
        >
          {option.type}
        </span>
        <span className="font-mono text-text-primary text-sm">
          ${option.strike}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1">
          <Calendar size={11} className="text-text-muted" />
          <span className="text-text-secondary">Expiry:</span>
          <span className="font-mono text-text-primary">{option.expiry}</span>
        </div>
        <div className="flex items-center gap-1">
          <DollarSign size={11} className="text-text-muted" />
          <span className="text-text-secondary">Premium:</span>
          <span className="font-mono text-text-primary">{formatCurrency(option.premium)}</span>
        </div>
        <div>
          <span className="text-text-secondary">Bid/Ask:</span>{" "}
          <span className="font-mono text-text-primary">
            {formatCurrency(option.bid)} / {formatCurrency(option.ask)}
          </span>
        </div>
        <div>
          <span className="text-text-secondary">IV:</span>{" "}
          <span className="font-mono text-accent-purple">
            {(option.iv * 100).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Targets Card ────────────────────────────────────────── */

function TargetsCard({
  signal,
  currentPrice,
}: {
  signal: Signal;
  currentPrice?: number;
}) {
  const calcProgress = (entry: number, target: number, current: number) => {
    const range = target - entry;
    if (range === 0) return 0;
    const progress = ((current - entry) / range) * 100;
    return Math.max(0, Math.min(100, progress));
  };

  const entryMid = (signal.entry_low + signal.entry_high) / 2;
  const price = currentPrice ?? entryMid;
  const t1Progress = calcProgress(entryMid, signal.t1, price);
  const t2Progress = calcProgress(entryMid, signal.t2, price);

  const t1PnL = ((signal.t1 - entryMid) / entryMid) * 100;
  const t2PnL = ((signal.t2 - entryMid) / entryMid) * 100;

  return (
    <div className="card flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
        <BarChart3 size={13} />
        Targets
      </h3>

      {/* T1 */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-text-secondary">
            T1: <span className="font-mono text-text-primary">{formatCurrency(signal.t1)}</span>
          </span>
          <span className="font-mono" style={{ color: changeColor(t1PnL) }}>
            {formatPercentRaw(t1PnL)}
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(72,79,88,0.3)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${t1Progress}%`,
              background: t1Progress >= 100 ? "var(--accent-green)" : "var(--accent-blue)",
            }}
          />
        </div>
        <div className="text-right text-xs text-text-muted mt-0.5 font-mono">
          {t1Progress.toFixed(0)}%
        </div>
      </div>

      {/* T2 */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-text-secondary">
            T2: <span className="font-mono text-text-primary">{formatCurrency(signal.t2)}</span>
          </span>
          <span className="font-mono" style={{ color: changeColor(t2PnL) }}>
            {formatPercentRaw(t2PnL)}
          </span>
        </div>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(72,79,88,0.3)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${t2Progress}%`,
              background: t2Progress >= 100 ? "var(--accent-green)" : "var(--accent-purple)",
            }}
          />
        </div>
        <div className="text-right text-xs text-text-muted mt-0.5 font-mono">
          {t2Progress.toFixed(0)}%
        </div>
      </div>

      {/* Scale-out plan */}
      <div className="border-t border-border pt-2 text-xs text-text-secondary">
        <div className="flex justify-between">
          <span>T1 hit: scale out 40%</span>
          <span>T2 hit: close remaining</span>
        </div>
      </div>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────── */

function SkeletonPanel() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card min-h-[180px]">
          <div className="h-4 w-24 rounded bg-text-muted/20 mb-4" />
          <div className="space-y-3">
            <div className="h-8 w-20 rounded bg-text-muted/20" />
            <div className="h-4 w-full rounded bg-text-muted/20" />
            <div className="h-4 w-3/4 rounded bg-text-muted/20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main ActionPanel ────────────────────────────────────── */

export function ActionPanel({ signal, currentPrice, isLoading }: ActionPanelProps) {
  if (isLoading) return <SkeletonPanel />;

  if (!signal) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["Trade Setup", "Option Pick", "Targets"].map((title) => (
          <div key={title} className="card flex items-center justify-center min-h-[160px]">
            <p className="text-xs text-text-muted">{title} -- awaiting analysis</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <TradeSetupCard signal={signal} currentPrice={currentPrice} />
      <OptionPickCard />
      <TargetsCard signal={signal} currentPrice={currentPrice} />
    </div>
  );
}
