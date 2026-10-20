import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { Chip } from "../../components/Glass";
import {
  Shield, AlertTriangle, AlertOctagon, Lock, TrendingDown,
  Layers, Coins, Activity, RefreshCw,
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
    circuit_breaker_supported?: boolean;
    circuit_breaker_enabled?: boolean;
    circuit_breaker_state: "FREE" | "FROZEN" | "CASH";
    circuit_breaker_until: string;
    freeze_remaining_min: number;
    drawdown_pct: number;
    drawdown_freeze_threshold: number | null;
    drawdown_cash_threshold: number | null;
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

function CircuitBreakerBadge({ state, remainingMin, supported }: { state: string; remainingMin: number; supported: boolean }) {
  if (!supported) return <span className="flex items-center gap-1 text-xs text-text-muted"><Shield size={12} />Circuit breaker unavailable</span>;
  if (state === "FREE") {
    // Normal state: plain text, no tint.
    return (
      <span className="flex items-center gap-1 text-xs text-text-secondary">
        <Shield size={12} /> Circuit breaker free
      </span>
    );
  }
  if (state === "FROZEN") {
    const hours = Math.floor(remainingMin / 60);
    const mins = remainingMin % 60;
    const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return (
      <Chip tone="orange">
        <Lock size={12} /> Circuit breaker frozen <span className="num">({label})</span>
      </Chip>
    );
  }
  return (
    <Chip tone="red">
      <AlertOctagon size={12} /> Circuit breaker cash-out
    </Chip>
  );
}

function DrawdownBar({ drawdown, freezeAt, cashAt, supported }: { drawdown: number; freezeAt: number | null; cashAt: number | null; supported: boolean }) {
  if (!supported || freezeAt == null || cashAt == null || cashAt >= 0) return <span className="text-xs text-text-muted">Recorded drawdown <span className="num text-text-primary">{drawdown.toFixed(1)}%</span></span>;
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
  else if (ddAbs >= freezeAbs * 0.7) color = "var(--accent-yellow)";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted whitespace-nowrap">Drawdown</span>
      <div className="relative flex-1 h-1.5 rounded-full bg-border overflow-hidden min-w-[80px]">
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
      <span className="num text-xs font-semibold whitespace-nowrap" style={{ color }}>
        {drawdown >= 0 ? "+" : ""}{drawdown.toFixed(1)}%
      </span>
    </div>
  );
}

function SlotPills({ slots }: { slots: RiskData["slots"] }) {
  const items: { label: string; used: number; max: number; color: string }[] = [
    { label: "Day", used: slots.day_trade.used, max: slots.day_trade.max, color: "var(--accent-blue)" },
    { label: "Swing", used: slots.swing.used, max: slots.swing.max, color: "var(--accent-blue)" },
    { label: "Lotto", used: slots.lotto.used, max: slots.lotto.max, color: "var(--accent-blue)" },
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map((item) => {
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
              className="num text-xs"
              style={{ color: item.max > 0 && isFull ? "var(--accent-orange)" : "var(--text-muted)" }}
            >
              {item.max === 0 ? "disabled" : `${item.used}/${item.max}`}
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
    <div className="flex items-center gap-3 flex-wrap">
      {warnings.map((w, i) => {
        const isBull = w.side === "Bull";
        const color = isBull ? "var(--accent-green)" : "var(--accent-red)";
        return (
          <span
            key={i}
            className="flex items-center gap-1 text-xs text-text-secondary"
            title="3+ same-direction positions in one sector"
          >
            <AlertTriangle size={12} className="text-accent-orange" />
            {w.sector} <span style={{ color }}>{w.side}</span> <span className="num">×{w.count}</span>
          </span>
        );
      })}
    </div>
  );
}

export function SystemRiskStatus() {
  const { data, isLoading, isError, refetch } = useRiskStatus();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
        <Activity size={12} className="animate-pulse" />
        Loading risk status...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-accent-red">
        <AlertTriangle size={12} />
        <span>Unable to load risk status.</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-bg-card-hover"
        >
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  const { portfolio, risk, slots } = data;
  const hasLottoBudget = portfolio.lotto_budget > 0;

  return (
    <div className="card py-3 px-4">
      <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
        {/* Circuit breaker badge */}
        <CircuitBreakerBadge state={risk.circuit_breaker_state} remainingMin={risk.freeze_remaining_min} supported={risk.circuit_breaker_enabled ?? risk.circuit_breaker_supported ?? false} />

        {/* Drawdown bar */}
        <div className="flex-1 min-w-[180px] max-w-[280px]">
          <DrawdownBar
            drawdown={risk.drawdown_pct}
            freezeAt={risk.drawdown_freeze_threshold}
            cashAt={risk.drawdown_cash_threshold}
            supported={risk.circuit_breaker_enabled ?? risk.circuit_breaker_supported ?? false}
          />
        </div>

        {/* Peak value */}
        <div className="flex items-center gap-1 text-xs">
          <TrendingDown size={12} className="text-text-muted" />
          <span className="text-text-muted">Peak</span>
          <span className="num text-text-primary">{fmtMoney(portfolio.peak_value)}</span>
        </div>

        {/* Slots */}
        <div className="flex items-center gap-1.5">
          <Layers size={12} className="text-text-muted" />
          <SlotPills slots={slots} />
        </div>

        {/* Lotto budget */}
        {hasLottoBudget && (
          <div className="flex items-center gap-1 text-xs">
            <Coins size={12} className="text-text-muted" />
            <span className="text-text-muted">Lotto budget</span>
            <span className="num text-text-primary font-semibold">
              {fmtMoney(portfolio.lotto_budget)}
            </span>
          </div>
        )}

        {/* Watchlist counts */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Watchlist</span>
          <span className="text-text-muted">
            A <span className="num text-text-primary">{data.watchlist.wla_count}</span>
            {" · "}
            B <span className="num text-text-primary">{data.watchlist.wlb_count}</span>
          </span>
        </div>
      </div>

      {/* Sector warnings (second row, only if present) */}
      {risk.sector_warnings.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-3">
          <span className="text-xs text-text-muted">Sector concentration</span>
          <SectorWarnings warnings={risk.sector_warnings} />
        </div>
      )}
    </div>
  );
}
