import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";
import { STALE_TIMES } from "../lib/constants";

/** Live-enriched ticker descriptor inside a pillar's company universe. */
export interface PillarCompany {
  ticker: string;
  name?: string | null;
  market_cap?: number | null;
  sector?: string | null;
  price?: number | null;
  target_pct?: number | null;
  tech_score?: number | null;
  trend?: string | null;
  return_30d?: number | null;
  days_to_earnings?: number | null;
  play_score?: number | null;
  accum_label?: string;
  role?: string | null;
  cluster?: string | null;
  chokepoints?: string[];
  concepts?: string[];
  purity?: number | null;
  peg?: number | null;
  one_liner?: string;
  bottleneck_exposure?: string[];
  featured?: boolean;
}

export interface PillarTickerBrief {
  ticker: string;
  name?: string | null;
  play_score?: number | null;
  accum_label?: string;
  role?: string | null;
}

export interface PillarBottleneck {
  name: string;
  severity: "Critical" | "High" | "Moderate" | string;
  timeline?: string;
  detail?: string;
  graphify_concept?: string | null;
  gated: PillarTickerBrief[];
  beneficiaries: PillarTickerBrief[];
}

export interface PillarEmergingTech {
  name: string;
  status?: string;
  detail: string;
  players?: string[];
  disrupts?: string[];
  enables?: string[];
  timeline?: string;
}

export interface PillarRisk {
  risk: string;
  detail: string;
}

export interface SupplyChainLayer {
  layer: string;
  role?: string;
  tickers: PillarTickerBrief[];
}

export interface PreIpoCompany {
  name: string;
  category?: string;
  what: string;
  funding_raised?: string;
  valuation?: string;
  stage?: string;
  public_proxies?: string[];
  relevance?: string;
}

export interface PillarStats {
  n_companies: number;
  n_featured: number;
  n_bottlenecks: number;
  n_critical: number;
  n_pre_ipo?: number;
  total_market_cap: number;
}

export interface PillarDetail {
  available: boolean;
  key: string;
  title: string;
  tagline: string;
  accent: string;
  themes: string[];
  has_research: boolean;
  demand_thesis: string;
  supply_chain: SupplyChainLayer[];
  bottlenecks: PillarBottleneck[];
  allocation: string;
  pre_ipo: PreIpoCompany[];
  emerging_tech: PillarEmergingTech[];
  risks: PillarRisk[];
  companies: PillarCompany[];
  stats: PillarStats;
}

export interface PillarListItem {
  key: string;
  title: string;
  tagline: string;
  accent: string;
  has_research: boolean;
  stats: PillarStats;
  top_bottlenecks: { name: string; severity: string }[];
}

export interface CrossChokepoint {
  name: string;
  pillars: string[];
  why: string;
  tickers?: string[];
}

export interface PillarsOverview {
  intro: string;
  cross_pillar_chokepoints: CrossChokepoint[];
  pillars: PillarListItem[];
}

/** The 3-pillar overview: cross-pillar intro + shared chokepoints + per-pillar
 *  headline stats. Backed by GET /api/pillars. */
export function usePillars() {
  return useQuery<PillarsOverview>({
    queryKey: ["pillars", "list"],
    queryFn: () => apiClient.get("/pillars").then((r) => r.data),
    staleTime: STALE_TIMES.intel,
  });
}

/** One pillar's full detail (bottleneck matrix + company universe + emerging
 *  tech + risks). Backed by GET /api/pillars/{key}. */
export function usePillar(key?: string | null) {
  return useQuery<PillarDetail>({
    queryKey: ["pillars", "detail", key],
    queryFn: () => apiClient.get(`/pillars/${key}`).then((r) => r.data),
    staleTime: STALE_TIMES.intel,
    enabled: !!key,
  });
}
