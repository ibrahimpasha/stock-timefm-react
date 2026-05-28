# CLAUDE.md — Stock-TimeFM React Dashboard

You are an AI engineer working on this codebase. Read this before making changes.

## What This Project Is

React + TypeScript + Vite dashboard for the Stock-TimeFM trading system. Pure visualization layer — all logic lives in the sister backend repo.

- **Backend**: `~/stock-timefm` — FastAPI server on `:8001`, OpenAI-compatible Claude wrapper on `:8000`, Perplexity MCP on `:8080`. See its `CLAUDE.md` for endpoint contract.
- **This repo**: Vite dev server on `:3000`, proxies `/api/*` to `localhost:8001`.

## Architecture

```
React Router → page component
              → uses API hooks (api/*) which return React Query results
              → renders feature components (features/<area>/*)
              → uses primitives (components/CCPrimitives.tsx, etc.)
              → global ticker state lives in store/useAppStore.ts (Zustand)
```

State management is intentionally minimal:
- **Zustand** (`store/useAppStore.ts`) — global `activeTicker` only; every page reads/writes here for cross-tab sync.
- **React Query** — everything server-side. `staleTime` per resource defined in `lib/constants.ts::STALE_TIMES`.
- **Local component `useState`** — UI-only state (open accordion, sort mode, etc.).

Don't reach for Redux or Context. If a piece of state spans pages, put it in Zustand; otherwise local.

## Routes & Pages

| Route | Page | Purpose |
|---|---|---|
| `/` | `ForecastPage` | 7-model ensemble forecast charts |
| `/command-center` | `CommandCenterPage` | v1 — ActionPanel + ModelBreakdown + Trust + Intelligence + IFlowTracker (right column, sticky) |
| `/command-center-v2` | `CommandCenterPageV2` | v2 — restructured: FlowTape (full-width tape) → TickerHero band → 8/4 split (ScanGrid+small panels \| IntelligencePanelV2) |
| `/eval` | `ModelEvalPage` | Model trust scores, calibration tables |
| `/intel` | `IntelligencePage` | 8-category web-search intel browser |
| `/signals` | `SignalAnalysisPage` | Live signal analysis with execution panel |
| `/traders` | `TraderLeaderboardPage` | Master/detail trader leaderboard. Left: ranked traders. Right: selected trader's positions (one row per position, click to expand event timeline) + the `SignalsView` panel on top (Trending / Leaders / Sentiment). |

Nav order is in `src/lib/constants.ts::NAV_ITEMS`. Adding a route = add to `App.tsx` Routes + push to NAV_ITEMS.

## Key Files

| File | Purpose |
|---|---|
| `src/App.tsx` | Routes, navbar, ticker bar, QueryClient setup |
| `src/store/useAppStore.ts` | Zustand store with `activeTicker` (single source of truth) |
| `src/api/client.ts` | Shared axios instance with `/api` baseURL → Vite proxy → backend `:8001` |
| `src/api/cacheKey.ts` | `tickersKey(tickers)` — canonical sort/dedupe/encode for batched query keys |
| `src/api/forecast.ts` | `useMarketPrice`, forecast hooks |
| `src/api/signals.ts` | `useSignal`, `useGenerateSignal`, signal list |
| `src/api/flow.ts` | `useTrackedTickers`, `useFlowPicks`, `useFlowChat`, alerts/picks/chat mutations |
| `src/api/intel.ts` | `/intel/latest`, `/intel/refresh` hooks |
| `src/api/intelV3.ts` | Typed React Query hooks for the `/intel-v3/*` endpoints (convergence, timeline, calendar, brief). |
| `src/api/eval.ts` | Model trust scores |
| `src/lib/constants.ts` | `MODEL_COLORS`, `STALE_TIMES`, `NAV_ITEMS`, `DEFAULT_TICKER`, `INTEL_TAG_COLORS`, `INTEL_VIEW_COLORS` |
| `src/lib/types.ts` | Shared TS types (Signal, MarketPrice, TrackedTicker, …) |
| `src/lib/utils.ts` | Formatters (`formatCurrency`, `formatDate`, `formatPremium`) + `relativeAge`/`absoluteAge` |
| `src/components/CCPrimitives.tsx` | Pure atoms: `Sparkline`, `RangeBar`, `DotGauge`, `Tag`, `Panel`, `useSparkSeed` |
| `src/features/command-center/` | All CC v1 + v2 panels (ActionPanel, ModelBreakdown, TrustScores, FlowTape, TickerHero, ScanGrid, IntelligencePanel(V2)) |
| `src/features/command-center/IntelligencePanelV3.tsx` | intel-v3 panel — replaces `IntelligencePanel` in the Command Center right column. See "Intelligence panel v3" below. |
| `src/features/flow-analyzer/IFlowTracker.tsx` | Main orchestrator (~400 lines). Splits the heavy logic into `iflow/` submodules. |
| `src/features/flow-analyzer/iflow/` | `types.ts`, `utils.ts`, `estimator.ts`, `hooks.ts`, `EntryRow.tsx`, `TickerCard.tsx`, `TopPicks.tsx`, `TickerDetail.tsx`, `TraderEventRow.tsx`, `TraderMatchChips.tsx` |
| `src/features/traders/` | `TraderPositionRow.tsx` (one-row-per-position rendering used by the Traders page; click to expand the full event timeline + optional raw Discord toggle), `TraderCallRow.tsx` (single-call iFlow-style row, retained for older per-call views), `SignalsView.tsx` (3-tab Trending / Leaders / Sentiment panel mounted above the leaderboard) |
| `src/api/alerts.ts` | All alerts/positions hooks — see Endpoints Map below |

## The Big Feature: `flow-analyzer/IFlowTracker.tsx` + `flow-analyzer/iflow/`

This is the most-edited feature in the repo. The orchestrator is ~400 lines; the rest lives in `iflow/` submodules. Understand the layout before touching.

**Files:**

| File | What |
|---|---|
| `IFlowTracker.tsx` | State, filter/sort chain, layout, hook wiring |
| `iflow/types.ts` | `BiasFilter`, `DteFilter`, `SortMode`, `EarningsWindow`, response shapes |
| `iflow/utils.ts` | `classifySide`, `parsePremium`, `scoreEntry`, `matchesDte`, `dteTag`, `EARNINGS_WINDOW_DAYS` |
| `iflow/estimator.ts` | `estimateOptionPnl` — **mirrors backend `_estimate_option_pnl_pct`** |
| `iflow/hooks.ts` | All React Query hooks the feature uses |
| `iflow/EntryRow.tsx` | One option-flow row in the detail panel |
| `iflow/TickerCard.tsx` | Grid card + `EarningsBadge` |
| `iflow/TopPicks.tsx` | Single-date conviction top-15 |
| `iflow/TickerDetail.tsx` | Right-column detail panel. Collects `trader_matches` across visible flow entries, dedupes by `alert_id`, buckets by the trader-call's own `ts`, and renders `<TraderEventRow>` above the flow rows in each date section. Header now reads `Flow History (N) + M trader events`. |
| `iflow/TraderEventRow.tsx` | Trader-call event rendered as its own row inside the Flow History date sections. Purple left border, `TRADER` label, initials chip (colored by direction alignment), event-type pill, contract details. Click to lazy-load the trader's full position via `useAlertsPositions(author)` (React Query dedupes — sibling rows for the same author share one fetch). Renders the timeline + optional "Show messages" sub-toggle. Collapsed header shows outcome chip (`CLOSED` / `STOPPED` / `PARTIAL` with cumulative P/L) once the position has resolved. |
| `iflow/TraderMatchChips.tsx` | NO LONGER USED on `EntryRow`. The `TraderEventRow` row-per-event approach above each date section replaced it. File kept on disk for potential future use. |
| `iflow/EntryTape.tsx` | Single-date chronological feed — one row per entry, sortable columns (time, ticker, side, action, contract, dte, vol/oi, ask%, ATM%, premium, P/L, **score**). Calls `useIFlowEntries(date, undefined, includeNotable=true)` so each row carries a `notable: {score, parts, signals}` envelope from the backend. Top picks get a gold left border (≥85 also glows). Sortable `score` column + `Notable filter` chip in the header for digest mode (threshold 65). Hover the score cell → tooltip shows the 5-component breakdown + which convergence signals lit up. View toggle in `IFlowTracker.tsx` ([Grid] [Tape]) controls which renders; Tape is single-date only (auto-snaps back to Grid on All Dates). |

**Responsibilities:**
- Date selector (All Dates / per-date toggle, multi-select)
- Filter row: Bias (All/Bullish/Bearish), DTE (All/Lotto/Swing/Leap), Sort, Earnings window
- Sort options: Entries, Premium, Conviction, Escalating, **Highest Returns** (composite flow-P/L score)
- Earnings filter: Any / 1W / 2W / 1M / 2M
- Ticker grid (left, scrolls independently) + Ticker detail (right, scrolls independently)
- Inside detail: TickerHero card → Picks → Flow History (per-day entries with P/L badges)

**Hooks that prewarm in background** (do not break these — first-click latency depends on them):

| Hook | Endpoint | When it fires | Why |
|---|---|---|---|
| `useTickerEarningsBatch(allTickers)` | `/market/earnings-batch` | always when tickers exist | Earnings filter is instant on click |
| `useTickerIntelBatch(top20)` | per-ticker `/flow/iflow/history` | always | Escalating sort needs accumulation labels |
| `useFlowReturns(enabled=sort==="returns")` | `/flow/iflow/returns` | only when "Highest Returns" sort is on | 1-2s server walk, only pay when needed |

**Estimator parity:**

`iflow/estimator.ts::estimateOptionPnl` is the canonical option-P/L delta+theta model. The Python mirror is `_estimate_option_pnl_pct()` in `~/stock-timefm/server/api_routes.py`. **Keep them in sync** — both round to 2 decimal places and must produce identical numbers on identical input. The file has a header comment spelling out the contract.

Used in:
- Per-row P/L badge (`iflow/EntryRow.tsx`)
- `/flow/iflow/returns` ticker ranking (backend)

Both have the same: moneyness → delta bucket, gamma boost on >5% move, theta = `optFill / (effective_dte * 1.8)`, capped at 60% of premium, **floor -100% / no upper cap**, **2dp rounding**.

**Independent column scrolling:**

The grid container has `style={{ height: "calc(100vh - 260px)", minHeight: 420 }}`. Both columns have their own `overflow-y-auto`. If you change page chrome height, adjust the `260px` offset.

## Alerts hooks (`src/api/alerts.ts`)

Hooks the Traders page + the trader-flow interleaving rely on:

| Hook | Endpoint | Notes |
|---|---|---|
| `useAlertsByAuthor(author, limit)` | `GET /alerts/by-author` | Per-call rows with `exits[]` linker; retained for components still on the old shape. |
| `useAlertsPositions(author, lookbackDays=60)` | `GET /alerts/positions` | Position-grouped events. Backs the Traders page + the lazy expand in `TraderEventRow`. React Query dedupes by `author`. |
| `useTrending(windowHours, limit)` | `GET /alerts/trending` | Used by `SignalsView` Trending tab. Auto-refreshes every 2 min (`refetchInterval: 120_000`). |
| `useFirstMentionLeaderboard(days)` | `GET /alerts/first-mention-leaderboard` | Leaders tab. |
| `useSentimentTrajectory(ticker, days)` | `GET /alerts/sentiment-trajectory` | Sentiment tab. |
| `useAlertMessage(alertId)` | `GET /alerts/message` | Raw Discord text behind the "Show messages" toggle. |
| `useStructuredCalls(...)` | `GET /alerts/structured` | Legacy structured shape; kept for older panels. |

See `src/api/CLAUDE.md` for the full conventions (hook shape, cache
keys, mutation pattern).

## Intelligence panel v3

`src/features/command-center/IntelligencePanelV3.tsx` replaces `IntelligencePanel` in the Command Center right column. It consumes the new `/api/intel-v3/*` endpoints via the typed hooks in `src/api/intelV3.ts`:

| Hook | Endpoint |
|---|---|
| `useConvergence(ticker, hours)` | `GET /intel-v3/convergence/{ticker}` |
| `useConvergenceList(hours, minSources)` | `GET /intel-v3/convergence` |
| `useTimeline(ticker, hours)` | `GET /intel-v3/timeline/{ticker}` |
| `useCalendar(daysAhead, ticker)` | `GET /intel-v3/calendar` |
| `useDailyBrief(date)` | `GET /intel-v3/brief` |
| `useGenerateBrief()` | `POST /intel-v3/brief/generate` |
| `useBriefList(limit)` | `GET /intel-v3/briefs` |

**Design philosophy.** Synthesis-first. The 1-paragraph "TODAY" read replaces the old 8-category dump as the headline. The 8 categories collapse to a drill-down at the bottom. Cross-source convergence (news × iFlow × voices × traders × forecast) is the unique value — no other panel joins all five.

**Three render states:**

| State | When | What renders |
|---|---|---|
| TICKER ACTIVE | `activeTicker` set + convergence has data | 5-source breakdown + reaction timeline + forward calendar |
| NO TICKER | no `activeTicker` selected | Market brief (cached daily) + convergence ticker list + cross-ticker themes |
| LOW SIGNAL | active ticker but `<2` sources or all-quiet | Terse fallback ("quiet on X across all sources today") |

See the backend repo's `CLAUDE.md` "intel-v3 — connected intelligence" section for module-level details and known limitations (e.g. `signal_analysis.db` is currently corrupted, so forecast convergence returns 0 for all tickers until rebuilt).

## Trader-flow cross-reference

Each iFlow entry returned by the backend now carries a
`trader_matches: TraderMatch[]` field — Discord trader-alert calls
that hit the same ticker within ±14 days of the flow time (see
`src/flow_trader_overlap.py` in the backend). The dashboard surfaces
these matches in two places, both anchored on the per-date sections
of Flow History inside `iflow/TickerDetail.tsx`:

1. **Collect + dedupe.** `TickerDetail` walks every visible flow
   entry, flattens `entry.trader_matches`, dedupes by `alert_id`.
2. **Bucket by trader-call timestamp.** Trader rows surface on the
   day the call was posted, NOT the day of the flow they matched —
   so a Friday open on a ticker can sit above Monday's flow rows in
   the same column.
3. **Render `<TraderEventRow>` above the flow rows.** Each trader
   event gets its own row with a purple left accent, initials chip,
   event-type pill (OPEN / ADD / TRIM / CLOSE / STOP / STATUS),
   contract details, and an `aligned` indicator.
4. **Click to expand.** The row lazily calls
   `useAlertsPositions(author)`. React Query dedupes by `author`,
   so multiple rows for the same trader collapse into one fetch.
   The expanded view renders the full position event timeline +
   optional "Show messages" sub-toggle for the raw Discord text.
5. **Outcome chip.** When the matched position has resolved, the
   collapsed header gets a chip (`CLOSED` / `STOPPED` / `PARTIAL`)
   with the cumulative P/L %.

The header for the Flow History block reads
`Flow History (N) + M trader events` to make the interleaving
explicit. `TraderMatchChips.tsx` (the older inline-chip-strip on
`EntryRow`) is no longer mounted — superseded by the row-per-event
layout — but the file remains on disk.

## Conventions

### Always
- Use `apiClient` from `src/api/client.ts` — never inline axios or fetch
- Wrap every data fetch in a typed `useQuery<T>` with an explicit `queryKey` array
- Read tickers from `useAppStore((s) => s.activeTicker)` — never from a local prop
- Run `npx --no-install tsc --noEmit -p tsconfig.json` after every batch of edits
- Use only colors from CSS vars: `var(--accent-green)`, `var(--accent-red)`, `var(--text-muted)`, `var(--border)`, etc. Tailwind classes that map to these (`text-accent-blue`, `bg-bg-card`) are also fine

### Never
- Don't add a global state library beyond Zustand
- Don't add a styling library beyond Tailwind + inline `style={{...}}` for one-offs
- Don't hardcode hex colors — use CSS vars (defined in `index.css`)
- Don't break the `useAppStore.activeTicker` contract — clicking a ticker anywhere must update the bar at the top
- Don't fetch in components — always go through a hook in `src/api/*`

## Caching Strategy

```
STALE_TIMES = {
  price:    30s   // /market/price refetches every 60s in background
  forecast:  1m
  intel:    10m
  eval:      5m
  flow:      1m
}
```

For longer-lived data (earnings dates, returns), defer to the server-side cache and use a generous client `staleTime` (12h+).

## Refresh Button Pattern

Pages that show cached intel can offer a "refresh" button:

```ts
const refresh = useMutation({
  mutationFn: () => apiClient.post(`/intel/refresh?ticker=${ticker}`),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["intel-latest", ticker] }),
});
```

Examples: `IntelligencePanel.tsx`, `IntelligencePanelV2.tsx` — both have the `<RefreshCw>` icon button next to a `"updated 23m ago"` relative-time label. Copy that pattern.

## Loading-State Pattern

For prewarmed batch queries, only show a loading indicator when **both** `isFetching` AND `!data`:

```tsx
{isFetching && !data && <span className="animate-pulse">loading…</span>}
```

This prevents a flash during cache-hit refetches. Background re-validations stay invisible.

## Dev Workflow

```bash
# Backend must be running on :8001 (sister repo)
npm install
npm run dev       # vite on :3000
npx --no-install tsc --noEmit -p tsconfig.json  # before committing
```

Common URLs while dev'ing:
- `http://localhost:3000/command-center` — v1 page (where IFlowTracker lives in the right column)
- `http://localhost:3000/command-center-v2` — v2 redesign

## Recent Changes (2026-05 batch)

Worth knowing about — these shaped current conventions:

1. **Independent column scrollers in IFlowTracker** — long ticker grid no longer pushes flow detail below the fold.
2. **Earnings batch prewarms on mount** — clicking 1W/2W/1M/2M is now instant because the batch fired in the background when IFlowTracker mounted.
3. **"Highest Returns" sort** — composite `avg_pnl_pct × scored_entries`, walks all available flow JSON server-side. Rewards both magnitude and frequency.
4. **Cap removal** — per-entry P/L badges and ranking metrics no longer cap at +999%. Floor stays at -100% (you can't lose more than the premium). Match the Python mirror in `server/api_routes.py::_estimate_option_pnl_pct`.
5. **Intelligence panels fall back to web-search cache** — even without a generated ML thesis, the panel builds a thesis-like document from the 8-category intel cache so the "No thesis available" empty state essentially never appears once the backfill is done.
6. **`updated XXm ago` + refresh button** on Intelligence panels (v1 and v2) — see "Refresh Button Pattern" above.
7. **Server-side persistent caches** for batch data — earnings and 30d returns now live in `intelligence.db` (sister repo), not localStorage. Cross-browser, cross-device, server-restart-safe.

### Cleanup pass (later in the 2026-05 batch)

A second cleanup ran after the user audit:

8. **IFlowTracker split** — the 946-line file became a thin orchestrator (~400 lines) plus 8 files under `iflow/`. See "The Big Feature" section above. Everything still imports from `IFlowTracker.tsx` exactly as before.
9. **Estimator now rounds to 2dp on both sides** — TS and Python both return `…X.XX` so badges and the ranking can't silently diverge by a fractional %.
10. **Shared helpers consolidated**:
    - `relativeAge` / `absoluteAge` → `src/lib/utils.ts` (was duplicated in V1 + V2 intel panels)
    - `formatPremium` → `src/lib/utils.ts` (was `fmtPremium` / `fmtM` in two files)
    - `INTEL_TAG_COLORS` / `INTEL_VIEW_COLORS` → `src/lib/constants.ts` (were inline in V2)
    - `tickersKey(tickers)` → `src/api/cacheKey.ts` (canonical sort/dedupe/encode for batched cache keys)
11. **Dead code removed**: `useFlowEntries` from `src/api/flow.ts`; backend `ALL_MODELS` / `ENSEMBLE_MODELS` constants.
12. **yfinance rate-limit guards** added at the 5 unguarded call sites in `server/api_routes.py` (market_price, market_history, flow_picks pick-pricing, flow_iflow_returns batch, market_macro). 503 now surfaces explicitly when Yahoo throttles us.

## Danger Zones

- `src/features/flow-analyzer/IFlowTracker.tsx` — the largest component; many cross-cutting hooks. Touch with care.
- `src/components/CCPrimitives.tsx` — used by every CC v2 panel. Changing prop shapes propagates everywhere.
- `src/store/useAppStore.ts` — global ticker. Adding fields here triggers re-renders across every page. Keep it tiny.
- `src/App.tsx::TickerBar` — the top-of-page input. Has a `useEffect` syncing local state to global `activeTicker` — don't drop it or external ticker changes (e.g., clicking a TickerCard) won't update the input.
