import { useQueryClient } from "@tanstack/react-query";
import { AlertCard } from "../../components/AlertCard";
import {
  useFlowAlerts,
  useDismissAlert,
  useSendDiscordAlert,
} from "../../api/flow";
import apiClient from "../../api/client";
import { Bell, Send, Trash2, Loader2 } from "lucide-react";

export function FlowAlerts() {
  const qc = useQueryClient();
  const { data: alerts, isLoading, error } = useFlowAlerts();
  const dismissMutation = useDismissAlert();
  const sendDiscordMutation = useSendDiscordAlert();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-20">
            <div className="h-4 w-24 rounded bg-text-muted/20 mb-2" />
            <div className="h-3 w-48 rounded bg-text-muted/20" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-4">
        <p className="text-xs text-accent-red">Failed to load flow alerts</p>
      </div>
    );
  }

  // Filter to only actionable alerts
  const actionableAlerts = (alerts ?? []).filter(
    (a) => a.state === "DIPPING" || a.state === "BUY_NOW" || a.state === "PEAKED" || a.state === "WAIT"
  );

  if (actionableAlerts.length === 0) {
    return (
      <div className="card flex items-center justify-center py-4">
        <Bell size={14} className="text-text-muted mr-2" />
        <span className="text-xs text-text-muted">No active flow alerts</span>
      </div>
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

  return (
    <div>
      {/* Header with action buttons */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-accent-orange" />
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Flow Alerts
          </span>
          <span className="text-xs font-mono text-text-muted">
            ({actionableAlerts.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSendAllToDiscord}
            disabled={sendDiscordMutation.isPending}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-accent-blue hover:bg-accent-blue/10 transition-colors disabled:opacity-50"
          >
            {sendDiscordMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Send size={12} />
            )}
            Send All
          </button>
          <button
            onClick={handleDismissAll}
            disabled={dismissMutation.isPending}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-colors disabled:opacity-50"
          >
            {dismissMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            Dismiss All
          </button>
        </div>
      </div>

      {/* Alert list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {actionableAlerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onDismiss={(id) => dismissMutation.mutate(id)}
            onSendDiscord={(id) => sendDiscordMutation.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}
