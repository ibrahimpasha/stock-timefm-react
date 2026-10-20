import type { FlowAlert } from "../lib/types";
import { ALERT_STATE_COLORS } from "../lib/constants";
import { formatCurrency, formatPercentRaw } from "../lib/utils";
import type { CSSProperties } from "react";
import { Bell, Send, X } from "lucide-react";
import { Kpi } from "./Cockpit";

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
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg-card p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="ticker text-xl leading-none">{alert.ticker}</span>
            <span className="text-sm font-semibold" style={{ color: sideColor }}>
              {alert.side}
            </span>
          </div>
          <div className="num mt-1.5 text-sm text-text-secondary">
            ${alert.strike} {alert.option_type} &middot; {alert.premium}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="tag mr-1 capitalize" style={{ "--tag": stateColor } as CSSProperties}>
            <Bell size={12} aria-hidden />
            {String(alert.state).toLowerCase()}
          </span>
          {onSendDiscord && (
            <button
              onClick={() => onSendDiscord(alert.id)}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-accent"
              title="Send to Discord"
              aria-label="Send to Discord"
            >
              <Send size={14} />
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(alert.id)}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-bg-card-hover hover:text-accent-red"
              title="Dismiss"
              aria-label="Dismiss alert"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Price + dip info */}
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Ref" value={formatCurrency(alert.ref_price)} size="md" />
        <Kpi label="Now" value={formatCurrency(alert.current_price)} size="md" />
        {alert.dip_pct !== 0 && (
          <Kpi
            label="Dip"
            value={
              <span style={{ color: alert.dip_pct < 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
                {formatPercentRaw(alert.dip_pct)}
              </span>
            }
            size="md"
          />
        )}
      </div>

      {/* Reason */}
      {alert.reason && (
        <p className="text-sm leading-relaxed text-text-secondary">{alert.reason}</p>
      )}
    </article>
  );
}
