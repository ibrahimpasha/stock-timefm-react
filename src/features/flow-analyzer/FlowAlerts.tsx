import { useQueryClient } from "@tanstack/react-query";
import {
  useFlowAlerts,
  useDismissAlert,
  useSendDiscordAlert,
} from "../../api/flow";
import apiClient from "../../api/client";
import { formatCurrency, formatPercentRaw } from "../../lib/utils";
import type { FlowAlert } from "../../lib/types";
import { TileGrid, Tile, KpiTile, ActionCard, CockpitButton } from "../../components/Cockpit";
import { Send, Trash2, Loader2, X } from "lucide-react";

const STATE_META: Record<string, { label: string; tone: "up" | "down" | "warn" | "neutral" }> = {
  BUY_NOW: { label: "Buy now", tone: "up" },
  DIPPING: { label: "Dipping", tone: "warn" },
  PEAKED: { label: "Peaked", tone: "down" },
  WAIT: { label: "Waiting", tone: "neutral" },
};
const STATE_ORDER = ["BUY_NOW", "DIPPING", "PEAKED", "WAIT"] as const;

export function FlowAlerts() {
  const qc = useQueryClient();
  const { data: alerts, isLoading, error } = useFlowAlerts();
  const dismissMutation = useDismissAlert();
  const sendDiscordMutation = useSendDiscordAlert();

  if (isLoading) {
    return (
      <TileGrid className="animate-pulse">
        {[0, 1, 2].map((i) => (
          <Tile key={i} span={4}>
            <div className="h-4 w-24 rounded bg-text-muted/20" />
            <div className="h-3 w-48 rounded bg-text-muted/20" />
          </Tile>
        ))}
      </TileGrid>
    );
  }

  if (error) {
    return (
      <p className="py-4 text-center text-sm text-accent-red">Failed to load flow alerts</p>
    );
  }

  // Filter to only actionable alerts
  const actionableAlerts = (alerts ?? []).filter(
    (a) => a.state === "DIPPING" || a.state === "BUY_NOW" || a.state === "PEAKED" || a.state === "WAIT"
  );

  if (actionableAlerts.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-text-muted">No active flow alerts</p>
    );
  }

  const handleDismissAll = async () => {
    try {
      await apiClient.post("/flow/alerts/dismiss-all");
      qc.invalidateQueries({ queryKey: ["flow", "alerts"] });
    } catch { /* ignore */ }
  };

  const handleSendAllToDiscord = () => {
    actionableAlerts.forEach((alert) => {
      sendDiscordMutation.mutate(alert.id);
    });
  };

  const counts = Object.fromEntries(
    STATE_ORDER.map((s) => [s, actionableAlerts.filter((a) => a.state === s).length]),
  ) as Record<(typeof STATE_ORDER)[number], number>;
  const bulls = actionableAlerts.filter((a) => a.side === "Bull").length;
  // Decision order: buy-now first, then dipping, peaked, waiting.
  const ordered = [...actionableAlerts].sort(
    (a, b) => STATE_ORDER.indexOf(a.state as never) - STATE_ORDER.indexOf(b.state as never),
  );

  return (
    <TileGrid>
      <KpiTile label="Buy now" value={counts.BUY_NOW} tone="up" sub={`of ${actionableAlerts.length} actionable alerts`} />
      <KpiTile label="Dipping" value={counts.DIPPING} sub="waiting for the entry" />
      <KpiTile label="Peaked" value={counts.PEAKED} sub="past the move" />
      <KpiTile
        label="Bull / bear"
        value={<>{bulls}<span className="text-text-muted"> / </span>{actionableAlerts.length - bulls}</>}
        sub={`${counts.WAIT} waiting`}
      />

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 lg:col-span-12">
        <span className="text-sm text-text-secondary">
          Flow alerts <span className="num text-text-muted">{actionableAlerts.length}</span>
          <span className="text-text-muted"> · dipping, buy-now, peaked and waiting setups from tracked flow</span>
        </span>
        <div className="flex items-center gap-2">
          <CockpitButton primary onClick={handleSendAllToDiscord} disabled={sendDiscordMutation.isPending}>
            {sendDiscordMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send all
          </CockpitButton>
          <CockpitButton onClick={() => void handleDismissAll()} disabled={dismissMutation.isPending}>
            {dismissMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Dismiss all
          </CockpitButton>
        </div>
      </div>

      {ordered.map((alert) => (
        <div key={alert.id} className="min-w-0 lg:col-span-4">
          <AlertAction
            alert={alert}
            onDismiss={(id) => dismissMutation.mutate(id)}
            onSendDiscord={(id) => sendDiscordMutation.mutate(id)}
          />
        </div>
      ))}
    </TileGrid>
  );
}

function AlertAction({
  alert,
  onDismiss,
  onSendDiscord,
}: {
  alert: FlowAlert;
  onDismiss: (id: number) => void;
  onSendDiscord: (id: number) => void;
}) {
  const meta = STATE_META[alert.state] ?? { label: String(alert.state).toLowerCase(), tone: "neutral" as const };
  const bull = alert.side === "Bull";
  return (
    <ActionCard
      kind={meta.label}
      tone={meta.tone}
      when={<span className="num">${alert.strike} {alert.option_type} · {alert.premium}</span>}
      ticker={alert.ticker}
      delta={alert.side}
      deltaTone={bull ? "up" : "down"}
      actions={
        <>
          <CockpitButton onClick={() => onSendDiscord(alert.id)} title="Send to Discord">
            <Send size={14} /> Discord
          </CockpitButton>
          <CockpitButton onClick={() => onDismiss(alert.id)} title="Dismiss alert">
            <X size={14} /> Dismiss
          </CockpitButton>
        </>
      }
    >
      <span className="num flex flex-wrap gap-x-4 text-text-primary">
        <span><span className="text-text-muted">Ref </span>{formatCurrency(alert.ref_price)}</span>
        <span><span className="text-text-muted">Now </span>{formatCurrency(alert.current_price)}</span>
        {alert.dip_pct !== 0 && (
          <span style={{ color: alert.dip_pct < 0 ? "var(--accent-green)" : "var(--accent-red)" }}>
            <span className="text-text-muted">Dip </span>{formatPercentRaw(alert.dip_pct)}
          </span>
        )}
      </span>
      {alert.reason && <span className="mt-1 block">{alert.reason}</span>}
    </ActionCard>
  );
}
