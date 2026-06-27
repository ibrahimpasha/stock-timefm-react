/**
 * One collapsible sector-theme section in the iFlow ticker grid.
 *
 * Sub-grouping is parameterized:
 *   - `subGroupBy="macro"` (default): buckets by primary MACRO driver
 *     (M1..M10). Tickers without a macro tag fall into a "no macro" bucket.
 *     Macros sort numerically M1 → M10 → no-macro.
 *   - `subGroupBy="theme"`: buckets by clustered THEME (e.g. EUV_LITHO_WFE
 *     within AI_INFRASTRUCTURE) — the LLM-curated broad subcategory; ~84
 *     across all categories. The label includes the theme description when
 *     `themeDescriptions` is provided. The raw 631 subcategory labels are
 *     intentionally NOT exposed as a sub-group mode — too fine-grained.
 *
 * Section header: category name + ticker count + bull/bear + premium +
 * dominant bottleneck chip (the buckets themselves announce the sub-axis).
 *
 * Tickers are pre-filtered/sorted by the parent. Renderer is injected so the
 * existing TickerCard wiring (intel/voices badges, selection state, flow-P/L
 * badge) carries through unchanged.
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import type { TrackedTicker } from "../../../lib/types";
import type { TaxonomyEntry, MacroDef, BottleneckDef } from "../../../api/taxonomy";
import type { EscRollup } from "./hooks";
import { parsePremium } from "./utils";
import { formatPremium } from "../../../lib/utils";

const NO_MACRO = "—";
const NO_THEME = "—";

export type SubGroupBy = "macro" | "theme";

export interface ThemeSectionProps {
  category: string;
  categoryDescription?: string;
  visibleTickers: TrackedTicker[];
  lookupMap: Record<string, TaxonomyEntry>;
  macros: Record<string, MacroDef>;
  bottlenecks: Record<string, BottleneckDef>;
  initiallyExpanded?: boolean;
  renderCard: (t: TrackedTicker) => React.ReactNode;
  /** What to bucket the category's tickers by. Default "macro". */
  subGroupBy?: SubGroupBy;
  /** When `subGroupBy="theme"`, map of theme key → one-line description for
   *  the tooltip / secondary label. Optional. */
  themeDescriptions?: Record<string, string>;
  /** Per-ticker 14d escalation rollup from /flow/iflow/escalating-batch.
   *  When provided, the section header and each sub-bucket header show a
   *  green "↗ N" chip for the count of escalating tickers in that bucket. */
  escMap?: Record<string, EscRollup>;
}

function escCounts(
  list: TrackedTicker[],
  escMap?: Record<string, EscRollup>,
): { esc: number; bullDom: number; bearDom: number } {
  if (!escMap) return { esc: 0, bullDom: 0, bearDom: 0 };
  let esc = 0;
  let bullDom = 0;
  let bearDom = 0;
  for (const t of list) {
    const r = escMap[t.ticker];
    if (!r) continue;
    if (r.escalating) esc++;
    if (r.dominant_side === "Bull") bullDom++;
    else if (r.dominant_side === "Bear") bearDom++;
  }
  return { esc, bullDom, bearDom };
}

function lookupDef<T>(code: string, dict: Record<string, T>): T | undefined {
  if (!code) return undefined;
  if (dict[code]) return dict[code];
  const key = Object.keys(dict).find((k) => k.startsWith(code + "_"));
  return key ? dict[key] : undefined;
}

function shortLabel(label: string, max = 32): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1) + "…";
}

function macroSortKey(code: string): number {
  if (code === NO_MACRO) return 999;
  const n = parseInt(code.replace(/^M/, ""), 10);
  return Number.isNaN(n) ? 998 : n;
}

export function ThemeSection({
  category,
  categoryDescription,
  visibleTickers,
  lookupMap,
  macros,
  bottlenecks,
  initiallyExpanded = true,
  renderCard,
  subGroupBy = "macro",
  themeDescriptions,
  escMap,
}: ThemeSectionProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const { bySubGroup, bull, bear, premium, topBottleneck } = useMemo(() => {
    const map: Record<string, TrackedTicker[]> = {};
    let bullSum = 0;
    let bearSum = 0;
    let premSum = 0;
    const bnCounts: Record<string, number> = {};

    for (const t of visibleTickers) {
      const entry = lookupMap[t.ticker];
      const key =
        subGroupBy === "theme"
          ? entry?.theme || NO_THEME
          : entry?.macros?.[0] || NO_MACRO;
      (map[key] ||= []).push(t);
      bullSum += t.bullish;
      bearSum += t.bearish;
      premSum += parsePremium(t.net_premium || "$0");
      for (const b of entry?.bottlenecks || []) bnCounts[b] = (bnCounts[b] || 0) + 1;
    }

    let topBn: string | null = null;
    let topBnCount = 0;
    for (const [b, n] of Object.entries(bnCounts)) {
      if (n > topBnCount) {
        topBn = b;
        topBnCount = n;
      }
    }

    return {
      bySubGroup: map,
      bull: bullSum,
      bear: bearSum,
      premium: premSum,
      topBottleneck: topBn,
    };
  }, [visibleTickers, lookupMap, subGroupBy]);

  const bnDef = topBottleneck ? lookupDef(topBottleneck, bottlenecks) : undefined;
  const tickerCount = visibleTickers.length;
  const netBull = bull > bear;
  const catEsc = useMemo(
    () => escCounts(visibleTickers, escMap),
    [visibleTickers, escMap],
  );

  const subGroupOrder = useMemo(() => {
    const keys = Object.keys(bySubGroup);
    if (subGroupBy === "macro") {
      keys.sort((a, b) => macroSortKey(a) - macroSortKey(b));
    } else {
      // Theme mode: largest bucket first; "no theme" sentinel always last.
      keys.sort((a, b) => {
        if (a === NO_THEME) return 1;
        if (b === NO_THEME) return -1;
        const sizeDelta = bySubGroup[b].length - bySubGroup[a].length;
        if (sizeDelta !== 0) return sizeDelta;
        return a.localeCompare(b);
      });
    }
    return keys;
  }, [bySubGroup, subGroupBy]);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-bg-card-hover transition-colors text-left"
        title={categoryDescription || ""}
      >
        {expanded ? (
          <ChevronDown size={14} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-text-muted shrink-0" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-text-primary">
          {category.replace(/_/g, " ")}
        </span>
        <span className="text-xs font-mono text-text-muted">{tickerCount} tkr</span>
        <span className="text-xs font-mono">
          <span style={{ color: "var(--accent-green)" }}>{bull}B</span>
          <span className="text-text-muted">/</span>
          <span style={{ color: "var(--accent-red)" }}>{bear}R</span>
        </span>
        <span
          className="text-xs font-mono"
          style={{ color: netBull ? "var(--accent-green)" : "var(--accent-red)" }}
        >
          {formatPremium(premium)}
        </span>
        {catEsc.esc > 0 && (
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
            style={{
              background: "color-mix(in srgb, var(--accent-green) 10%, transparent)",
              color: "var(--accent-green)",
              border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
            }}
            title={`${catEsc.esc} ticker${catEsc.esc === 1 ? "" : "s"} with strike-ladder escalation in last 14d (${catEsc.bullDom} bull-dominant, ${catEsc.bearDom} bear-dominant overall)`}
          >
            <TrendingUp size={10} />
            {catEsc.esc}
          </span>
        )}
        {bnDef && (
          <span className="ml-auto flex items-center gap-2 text-[10px] font-mono text-text-muted truncate min-w-0">
            <span
              className="px-1.5 py-0.5 rounded truncate"
              style={{
                background: "color-mix(in srgb, var(--accent-orange) 10%, transparent)",
                color: "var(--accent-orange)",
                border: "1px solid color-mix(in srgb, var(--accent-orange) 25%, transparent)",
              }}
              title={`${topBottleneck}: ${bnDef.detail}`}
            >
              {topBottleneck} {shortLabel(bnDef.label, 28)}
            </span>
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3 pl-4 border-l border-border ml-1">
          {subGroupOrder.map((key) => {
            const items = bySubGroup[key];
            if (!items.length) return null;
            const isThemeMode = subGroupBy === "theme";
            const isSentinel = key === (isThemeMode ? NO_THEME : NO_MACRO);
            const macroDef =
              !isThemeMode && !isSentinel ? lookupDef(key, macros) : undefined;
            const themeDesc =
              isThemeMode && !isSentinel ? themeDescriptions?.[key] : undefined;
            const chipLabel = isThemeMode ? key.replace(/_/g, " ") : key;
            const secondary = isThemeMode
              ? themeDesc || (isSentinel ? "no theme tag" : "")
              : macroDef
                ? macroDef.label
                : "no macro tag";
            return (
              <div key={key}>
                <div
                  className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold flex items-center gap-1.5"
                  title={
                    isThemeMode
                      ? themeDesc || (isSentinel ? "Tickers with no theme tag" : "")
                      : macroDef?.detail ||
                        (isSentinel ? "Tickers without a macro driver tag" : "")
                  }
                >
                  <span
                    className="px-1.5 py-0.5 rounded font-mono"
                    style={{
                      background: isSentinel
                        ? "transparent"
                        : isThemeMode
                          ? "color-mix(in srgb, var(--accent-purple) 10%, transparent)"
                          : "color-mix(in srgb, var(--accent-blue) 10%, transparent)",
                      color: isSentinel
                        ? "var(--text-muted)"
                        : isThemeMode
                          ? "var(--accent-purple, #c084fc)"
                          : "var(--accent-blue)",
                      border: isSentinel
                        ? "1px dashed var(--border)"
                        : isThemeMode
                          ? "1px solid color-mix(in srgb, var(--accent-purple) 25%, transparent)"
                          : "1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)",
                    }}
                  >
                    {chipLabel}
                  </span>
                  <span className="text-text-secondary normal-case tracking-normal">
                    {secondary}
                  </span>
                  <span className="opacity-60 font-mono normal-case tracking-normal">
                    {items.length}
                  </span>
                  {(() => {
                    const sc = escCounts(items, escMap);
                    return sc.esc > 0 ? (
                      <span
                        className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] font-mono normal-case tracking-normal"
                        style={{
                          background: "color-mix(in srgb, var(--accent-green) 10%, transparent)",
                          color: "var(--accent-green)",
                          border: "1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)",
                        }}
                        title={`${sc.esc} of ${items.length} ticker${items.length === 1 ? "" : "s"} escalating in last 14d`}
                      >
                        <TrendingUp size={9} />
                        {sc.esc}
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {items.map((t) => (
                    <div key={t.ticker}>{renderCard(t)}</div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
