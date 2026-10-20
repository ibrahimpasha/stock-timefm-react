import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { Chip, Stat } from "../../components/Glass";
import {
  Shield, AlertTriangle, AlertOctagon, Lock, Activity, RefreshCw,
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
  if (!supported || freezeAt == null || cashAt == null || cashAt >= 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-muted">Recorded drawdown</span>
        <span className="num text-3xl font-semibold tracking-tight text-text-primary">{drawdown.toFixed(1)}%</span>
      </div>
    );
  }
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
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-muted">Drawdown from peak</span>
      <span className="num text-3xl font-semibold tracking-tight" style={{ color }}>
        {drawdown >= 0 ? "+" : ""}{drawdown.toFixed(1)}%
      </span>
      <div className="relative h-1.5 w-full min-w-[120px] overflow-hidden rounded-full bg-border">
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
      <span className="text-xs text-text-muted">
        Freeze at <span className="num">{freezeAt}%</span> · cash-out at <span className="num">{cashAt}%</span>
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => {
        const isFull = item.used >= item.max;
        return (
          <div key={item.label} className="flex items-center gap-1">
            <span className="w-10 text-xs text-text-secondary">{item.label}</span>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: item.max }, (_, i) => (
                <div
                  key={i}
                  className="h-3 w-3 rounded-sm"
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
    <div className="callout flex flex-wrap items-center gap-x-4 gap-y-1" title="3+ same-direction positions in one sector">
      <span className="flex items-center gap-1.5 font-medium">
        <AlertTriangle size={13} /> Sector concentration
      </span>
      {warnings.map((w, i) => {
        const isBull = w.side === "Bull";
        return (
          <span key={i} className="text-text-secondary">
            {w.sector} <span className={isBull ? "delta-up" : "delta-down"}>{w.side}</span>{" "}
            <span className="num">×{w.count}</span>
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

  const cbSupported = risk.circuit_breaker_enabled ?? risk.circuit_breaker_supported ?? false;

  return (
    <div className="card flex flex-col gap-5 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        {/* Focal: drawdown */}
        <div className="min-w-[200px] max-w-[320px] flex-1">
          <DrawdownBar
            drawdown={risk.drawdown_pct}
            freezeAt={risk.drawdown_freeze_threshold}
            cashAt={risk.drawdown_cash_threshold}
            supported={cbSupported}
          />
        </div>

        {/* Secondary figures */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <Stat label="Peak value" value={fmtMoney(portfolio.peak_value)} />
          {hasLottoBudget && <Stat label="Lotto budget" value={fmtMoney(portfolio.lotto_budget)} />}
          <Stat
            label="Watchlist A · B"
            value={<>{data.watchlist.wla_count}<span className="text-text-muted"> · </span>{data.watchlist.wlb_count}</>}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-border pt-3">
        <CircuitBreakerBadge state={risk.circuit_breaker_state} remainingMin={risk.freeze_remaining_min} supported={cbSupported} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Slots</span>
          <SlotPills slots={slots} />
        </div>
      </div>

      <SectorWarnings warnings={risk.sector_warnings} />
    </div>
  );
}
