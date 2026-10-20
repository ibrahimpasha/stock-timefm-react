import { flowCoverage, type PriceCoverage } from "../lib/flowCoverage";

export function FlowCoverageNotice({ meta }: { meta?: PriceCoverage | null }) {
  const coverage = flowCoverage(meta);
  return coverage.reliable
    ? <p className="text-xs text-text-muted">{coverage.label}</p>
    : <p className="callout">{coverage.label}</p>;
}
