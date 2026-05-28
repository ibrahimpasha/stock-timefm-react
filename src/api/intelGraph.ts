import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";
import type { IntelGraphContext } from "../lib/types";

/** Structural context for a ticker from the Understand-Anything graph:
 *  competitors (contradicts edges) + supply-chain neighbors (builds_on)
 *  + cited entities + key claims. Bias comes from intelligence.db so it
 *  stays fresh between weekly graph re-ingests.
 *
 *  Backed by GET /api/intel-graph/context?ticker=X. Returns
 *  `{available: false, reason}` when the graph hasn't been built — the
 *  UI degrades by hiding the card rather than erroring. */
export function useIntelGraphContext(ticker: string, limit: number = 8) {
  return useQuery<IntelGraphContext>({
    queryKey: ["intel-graph", "context", ticker, limit],
    queryFn: async () => {
      const { data } = await apiClient.get<IntelGraphContext>(
        `/intel-graph/context?ticker=${encodeURIComponent(ticker)}&limit=${limit}`
      );
      return data;
    },
    staleTime: STALE_TIMES.intel,
    enabled: !!ticker,
  });
}
