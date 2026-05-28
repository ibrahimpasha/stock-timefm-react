# CLAUDE.md — src/api/

React Query hooks. Every server interaction in the app goes through here.

## Files

| File | What's inside |
|---|---|
| `client.ts` | Shared axios instance, baseURL `/api` (Vite proxy → :8001) |
| `cacheKey.ts` | `tickersKey(tickers)` — sort/dedupe/encode helper for batched query cache keys |
| `forecast.ts` | `useMarketPrice`, forecast model hooks |
| `signals.ts` | `useSignal(ticker)`, `useGenerateSignal()`, `useSignalTickers()` |
| `flow.ts` | `useTrackedTickers`, `useFlowAlerts`, `useFlowPicks`, `useFlowChat`, and the flow mutations |
| `intel.ts` | `useIntelLatest`, `useIntelRefresh` |
| `eval.ts` | `useTrustScores` |

The iFlow-specific hooks (`useIFlowDates`, `useIFlowSummary`, `useTickerEarningsBatch`, `useFlowReturns`, etc.) live colocated with the feature in `src/features/flow-analyzer/iflow/hooks.ts`. Lift them up to `src/api/flow.ts` if a second feature starts consuming them.

## Conventions

### Hook shape

```ts
export function useThing(arg: string) {
  return useQuery<ResponseT>({
    queryKey: ["thing", arg],            // <-- always an array, starts with a string slug
    queryFn: () =>                       // <-- use apiClient, return r.data
      apiClient.get<ResponseT>(`/thing?x=${arg}`).then((r) => r.data),
    staleTime: STALE_TIMES.thing,        // <-- from lib/constants.ts; pick the closest match
    enabled: !!arg,                      // <-- always guard on the inputs being non-empty
  });
}
```

### Mutation shape (for POST/refresh)

```ts
export function useRefreshThing(arg: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post(`/thing/refresh?x=${arg}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["thing", arg] }),
  });
}
```

### Batched queries

Use `tickersKey()` from `./cacheKey.ts` so `["AAPL","MSFT"]` and `["MSFT","AAPL"]` share a cache entry:

```ts
import { tickersKey } from "./cacheKey";

const { key, param, sorted } = tickersKey(tickers);
return useQuery({
  queryKey: ["thing-batch", key],
  queryFn: () => apiClient.get(`/thing-batch?tickers=${param}`).then(r => r.data),
  enabled: sorted.length > 0,
  staleTime: 30 * 60_000,
});
```

Don't open-code another sort/dedupe — every batched hook should go through `tickersKey`.

### When to add a hook here vs. inline in a component

- If it'll be reused → add here.
- If it's truly one-shot UI state plumbing → fine to keep inline.
- If it touches the server, even once → here. Never call `apiClient.get` inside a component.

## Endpoints Map

(Quick reference — see backend `~/stock-timefm/CLAUDE.md` for the full list.)

| Endpoint | Hook |
|---|---|
| `GET /market/price` | `useMarketPrice(ticker)` (forecast.ts) |
| `GET /market/earnings-batch` | `useTickerEarningsBatch(tickers)` in `features/flow-analyzer/iflow/hooks.ts` — lift to `src/api/flow.ts` if a non-IFlow caller appears |
| `GET /market/returns-batch` | (no longer used by the UI; `useFlowReturns` superseded it for ranking) |
| `GET /flow/tickers` | `useTrackedTickers(days, min)` (flow.ts) |
| `GET /flow/iflow/entries` | `useIFlowEntries(date, ticker?)` |
| `GET /flow/iflow/history` | `useIFlowHistory(ticker)` — defaults to `days=365` to walk all available flow |
| `GET /flow/iflow/returns` | `useFlowReturns(enabled)` — composite scoring for Highest Returns sort |
| `GET /flow/iflow/entries-export` | called inline from `DownloadCsvButton` in `IFlowTracker.tsx` — entry-level flow + est P/L for CSV export |
| `GET /intel/latest` | `useIntelLatest(ticker)` |
| `POST /intel/refresh` | `useIntelRefresh(ticker)` — pattern reused in both Intelligence panels |
| `GET /signals/latest` | `useSignal(ticker)` |
| `POST /signals/generate` | `useGenerateSignal()` |

## Pitfalls

- **Don't wrap mutation responses in `useQuery`**. Mutations live in `useMutation`. Mixing them creates infinite loops.
- **Don't put React Query hooks behind a condition** (`if (foo) useQuery(...)`). Use `enabled: foo` instead.
- **Don't put non-serializable values in `queryKey`** (functions, Date objects, etc.) — use strings/numbers/arrays of strings/numbers.
- **Beware `staleTime: 0`** (the default) — it refetches aggressively. Pick a real value from `STALE_TIMES` or set explicitly.
