import { markFreshness } from "../lib/markFreshness";

export function MarkFreshness({ at, status, quality }: { at?: string | null; status?: string | null; quality?: string | null }) {
  const mark = markFreshness(at, new Date(), status, quality);
  return <span title={at ?? "No recorded mark timestamp"} className={`block text-xs font-normal ${mark.stale ? "text-accent-orange" : "text-text-muted"}`}>{mark.label}</span>;
}
