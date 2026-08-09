/**
 * Sector rotation (RRG-style) + the per-strike GEX matrix.
 * Backend: GET /market/sector-rotation, /market/gex-matrix[/tickers].
 * Both read persisted tables (sector_prices, gex_matrix) refreshed on the
 * daily technicals timer — no yfinance in the request path, so these are cheap.
 */
import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

export type Quadrant = "LEADING" | "WEAKENING" | "LAGGING" | "IMPROVING";
export type RotationWindow = "1W" | "1M" | "3M" | "6M";

export interface RotationPoint {
  date: string;
  ratio: number;
  mom: number;
}

export interface SectorRow {
  ticker: string;
  label: string;
  short: string;
  price: number;
  ratio: number;
  mom: number;
  quadrant: Quadrant;
  score: number;
  change_pct: number;
  rank: number;
  tail: RotationPoint[];
  spark: number[];
  history: { date: string; ratio: number }[];
}

export interface RotationAlert {
  kind: "NEW LEADER" | "IMPROVING" | "WARNING";
  ticker: string;
  label: string;
  date: string;
  from: Quadrant;
  to: Quadrant;
  text: string;
}

export type RotationInsight =
  | { kind: "rotation"; out: { ticker: string; label: string }[]; into: { ticker: string; label: string }[] }
  | { kind: "strongest" | "weakest"; ticker: string; label: string; score: number; change_pct: number };

export interface RotationResponse {
  ok: boolean;
  reason?: string;
  window: RotationWindow;
  benchmark?: string;
  as_of?: string;
  start?: string;
  sessions?: number;
  sectors: SectorRow[];
  alerts: RotationAlert[];
  insights: RotationInsight[];
}

export function useSectorRotation(window: RotationWindow = "1M") {
  return useQuery<RotationResponse>({
    queryKey: ["sector-rotation", window],
    queryFn: () =>
      apiClient
        .get<RotationResponse>(`/market/sector-rotation?window=${window}`)
        .then((r) => r.data),
    staleTime: 60 * 60 * 1000, // server-side data rolls once a day
  });
}

/**
 * Same payload shape as sectors, but relative strength is each intel theme's
 * share of the day's total option premium. Backed by theme_heat_history, so
 * "sessions" are flow-days — the corpus skips days with no flow.
 */
export function useThemeRotation(window: RotationWindow = "1M", enabled = true) {
  return useQuery<RotationResponse>({
    queryKey: ["theme-rotation", window],
    queryFn: () =>
      apiClient
        .get<RotationResponse>(`/market/theme-rotation?window=${window}`)
        .then((r) => r.data),
    staleTime: 60 * 60 * 1000,
    enabled,
  });
}

/* ── GEX matrix ─────────────────────────────────────────────────────────── */

export type GexMetric = "gex" | "vex" | "oi" | "vol" | "unusual";

export interface GexCell {
  gex: number | null;
  vex: number | null;
  oi: number;
  vol: number;
  call_oi: number;
  put_oi: number;
  call_vol: number;
  put_vol: number;
  unusual: number | null;
}

export interface GexExpiry {
  expiry: string;
  dte: number | null;
  is_0dte: boolean;
  label: string;
}

export interface GexMatrixResponse {
  ok: boolean;
  reason?: string;
  ticker: string;
  spot?: number;
  updated_at?: string;
  expiries: GexExpiry[];
  strikes: number[];
  /** keyed `${expiry}|${strike}` */
  cells: Record<string, GexCell>;
  totals?: Record<string, { gex: number; oi: number; wall: number | null }>;
}

export function useGexMatrix(ticker: string, expiries = 8, band = 40) {
  return useQuery<GexMatrixResponse>({
    queryKey: ["gex-matrix", ticker, expiries, band],
    queryFn: () =>
      apiClient
        .get<GexMatrixResponse>(
          `/market/gex-matrix?ticker=${encodeURIComponent(ticker)}&expiries=${expiries}&band=${band}`,
        )
        .then((r) => r.data),
    enabled: !!ticker,
    staleTime: 30 * 60 * 1000,
  });
}

export interface GexTicker {
  ticker: string;
  spot: number | null;
  updated_at: string;
  cells: number;
}

export function useGexTickers() {
  return useQuery<GexTicker[]>({
    queryKey: ["gex-matrix-tickers"],
    queryFn: () =>
      apiClient
        .get<{ tickers: GexTicker[] }>("/market/gex-matrix/tickers")
        .then((r) => r.data.tickers ?? []),
    staleTime: 30 * 60 * 1000,
  });
}
