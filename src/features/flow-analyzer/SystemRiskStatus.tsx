import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import {
  Shield, AlertTriangle, AlertOctagon, Lock, TrendingDown,
  Layers, Coins, Activity,
} from "lucide-react";

interface RiskData {
  portfolio: {
    cash: number;
    total_value: number;
    return_pct: number;
    positions_count: number;
    peak_value: number;
    drawdown_pct: number;
    lotto_budget: number;
  };
  slots: {
    day_trade: { used: number; max: number };
    swing: { used: number; max: number };
    lotto: { used: number; max: number };
  };
  watchlist: { wla_count: number; wlb_count: number };
  risk: {
    circuit_breaker_state: "FREE" | "FROZEN" | "CASH";
    circuit_breaker_until: string;
    freeze_remaining_min: number;
    drawdown_pct: number;
    drawdown_freeze_threshold: number;
    drawdown_cash_threshold: number;
    sector_concentration: Record<string, number>;
    sector_warnings: { sector: string; side: string; count: number }[];
  };
}

function useRiskStatus() {
  return useQuery<RiskData>({
    queryKey: ["iflow-trader-risk"],
    queryFn: () => apiClient.get("/iflow-trader/status").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

function fmtMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function CircuitBreakerBadge({ state, remainingMin }: { state: string; remainingMin: number }) {
  if (state === "FREE") {
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold"
        style={{ background: "rgba(63,185,80,0.12)", color: "var(--accent-green)", border: "1px solid rgba(63,185,80,0.3)" }}>
        <Shield size={11} /> CB FREE
      </span>
    );
  }
  if (state === "FROZEN") {
    const hours = Math.floor(remainingMin / 60);
    const mins = remainingMin % 60;
    const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return (
      <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold"
        style={{ background: "rgba(227,127,46,0.15)", color: "var(--accent-orange)", border: "1px solid rgba(227,127,46,0.4)" }}>
        <Lock size={11} /> CB FROZEN ({label})
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold"
      style={{ background: "rgba(248,81,73,0.15)", color: "var(--accent-red)", border: "1px solid rgba(248,81,73,0.4)" }}>
      <AlertOctagon size={11} /> CB CASH-OUT
    </span>
  );
}

function DrawdownBar({ drawdown, freezeAt, cashAt }: { drawdown: number; freezeAt: number; cashAt: number }) {
  // Visualize 0% to cashAt (e.g., -25%). Drawdown is negative.
  const dd = Math.min(0, drawdown);
  const ddAbs = Math.abs(dd);
  const cashAbs = Math.abs(cashAt);
  const freezeAbs = Math.abs(freezeAt);
  const fillPct = Math.min(100, (ddAbs / cashAbs) * 100);
  const freezeMark = (freezeAbs / cashAbs) * 100;

  let color = "var(--accent-green)";
  if (ddAbs >= cashAbs) color = "var(--accent-red)";
  else if (ddAbs >= freezeAbs) color = "var(--accent-orange)";
  else if (ddAbs >= freezeAbs * 0.7) color = "#f0a830";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted whitespace-nowrap">DD</span>
      <div className="relative flex-1 h-2.5 rounded-full bg-border overflow-hidden min-w-[80px]">
        <div
          className="absolute h-full rounded-full transition-all duration-500"
          style={{ width: `${fillPct}%`, background: color }}
        />
        <div
          className="absolute top-0 h-full w-px bg-accent-orange"
          style={{ left: `${freezeMark}%`, opacity: 0.6 }}
          title={`Freeze at ${freezeAt}%`}
        />
      </div>
      <span className="font-mono text-xs font-bold whitespace-nowrap" style={{ color }}>
        {drawdown >= 0 ? "+" : ""}{drawdown.toFixed(1)}%
      </span>
    </div>
  );
}

function SlotPills({ slots }: { slots: RiskData["slots"] }) {
  const items: { label: string; used: number; max: number; color: string }[] = [
    { label: "DT", used: slots.day_trade.used, max: slots.day_trade.max, color: "var(--accent-blue)" },
    { label: "SW", used: slots.swing.used, max: slots.swing.max, color: "var(--accent-purple)" },
    { label: "LO", used: slots.lotto.used, max: slots.lotto.max, color: "var(--accent-orange)" },
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map((item) => {
        const pct = (item.used / item.max) * 100;
        const isFull = item.used >= item.max;
        return (
          <div key={item.label} className="flex items-center gap-1">
            <span className="text-xs text-text-muted">{item.label}</span>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: item.max }, (_, i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{
                    background: i < item.used ? item.color : "transparent",
                    border: `1px solid ${i < item.used ? item.color : "var(--border)"}`,
                  }}
                />
              ))}
            </div>
            <span
              className="font-mono text-xs"
              style={{ color: isFull ? "var(--accent-red)" : "var(--text-muted)" }}
            >
              {item.used}/{item.max}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectorWarnings({ warnings }: { warnings: RiskData["risk"]["sector_warnings"] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {warnings.map((w, i) => {
        const isBull = w.side === "Bull";
        const color = isBull ? "var(--accent-green)" : "var(--accent-red)";
        return (
          <span
            key={i}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
            style={{ background: `${color}15`, color, border: `1px solid ${color}40` }}
            title="3+ same-direction positions in one sector"
          >
            <AlertTriangle size={10} />
            {w.sector} {w.side} ×{w.count}
          </span>
        );
      })}
    </div>
  );
}

export function SystemRiskStatus() {
  const { data, isLoading } = useRiskStatus();

  if (isLoading || !data) {
    return (
      <div className="card flex items-center gap-3 py-2 px-3 text-xs text-text-muted">
        <Activity size={12} className="animate-pulse" />
        Loading risk status...
      </div>
    );
  }

  const { portfolio, risk, slots } = data;
  const hasLottoBudget = portfolio.lotto_budget > 0;

  return (
    <div
      className="card py-2 px-3"
      style={{
        borderLeft: `3px solid ${
          risk.circuit_breaker_state === "FROZEN"
            ? "var(--accent-orange)"
            : risk.circuit_breaker_state === "CASH"
              ? "var(--accent-red)"
              : "var(--accent-cyan)"
        }`,
      }}
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Circuit breaker badge */}
        <CircuitBreakerBadge state={risk.circuit_breaker_state} remainingMin={risk.freeze_remaining_min} />

        {/* Drawdown bar */}
        <div className="flex-1 min-w-[180px] max-w-[280px]">
          <DrawdownBar
            drawdown={risk.drawdown_pct}
            freezeAt={risk.drawdown_freeze_threshold}
            cashAt={risk.drawdown_cash_threshold}
          />
        </div>

        {/* Peak value */}
        <div className="flex items-center gap-1 text-xs">
          <TrendingDown size={11} className="text-text-muted" />
          <span className="text-text-muted">Peak</span>
          <span className="font-mono text-text-primary">{fmtMoney(portfolio.peak_value)}</span>
        </div>

        {/* Slots */}
        <div className="flex items-center gap-1.5">
          <Layers size={11} className="text-text-muted" />
          <SlotPills slots={slots} />
        </div>

        {/* Lotto budget */}
        {hasLottoBudget && (
          <div className="flex items-center gap-1 text-xs">
            <Coins size={11} className="text-accent-orange" />
            <span className="text-text-muted">Lotto</span>
            <span className="font-mono text-accent-orange font-semibold">
              {fmtMoney(portfolio.lotto_budget)}
            </span>
          </div>
        )}

        {/* Watchlist counts */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">WL</span>
          <span className="font-mono">
            <span className="text-accent-green">A:{data.watchlist.wla_count}</span>
            {" / "}
            <span className="text-accent-orange">B:{data.watchlist.wlb_count}</span>
          </span>
        </div>
      </div>

      {/* Sector warnings (second row, only if present) */}
      {risk.sector_warnings.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border flex items-center gap-2">
          <span className="text-xs text-text-muted">Sector concentration:</span>
          <SectorWarnings warnings={risk.sector_warnings} />
        </div>
      )}
    </div>
  );
}
