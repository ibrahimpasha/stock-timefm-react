import { ListOrdered, MapPin, ShieldAlert, Zap, Package } from "lucide-react";
import { formatCurrency } from "../../lib/utils";
import type { Signal } from "../../lib/types";

interface ActionPlanProps {
  signal: Signal | undefined;
  isLoading: boolean;
}

export function ActionPlan({ signal, isLoading }: ActionPlanProps) {
  if (isLoading) {
    return (
      <div className="card">
        <div className="h-40 bg-bg-card-hover rounded-lg animate-pulse" />
      </div>
    );
  }

  if (!signal) {
    return (
      <div className="card">
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Action Plan</h2>
        <p className="text-xs text-text-muted text-center py-4">No signal loaded.</p>
      </div>
    );
  }

  const stopLoss =
    signal.direction === "BULL"
      ? signal.entry_low * 0.97
      : signal.entry_high * 1.03;

  const steps = [
    {
      icon: <MapPin size={14} className="text-accent-green" />,
      title: "Entry Zone",
      detail: `${formatCurrency(signal.entry_low)} - ${formatCurrency(signal.entry_high)}`,
      description: "Wait for price to enter this zone before initiating position.",
    },
    {
      icon: <ShieldAlert size={14} className="text-accent-red" />,
      title: "Stop Loss",
      detail: formatCurrency(stopLoss),
      description: "Exit entire position if price breaks this level.",
    },
    {
      icon: <Zap size={14} className="text-accent-orange" />,
      title: "Trigger Confirmation",
      detail: signal.direction === "BULL" ? "Price holds above entry low" : "Price holds below entry high",
      description: "Confirm trigger before full allocation.",
    },
    {
      icon: <Package size={14} className="text-accent-purple" />,
      title: "Option Selection",
      detail: "Select from Lotto / Swing / LEAP picks above",
      description: "Choose risk tier based on conviction and horizon.",
    },
  ];

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <ListOrdered size={16} className="text-accent-blue" />
        <h2 className="text-sm font-semibold text-text-secondary">Action Plan</h2>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono"
                style={{ background: "rgba(88, 166, 255, 0.15)", color: "var(--accent-blue)" }}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className="w-px flex-1 mt-1" style={{ background: "var(--border)" }} />
              )}
            </div>
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2 mb-0.5">
                {step.icon}
                <span className="text-sm font-semibold text-text-primary">{step.title}</span>
              </div>
              <div className="text-sm font-mono text-text-primary mb-0.5">{step.detail}</div>
              <p className="text-xs text-text-muted">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
