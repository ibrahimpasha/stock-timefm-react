import { AlertTriangle, RefreshCw } from "lucide-react";
import { connectionIssue } from "../api/connectionIssue";

interface QueryState {
  isError: boolean;
  error?: unknown;
  data?: unknown;
  fetchStatus?: string;
  refetch: () => unknown;
}

export function QueryNotice({ queries, label }: { queries: QueryState[]; label: string }) {
  const failed = queries.filter((q) => q.isError);
  const paused = queries.some((q) => q.fetchStatus === "paused");
  if (!failed.length && !paused) return null;
  return (
    <div role="alert" className="callout flex min-w-0 flex-wrap items-center gap-2 py-1 pr-1">
      <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">
        {label}: {paused ? "requests paused; live data unavailable." : connectionIssue(failed[0].error).message}
        {queries.some((q) => q.data != null) ? " Displayed data may be incomplete or out of date." : ""}
      </span>
      <button type="button" className="flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-text-primary hover:bg-bg-card-hover lg:min-h-8"
        onClick={() => queries.forEach((q) => { void q.refetch(); })}>
        <RefreshCw size={12} aria-hidden="true" /> Retry
      </button>
    </div>
  );
}
