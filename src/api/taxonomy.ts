/**
 * React Query hook for the static sector / macro-driver taxonomy.
 *
 * Source file: `~/stock-timefm/results/intelligence_taxonomy.json` (~9k lines,
 * updated rarely). Served by `/api/taxonomy`. Cached for an hour client-side;
 * the backend caches it in-process so server restarts pick up edits.
 *
 * Used today by `IFlowTracker` to group the ticker grid into collapsible
 * sector themes. Lift more callers up as new surfaces consume it.
 */
import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export type Direction = "BENEFICIARY" | "PRESSURED" | "MIXED" | string;

export interface TaxonomyEntry {
  category: string;
  /** Clustered investment theme (84 total, e.g. EUV_LITHO_WFE). Added in
   *  the 2026-05 clustering pass; the raw subcategory string lives in
   *  `subcategory` alongside. */
  theme?: string;
  subcategory: string;
  direction: Direction;
  reasoning: string;
  macros: string[]; // e.g. ["M4", "M1"]
  bottlenecks: string[]; // e.g. ["B7", "B3"]
}

export interface MacroDef {
  label: string;
  detail: string;
  reversibility_risk: string;
}

export interface BottleneckDef {
  label: string;
  detail: string;
  drives: string[];
}

export interface TaxonomyTickerRaw {
  ticker: string;
  direction: Direction;
  reasoning: string;
  macros: string[];
  bottlenecks: string[];
}

export interface Taxonomy {
  metadata: Record<string, unknown>;
  macros: Record<string, MacroDef>;
  bottlenecks: Record<string, BottleneckDef>;
  category_descriptions: Record<string, string>;
  /** One-line investment thesis per theme: `{category: {theme: description}}`.
   *  Added in the 2026-05 clustering pass. Empty when the source JSON
   *  predates clustering. */
  theme_descriptions?: Record<string, Record<string, string>>;
  taxonomy: Record<string, Record<string, TaxonomyTickerRaw[]>>;
  ticker_lookup: Record<string, TaxonomyEntry>;
  /** Optional — LLM-curated subcategory clusters keyed by category, then by
   *  human-readable cluster name → list of raw subcategory keys. Produced
   *  by scripts/cluster_subcategories.py. Frontend falls back to algorithmic
   *  prefix merging when this map is empty or missing the category. */
  subcategory_clusters?: Record<string, Record<string, string[]>>;
  /** Direct subcategory-name lookup: `{subcategory_name: {category, theme,
   *  tickers}}`. 631 entries — useful for "what theme does this subcat
   *  belong to" without walking the tree. */
  subcategory_index?: Record<
    string,
    { category: string; theme: string; tickers: string[] }
  >;
}

export function useTaxonomy() {
  return useQuery<Taxonomy>({
    queryKey: ["taxonomy"],
    queryFn: () => apiClient.get<Taxonomy>("/taxonomy").then((r) => r.data),
    staleTime: 60 * 60_000, // 1 hour — file rarely changes
  });
}
