import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export type HealthStatus = "green" | "amber" | "red" | "unknown" | "paused";

export interface HealthSource {
  key: string;
  label: string;
  last_ts: string | null;
  age_seconds: number | null;
  age_human: string;
  status: HealthStatus;
  core: boolean;
  note: string;
}

export interface DataHealth {
  generated_at: string;
  overall: HealthStatus;
  sources: HealthSource[];
}

/**
 * Per-source backend feed freshness (flow ingest, intel, technicals, ML
 * retrain, Smart Trader marks, alerts, theme pulse, brief, voices, news).
 *
 * Backed by `GET /system/data-health` (60s server-side cache). Powers the
 * navbar health dot — the point is making a silently dead pipeline visible,
 * so this polls in the background every 2 minutes.
 */
export function useDataHealth() {
  return useQuery<DataHealth>({
    queryKey: ["data-health"],
    queryFn: ({ signal }) => apiClient.get("/system/data-health", {
      signal, timeout: 15_000,
    }).then((r) => {
      if (!r.data || !Array.isArray(r.data.sources) || typeof r.data.generated_at !== "string") {
        throw new Error("Invalid data-health response");
      }
      return r.data;
    }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
