import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Cross-tab persistence for the dashboard's view/filter state.
 *
 * The Command Center renders one tab at a time via `switch(activeTab)` — the
 * inactive tab is UNMOUNTED, so any `useState` filter inside it is destroyed on
 * every tab switch. That's why selecting Heat Map filters and coming back, or
 * clicking a ticker → iFlow → back, reset the Heat Map view.
 *
 * The fix: hold those filters here, in app-level Zustand state that outlives the
 * component lifecycle. Kept in a SEPARATE store from `useAppStore` on purpose —
 * `useAppStore` holds `activeTicker` and is read by every page, so adding churny
 * filter fields there would re-render the whole app (see repo CLAUDE.md). Each
 * tab subscribes only to its own slice here.
 *
 * Persisted to sessionStorage: survives tab switches and in-session reloads, but
 * clears when the browser tab closes — so yesterday's date selection doesn't
 * silently resurface tomorrow. Sets are serialized via the replacer/reviver.
 */

// ── Heat Map filter types (mirror FlowHeatmap.tsx) ──────────────────
export type HmSizeMetric = "premium" | "entries" | "conviction" | "market_cap";
export type HmColorMetric = "bias" | "pl" | "target" | "technical" | "pattern";
export type HmGroupBy = "none" | "sector" | "theme" | "subcategory";
export type HmPulse =
  | "off" | "earnings" | "ml" | "play" | "technical" | "pattern";

export interface HeatmapFilters {
  selectedDates: Set<string>;
  sizeMetric: HmSizeMetric;
  colorMetric: HmColorMetric;
  groupBy: HmGroupBy;
  pulse: HmPulse;
  pulseThreshold: number;
  pulseGroup: boolean;
  // Tile filters — hide tiles below/over the slider value when the toggle is on.
  mlOn: boolean;
  mlMin: number;
  playOn: boolean;
  playMin: number;
  earnOn: boolean;
  earnDays: number; // also drives the "earnings" pulse window
}

const VALID_PULSE = new Set<HmPulse>(["off", "earnings", "ml", "play", "technical", "pattern"]);

// ── iFlow Tracker filter types (mirror IFlowTracker.tsx) ────────────
export type IfBias = "all" | "bullish" | "bearish";
export type IfDte = "all" | "lotto" | "swing" | "leap";
export type IfSort = "entries" | "premium" | "score" | "escalating" | "returns" | "recent";
export type IfViewMode = "grid" | "tape";
export type IfEarnings = "all" | "1w" | "2w" | "1m" | "2m";
export type IfWatchView = "tickers" | "contracts" | "both";
export type IfGroupMode = "subcat" | "macro" | "flat";
// Which signal lights a grid card's green border. "escalating" preserves the
// historical behavior (strikes escalating); the others let the user re-point
// the highlight at bullish accumulation, the Theme-Pulse play score, or ML.
export type IfHighlight = "off" | "escalating" | "accum" | "play" | "ml";

export interface IFlowFilters {
  bias: IfBias;
  dte: IfDte;
  sort: IfSort;
  viewMode: IfViewMode;
  earningsWindow: IfEarnings;
  tradersOnly: boolean;
  selectedAuthors: Set<string>;
  search: string;
  selectedDates: Set<string>;
  watchView: IfWatchView;
  groupMode: IfGroupMode;
  // Grid-card green-border highlight (grid view only).
  highlightMode: IfHighlight;
  highlightMin: number; // 0-100 threshold for the play / ml highlight modes
}

const VALID_HIGHLIGHT = new Set<IfHighlight>(["off", "escalating", "accum", "play", "ml"]);

// ── EntryTape filter types (mirror EntryTape.tsx) ───────────────────
export type TapeFilterMode =
  | "none" | "notable_nscore" | "notable_ml" | "notable_both" | "avg_sweet" | "kian"
  | "outliers";
export type TapeSortKey =
  | "time" | "ticker" | "side" | "action" | "contract" | "dte" | "voi" | "ask"
  | "atm" | "premium" | "pnl" | "score" | "ml" | "setup" | "avg" | "pred_peak";
export type TapeSortDir = "asc" | "desc";

export interface TapeFilters {
  filterMode: TapeFilterMode;
  sortKey: TapeSortKey;
  sortDir: TapeSortDir;
  // "outliers" mode: keep only contracts whose strike is at least this far
  // out-of-the-money (% to ATM). Catches deep-OTM convexity bets (e.g. a 40C
  // on a $13 stock = +208% OTM).
  outlierMin: number;
}

interface DashboardFiltersStore {
  heatmap: HeatmapFilters;
  iflow: IFlowFilters;
  tape: TapeFilters;
  /** Shallow-merge a partial patch into a slice (preserves the other fields). */
  patchHeatmap: (p: Partial<HeatmapFilters>) => void;
  patchIFlow: (p: Partial<IFlowFilters>) => void;
  patchTape: (p: Partial<TapeFilters>) => void;
}

const HEATMAP_DEFAULTS: HeatmapFilters = {
  selectedDates: new Set<string>(),
  sizeMetric: "premium",
  colorMetric: "bias",
  groupBy: "none",
  pulse: "off",
  pulseThreshold: 60,
  pulseGroup: false,
  mlOn: false,
  mlMin: 80,
  playOn: false,
  playMin: 80,
  earnOn: false,
  earnDays: 30,
};

const IFLOW_DEFAULTS: IFlowFilters = {
  bias: "all",
  dte: "all",
  sort: "entries",
  viewMode: "grid",
  earningsWindow: "all",
  tradersOnly: false,
  selectedAuthors: new Set<string>(),
  search: "",
  selectedDates: new Set<string>(),
  watchView: "tickers",
  groupMode: "subcat",
  highlightMode: "escalating",
  highlightMin: 80,
};

const TAPE_DEFAULTS: TapeFilters = {
  filterMode: "none",
  sortKey: "time",
  sortDir: "desc",
  outlierMin: 50,
};

// JSON.stringify/parse can't round-trip a Set — tag it on the way out, rebuild
// on the way in. Handles Sets anywhere in the persisted tree.
const setStorage = createJSONStorage(() => sessionStorage, {
  replacer: (_k, v) => (v instanceof Set ? { __set: Array.from(v) } : v),
  reviver: (_k, v) =>
    v && typeof v === "object" && Array.isArray((v as { __set?: unknown }).__set)
      ? new Set((v as { __set: string[] }).__set)
      : v,
});

export const useDashboardFilters = create<DashboardFiltersStore>()(
  persist(
    (set) => ({
      heatmap: HEATMAP_DEFAULTS,
      iflow: IFLOW_DEFAULTS,
      tape: TAPE_DEFAULTS,
      patchHeatmap: (p) => set((s) => ({ heatmap: { ...s.heatmap, ...p } })),
      patchIFlow: (p) => set((s) => ({ iflow: { ...s.iflow, ...p } })),
      patchTape: (p) => set((s) => ({ tape: { ...s.tape, ...p } })),
    }),
    {
      name: "stock-timefm-dashboard-filters",
      storage: setStorage,
      partialize: (s) => ({ heatmap: s.heatmap, iflow: s.iflow, tape: s.tape }),
      // Deep-merge per slice so a newly-added filter field keeps its default
      // instead of becoming undefined for users with old persisted state.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DashboardFiltersStore>;
        const heatmap = { ...current.heatmap, ...(p.heatmap ?? {}) };
        // Old persisted pulse values (earnings10/20/30) no longer exist — reset.
        if (!VALID_PULSE.has(heatmap.pulse)) heatmap.pulse = "off";
        const iflow = { ...current.iflow, ...(p.iflow ?? {}) };
        if (!VALID_HIGHLIGHT.has(iflow.highlightMode)) iflow.highlightMode = "escalating";
        return {
          ...current,
          heatmap,
          iflow,
          tape: { ...current.tape, ...(p.tape ?? {}) },
        };
      },
    },
  ),
);
