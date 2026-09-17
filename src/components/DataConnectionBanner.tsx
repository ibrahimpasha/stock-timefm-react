import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LogIn, RefreshCw } from "lucide-react";
import { useDataHealth } from "../api/dataHealth";
import { connectionIssue } from "../api/connectionIssue";

export function DataConnectionBanner() {
  const { isError, error, isFetching } = useDataHealth();
  const queryClient = useQueryClient();
  if (!isError) return null;
  const issue = connectionIssue(error);
  const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-text-primary hover:bg-bg-card-hover";
  return (
    <section role="alert" aria-label="Data connection" className="mb-3 flex min-w-0 flex-wrap items-center gap-3 border-b border-border py-3 text-xs">
      <AlertTriangle size={16} className="shrink-0 text-accent-orange" aria-hidden="true" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="text-text-primary">{issue.message}</p>
        <p className="mt-1 break-all text-text-muted">/api/system/data-health</p>
      </div>
      {issue.loginUrl && (
        <a className={actionClass} href={issue.loginUrl}>
          <LogIn size={14} aria-hidden="true" /> Sign in
        </a>
      )}
      <button type="button" className={actionClass} disabled={isFetching}
        onClick={() => void queryClient.invalidateQueries({ refetchType: "active" })}>
        <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} aria-hidden="true" />
        {isFetching ? "Reconnecting" : "Retry"}
      </button>
    </section>
  );
}
