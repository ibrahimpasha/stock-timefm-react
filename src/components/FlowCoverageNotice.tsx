import { flowCoverage, type PriceCoverage } from "../lib/flowCoverage";

export function FlowCoverageNotice({ meta }: { meta?: PriceCoverage | null }) {
  const coverage = flowCoverage(meta);
  return <p className={`text-xs ${coverage.reliable ? "text-text-muted" : "text-accent-orange"}`}>{coverage.label}</p>;
}
