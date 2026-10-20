import { useQuery } from "@tanstack/react-query";
import apiClient from "../../api/client";
import { Chip } from "../../components/Glass";
import { TileGrid, Tile, Kpi, BarRow, ActionCard } from "../../components/Cockpit";
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

/** Drawdown tile: big figure + a track from 0% to the cash-out threshold
 *  with a marker at the freeze level. */
function DrawdownTile({ drawdown, freezeAt, cashAt, supported, breaker }: { drawdown: number; freezeAt: number | null; cashAt: number | null; supported: boolean; breaker: React.ReactNode }) {
  if (!supported || freezeAt == null || cashAt == null || cashAt >= 0) {
    return (
      <Tile span={5} title="Recorded drawdown" actions={breaker}>
        <Kpi label="From peak" value={`${drawdown.toFixed(1)}%`} size="xl" />
      </Tile>
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
    <Tile span={5} title="Drawdown from peak" actions={breaker}>
      <Kpi
        label={`${fillPct.toFixed(0)}% of the way to cash-out`}
        value={<span style={{ color }}>{drawdown >= 0 ? "+" : ""}{drawdown.toFixed(1)}%</span>}
        size="xl"
      />
      <div className="relative mt-1 h-3.5 w-full rounded-[3px]" style={{ background: "var(--track)" }}>
        <div className="absolute h-full rounded-[3px] transition-all duration-500" style={{ width: `${fillPct}%`, background: color }} />
        <div
          className="absolute -top-1 h-[22px] w-0.5 rounded-sm bg-accent-orange"
          style={{ left: `calc(${freezeMark}% - 1px)` }}
          title={`Freeze at ${freezeAt}%`}
        />
      </div>
      <div className="num flex justify-between text-xs text-text-muted">
        <span>0%</span>
        <span>freeze {freezeAt}%</span>
        <span>cash-out {cashAt}%</span>
      </div>
    </Tile>
  );
}

function SlotsTile({ slots }: { slots: RiskData["slots"] }) {
  const items = [
    { label: "Day", ...slots.day_trade },
    { label: "Swing", ...slots.swing },
    { label: "Lotto", ...slots.lotto },
  ];
  return (
    <Tile span={4} title="Slots" meta="used / max">
      {items.map((item) => {
        const isFull = item.max > 0 && item.used >= item.max;
        return (
          <BarRow
            key={item.label}
            label={item.label}
            value={item.used}
            max={item.max}
            tone={isFull ? "warn" : "info"}
            display={item.max === 0 ? "disabled" : `${item.used}/${item.max}`}
            title={isFull ? "All slots in use" : undefined}
          />
        );
      })}
    </Tile>
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
  const breaker = <CircuitBreakerBadge state={risk.circuit_breaker_state} remainingMin={risk.freeze_remaining_min} supported={cbSupported} />;

  return (
    <TileGrid>
      <DrawdownTile
        drawdown={risk.drawdown_pct}
        freezeAt={risk.drawdown_freeze_threshold}
        cashAt={risk.drawdown_cash_threshold}
        supported={cbSupported}
        breaker={breaker}
      />
      <SlotsTile slots={slots} />
      <Tile span={3} title="Book">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-1">
          <Kpi label="Peak value" value={fmtMoney(portfolio.peak_value)} size="md" />
          {hasLottoBudget && <Kpi label="Lotto budget" value={fmtMoney(portfolio.lotto_budget)} size="md" />}
          <Kpi
            label="Watchlist A · B"
            value={<>{data.watchlist.wla_count}<span className="text-text-muted"> · </span>{data.watchlist.wlb_count}</>}
            size="md"
          />
        </div>
      </Tile>

      {risk.sector_warnings.length > 0 && (
        <div className="min-w-0 lg:col-span-12" title="3+ same-direction positions in one sector">
          <ActionCard kind={<span className="flex items-center gap-1.5"><AlertTriangle size={13} /> Sector concentration</span>} tone="warn" title={`${risk.sector_warnings.length} crowded sector${risk.sector_warnings.length > 1 ? "s" : ""}`}>
            <span className="flex flex-wrap gap-x-5 gap-y-1">
              {risk.sector_warnings.map((w, i) => (
                <span key={i}>
                  {w.sector} <span className={w.side === "Bull" ? "delta-up" : "delta-down"}>{w.side}</span>{" "}
                  <span className="num">×{w.count}</span>
                </span>
              ))}
            </span>
          </ActionCard>
        </div>
      )}
    </TileGrid>
  );
}
