import { Flame, Repeat, Clock } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import type { Signal } from "../../lib/types";

interface OptionPickData {
  strike: number;
  type: "CALL" | "PUT";
  expiry: string;
  premium: number;
  bid: number;
  ask: number;
  volume: number;
  oi: number;
  iv: number;
}

interface OptionPicksProps {
  signal: Signal | undefined;
  isLoading: boolean;
}

interface PickCardInternalProps {
  label: string;
  subtitle: string;
  borderColor: string;
  icon: React.ReactNode;
  pick: OptionPickData | null;
}

function PickCardInternal({ label, subtitle, borderColor, icon, pick }: PickCardInternalProps) {
  return (
    <div
      className="card flex flex-col gap-3 flex-1"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <div className="text-sm font-semibold text-text-primary">{label}</div>
          <div className="text-xs text-text-muted">{subtitle}</div>
        </div>
      </div>

      {!pick ? (
        <p className="text-xs text-text-muted text-center py-6">No pick available</p>
      ) : (
        <>
          <div className="font-mono text-sm text-text-primary">
            ${pick.strike} {pick.type} {pick.expiry}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-muted">Premium: </span>
              <span className="font-mono text-text-primary">{formatCurrency(pick.premium)}</span>
            </div>
            <div>
              <span className="text-text-muted">Bid/Ask: </span>
              <span className="font-mono text-text-primary">
                {formatCurrency(pick.bid)}/{formatCurrency(pick.ask)}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Volume: </span>
              <span className="font-mono text-text-primary">
                {pick.volume.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-text-muted">OI: </span>
              <span className="font-mono text-text-primary">{pick.oi.toLocaleString()}</span>
            </div>
            <div className="col-span-2">
              <span className="text-text-muted">IV: </span>
              <span className="font-mono text-text-primary">{(pick.iv * 100).toFixed(1)}%</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Derives placeholder option picks from the signal data.
 * In production, these would come from a dedicated API endpoint.
 */
function derivePicks(signal: Signal): {
  lotto: OptionPickData | null;
  swing: OptionPickData | null;
  leap: OptionPickData | null;
} {
  const optType = signal.direction === "BEAR" ? "PUT" as const : "CALL" as const;
  const baseStrike = signal.direction === "BEAR" ? signal.entry_low : signal.entry_high;

  const today = new Date();

  const makeExpiry = (daysOut: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysOut);
    return d.toISOString().split("T")[0];
  };

  const makePick = (dte: number, strikeMult: number): OptionPickData => ({
    strike: Math.round(baseStrike * strikeMult * 2) / 2,
    type: optType,
    expiry: makeExpiry(dte),
    premium: Math.round(baseStrike * 0.02 * (dte / 30) * 100) / 100,
    bid: Math.round(baseStrike * 0.018 * (dte / 30) * 100) / 100,
    ask: Math.round(baseStrike * 0.022 * (dte / 30) * 100) / 100,
    volume: Math.round(500 + Math.random() * 2000),
    oi: Math.round(2000 + Math.random() * 8000),
    iv: 0.3 + Math.random() * 0.2,
  });

  return {
    lotto: makePick(10, 1.05),
    swing: makePick(45, 1.03),
    leap: makePick(180, 1.0),
  };
}

export function OptionPicks({ signal, isLoading }: OptionPicksProps) {
  if (isLoading) {
    return (
      <div className="flex gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card flex-1 h-48 animate-pulse bg-bg-card-hover" />
        ))}
      </div>
    );
  }

  const picks = signal ? derivePicks(signal) : { lotto: null, swing: null, leap: null };

  return (
    <div className="flex gap-4">
      <PickCardInternal
        label="Lotto"
        subtitle="3-18 DTE / High Risk"
        borderColor="var(--accent-orange)"
        icon={<Flame size={16} style={{ color: "var(--accent-orange)" }} />}
        pick={picks.lotto}
      />
      <PickCardInternal
        label="Swing"
        subtitle="21-75 DTE / Balanced"
        borderColor="var(--accent-blue)"
        icon={<Repeat size={16} style={{ color: "var(--accent-blue)" }} />}
        pick={picks.swing}
      />
      <PickCardInternal
        label="LEAP"
        subtitle="90-545 DTE / Conviction"
        borderColor="var(--accent-purple)"
        icon={<Clock size={16} style={{ color: "var(--accent-purple)" }} />}
        pick={picks.leap}
      />
    </div>
  );
}
