import type { FlowAlert } from "../lib/types";
import { ALERT_STATE_COLORS } from "../lib/constants";
import { formatCurrency, formatPercentRaw } from "../lib/utils";
import { Bell, Send, X } from "lucide-react";

interface AlertCardProps {
  alert: FlowAlert;
  onDismiss?: (id: number) => void;
  onSendDiscord?: (id: number) => void;
}

export function AlertCard({ alert, onDismiss, onSendDiscord }: AlertCardProps) {
  const stateColor = ALERT_STATE_COLORS[alert.state] || "var(--text-secondary)";
  const sideColor =
    alert.side === "Bull" ? "var(--accent-green)" : "var(--accent-red)";

  return (
    <div
      className="card flex flex-col gap-2"
      style={{ borderLeftWidth: "3px", borderLeftColor: stateColor }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={14} style={{ color: stateColor }} />
          <span
            className="text-xs font-bold uppercase px-2 py-0.5 rounded"
            style={{ color: stateColor, background: `${stateColor}20` }}
          >
            {alert.state}
          </span>
          <span className="font-mono font-bold text-text-primary">
            {alert.ticker}
          </span>
          <span
            className="text-xs font-semibold"
            style={{ color: sideColor }}
          >
            {alert.side}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onSendDiscord && (
            <button
              onClick={() => onSendDiscord(alert.id)}
              className="p-1 text-text-muted hover:text-accent-blue transition-colors"
              title="Send to Discord"
            >
              <Send size={14} />
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(alert.id)}
              className="p-1 text-text-muted hover:text-accent-red transition-colors"
              title="Dismiss"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Contract details */}
      <div className="font-mono text-sm text-text-secondary">
        ${alert.strike} {alert.option_type} &middot; {alert.premium}
      </div>

      {/* Price + dip info */}
      <div className="flex items-center gap-4 text-xs">
        <div>
          <span className="text-text-muted">Ref: </span>
          <span className="font-mono text-text-primary">
            {formatCurrency(alert.ref_price)}
          </span>
        </div>
        <div>
          <span className="text-text-muted">Now: </span>
          <span className="font-mono text-text-primary">
            {formatCurrency(alert.current_price)}
          </span>
        </div>
        {alert.dip_pct !== 0 && (
          <div>
            <span className="text-text-muted">Dip: </span>
            <span
              className="font-mono font-semibold"
              style={{
                color:
                  alert.dip_pct < 0
                    ? "var(--accent-green)"
                    : "var(--accent-red)",
              }}
            >
              {formatPercentRaw(alert.dip_pct)}
            </span>
          </div>
        )}
      </div>

      {/* Reason */}
      {alert.reason && (
        <p className="text-xs text-text-secondary">{alert.reason}</p>
      )}
    </div>
  );
}
