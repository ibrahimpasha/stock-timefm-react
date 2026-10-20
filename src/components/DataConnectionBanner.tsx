import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LogIn, RefreshCw } from "lucide-react";
import { useDataHealth } from "../api/dataHealth";
import { connectionIssue } from "../api/connectionIssue";
import { useOnline } from "../lib/useOnline";

export function DataConnectionBanner() {
  const { isError, error, isFetching } = useDataHealth();
  const queryClient = useQueryClient();
  const online = useOnline();
  if (!isError && online) return null;
  const issue = connectionIssue(error);
  const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-bg-card px-3 text-xs font-semibold text-text-primary hover:bg-bg-card-hover lg:min-h-9";
  return (
    <section role="alert" aria-label="Data connection" className="callout mb-4 flex min-w-0 flex-wrap items-center gap-3 px-4 py-3">
      <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-sm font-medium text-text-primary">{online ? issue.message : "Offline. Live data is unavailable; displayed values may be stale."}</p>
        {online && <p className="num mt-1 break-all text-xs text-text-muted">/api/system/data-health</p>}
      </div>
      {online && issue.loginUrl && (
        <a className={actionClass} href={issue.loginUrl}>
          <LogIn size={14} aria-hidden="true" /> Sign in
        </a>
      )}
      <button type="button" className={actionClass} disabled={isFetching || !online}
        onClick={() => void queryClient.invalidateQueries({ refetchType: "active" })}>
        <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} aria-hidden="true" />
        {isFetching ? "Reconnecting" : "Retry"}
      </button>
    </section>
  );
}
