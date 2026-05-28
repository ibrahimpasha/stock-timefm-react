# CLAUDE.md — src/features/

Feature components — organized by surface, not by tech.

## Layout

| Dir | Components | Used on routes |
|---|---|---|
| `command-center/` | ActionPanel, ModelBreakdown, TrustScores, IntelligencePanel, IntelligencePanelV2, FlowTape, TickerHero, ScanGrid, DecisionHero | `/command-center`, `/command-center-v2` |
| `flow-analyzer/` | **IFlowTracker** (the big one), SystemRiskStatus, PickHistory, etc. | `/command-center` (right column) |
| `forecast/` | ForecastChart, ModelLegend, etc. | `/` |
| `intelligence/` | Category browser, history view | `/intel` |
| `model-eval/` | Trust score tables, calibration plots | `/eval` |
| `signal-analysis/` | LiveExecution, SignalThesis, etc. | `/signals` |

## Cross-Cutting Patterns

### Reading the active ticker

```ts
import { useAppStore } from "../../store/useAppStore";

const ticker = useAppStore((s) => s.activeTicker);
const setActiveTicker = useAppStore((s) => s.setActiveTicker);
```

**Never** take `ticker` as a prop unless the component is intentionally rendering for a non-active ticker (e.g., the per-row P/L badge inside `EntryRow` takes a `price` prop because the parent already resolved the ticker context).

### Fetching data

Use the hooks in `src/api/*.ts`. If a hook doesn't exist for what you need, add one there — don't fetch inline. Hooks follow this shape:

```ts
export function useSomething(arg: string) {
  return useQuery<ResponseT>({
    queryKey: ["something", arg],
    queryFn: () => apiClient.get(`/path?x=${arg}`).then((r) => r.data),
    staleTime: STALE_TIMES.flow,
    enabled: !!arg,
  });
}
```

### Refresh + relative timestamp pattern

Both Intelligence panels expose a refresh button + "updated 23m ago" tag. Copy from `IntelligencePanel.tsx` or `IntelligencePanelV2.tsx`:

```ts
const refresh = useMutation({
  mutationFn: () => apiClient.post(`/intel/refresh?ticker=${ticker}`),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-latest", ticker] }),
});
```

The `relativeAge(iso)` and `absoluteAge(iso)` helpers now live in `src/lib/utils.ts` — both panels import them. Use the same pair anywhere you need to render a "X ago" tag with a tooltip showing the absolute timestamp.

Intelligence color maps (`INTEL_TAG_COLORS` for CATALYST/VALUATION/RISK/FLOW bullets, `INTEL_VIEW_COLORS` for BULL/BEAR/NEUTRAL) live in `src/lib/constants.ts`.

## The Big One — `flow-analyzer/IFlowTracker.tsx` and `flow-analyzer/iflow/`

`IFlowTracker.tsx` itself is now thin (~400 lines) — it's just the orchestrator that wires filters, hooks, and renderers. The heavy lifting lives in `iflow/`:

```
flow-analyzer/
├── IFlowTracker.tsx        # main component, state + filter/sort + layout
└── iflow/
    ├── types.ts            # BiasFilter, DteFilter, SortMode, EarningsWindow, response shapes
    ├── utils.ts            # classifySide, parsePremium, scoreEntry, matchesDte, dteTag, EARNINGS_WINDOW_DAYS
    ├── estimator.ts        # estimateOptionPnl — must mirror Python _estimate_option_pnl_pct
    ├── hooks.ts            # all React Query hooks used by the feature
    ├── EntryRow.tsx        # one entry row inside the detail panel
    ├── TickerCard.tsx      # grid card + EarningsBadge
    ├── TopPicks.tsx        # single-date conviction list
    └── TickerDetail.tsx    # right-column detail panel
```

When you change behavior, the change usually belongs in ONE of those — IFlowTracker.tsx rarely needs to grow. Add new sort modes to the `SortMode` type + the sort `useMemo` branch + the button list, all in IFlowTracker.tsx; everything else stays put.

Key things to remember:

- **Two independent scrollers**: grid container has bounded height; left and right columns each `overflow-y-auto`. If the page chrome changes height, the `calc(100vh - 260px)` magic number needs adjusting.
- **Prewarming**: `useTickerEarningsBatch(allTickers)` fires on every render with tickers — server SQLite cache makes that cheap. **Don't** condition this on the earnings window being active; clicking 1W must be instant.
- **Estimator parity**: `iflow/estimator.ts::estimateOptionPnl` must stay byte-for-byte equivalent to `_estimate_option_pnl_pct()` in the backend, otherwise per-row badges and the Highest Returns ranking will disagree. The file's header comment spells out the contract. Both sides now round to **2 decimal places**.
- **Sort modes**: `entries | premium | score | escalating | returns`. Adding a new mode = update the `SortMode` type in `iflow/types.ts`, the sort branch in IFlowTracker, the button list, and (if needed) a new prewarming hook in `iflow/hooks.ts`.
- **Earnings windows**: `all | 1w | 2w | 1m | 2m`. Window-active mode **overrides** the regular sort with a soonest-earnings-first order. If you add a new window value, both `EARNINGS_WINDOW_DAYS` (in `iflow/utils.ts`) and the button list need updating.
- **Batch cache keys**: `useTickerEarningsBatch` builds its cache key via `tickersKey()` from `src/api/cacheKey.ts`. Don't open-code another sorted-key implementation; use that helper so `["AAPL","MSFT"]` and `["MSFT","AAPL"]` share a cache entry.

## Adding a New CC Panel

1. Drop the file under `command-center/` next to siblings.
2. Use atoms from `src/components/CCPrimitives.tsx` (`Panel`, `Tag`, `Sparkline`, `RangeBar`, `DotGauge`). Don't redefine these.
3. If you need data from the backend, route via a hook in `src/api/*`. Lazy-fetch unless the panel is always-visible.
4. Wire it into `pages/CommandCenterPageV2.tsx` in the grid. For v1, into `pages/CommandCenterPage.tsx`.

## Style

- Inline `style={{...}}` is fine for one-offs and panel-specific structure.
- For repeatable patterns (cards, buttons, badge chips), use Tailwind utility classes — they map to CSS vars defined in `src/index.css`.
- Never hardcode `#hex` colors. Use `var(--accent-green)` etc.
- Use `font-mono` for numbers and tickers, regular font for prose.
