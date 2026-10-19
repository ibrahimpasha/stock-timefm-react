import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Module, { createRequire } from "node:module";

// Compile only the modules under test; no app server, backend or network.
const require = createRequire(import.meta.url), ts = require("typescript");
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), cache = new Map();
function source(path) {
  const filename = resolve(root, path);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename);
  mod.paths = Module._nodeModulePaths(dirname(filename)); cache.set(filename, mod);
  mod.require = id => {
    if (id.startsWith(".")) {
      const dependency = resolve(dirname(filename), id);
      const file = [dependency, `${dependency}.ts`, `${dependency}.tsx`].find(existsSync);
      if (file) return source(file);
    }
    return require(id);
  };
  mod._compile(ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }, fileName: filename,
  }).outputText, filename);
  return mod.exports;
}
const { createLatestRequest } = source("lib/latestRequest.ts");
const { chartTime, forecastPoints, forecastReturn } = source("lib/forecastSeries.ts");
const { optionIntent, canonicalExpiry, expiryDte } = source("lib/optionContract.ts");
const { marketDate, activeFlowInterval } = source("lib/liveFeeds.ts");
const { activityWindow, markFreshness, premiumChange, markedExposure, signedPercent } = source("lib/markFreshness.ts");
const { flowCoverage } = source("lib/flowCoverage.ts");
const { modelMetadataLabel } = source("lib/modelMetadata.ts");
const { canShowMlProbability } = source("features/flow-analyzer/iflow/utils.ts");
const { observationGain, observationAge, observationHasEvaluation, sortObservations } = source("lib/watchlist.ts");
const { estimateOptionPnl } = source("features/flow-analyzer/iflow/estimator.ts");
const { toLocalDateOnly } = source("lib/dateOnly.ts");

test("watchlist newest sort uses insertion identity on same-day legacy rows, not API gain order", () => {
  const row = { ticker: "TEST", expiry: "2026-10-23", strike: 100, option_type: "CALL", added: "2026-10-05", pnl_pct: null };
  const rows = [{ ...row, id: 1 }, { ...row, id: 3 }, { ...row, id: 2 }];
  assert.deepEqual(sortObservations(rows, "newest").map(r => r.id), [3, 2, 1]);
  assert.deepEqual(sortObservations(rows, "oldest").map(r => r.id), [1, 2, 3]);
  assert.deepEqual(rows.map(r => r.id), [1, 3, 2]);
});
test("watchlist dates sort by instants and missing evaluations always sort last", () => {
  const row = { ticker: "TEST", expiry: "2026-10-23", strike: 100, option_type: "CALL", added: "2026-10-05", source_date: "2026-10-02", pnl_pct: null };
  const rows = [{ ...row, id: 1, last_evaluated_at: "2026-10-05T12:00:00-04:00" },
    { ...row, id: 2, last_evaluated_at: "2026-10-05T15:00:00Z" }, { ...row, id: 3 },
    { ...row, id: 4, last_evaluated_at: "2026-10-05T19:00:00Z", provenance_status: "unverified_legacy" }];
  assert.deepEqual(sortObservations(rows, "checked").map(r => r.id), [1, 2, 4, 3]);
});
test("legacy gains without reliable mark provenance cannot outrank measured observations", () => {
  const row = { ticker: "TEST", expiry: "2026-10-23", strike: 100, option_type: "CALL", added: "2026-10-05", pnl_pct: 181 };
  assert.equal(observationGain(row), null);
  assert.equal(observationGain({ ...row, last_marked_at: "2026-10-05T16:00:00Z", mark_quality: "unverified" }), null);
  assert.equal(observationGain({ ...row, last_marked_at: "2026-10-05T16:00:00Z", provenance_status: "unverified_legacy" }), null);
  assert.equal(observationGain({ ...row, pnl_pct: 0, last_marked_at: "2026-10-05T16:00:00Z", mark_quality: "modeled" }), 0);
  assert.equal(observationAge("2026-10-02", "2026-10-05"), 3);
  assert.equal(observationAge("2026-10-06", "2026-10-05"), null);
});
test("mark/maintenance timestamps alone cannot establish a watchlist eligibility evaluation", () => {
  const row = { ticker: "TEST", expiry: "2026-10-23", strike: 100, option_type: "CALL", added: "2026-10-05", pnl_pct: null };
  assert.equal(observationHasEvaluation({ ...row, last_marked_at: "2026-10-05T16:00:00Z" }), false);
  const evaluated = { ...row, source_date: "2026-10-02", last_evaluated_at: "2026-10-05T16:00:00Z" };
  assert.equal(observationHasEvaluation(evaluated), true);
  assert.equal(observationHasEvaluation({ ...evaluated, provenance_status: "unverified_legacy" }), false);
  assert.equal(observationHasEvaluation({ ...evaluated, last_evaluated_at: "bad" }), false);
});

test("latest request rejects late success and loading updates even if abort is ignored", async () => {
  const requests = createLatestRequest(), first = requests.begin();
  let finish, visible = "BBB", loading = true;
  const response = new Promise(resolve => { finish = resolve; });
  const oldRun = response.then(() => { if (first.isCurrent()) visible = "AAA"; })
    .finally(() => { if (first.isCurrent()) loading = false; });
  const second = requests.begin();
  assert.equal(first.signal.aborted, true); finish(); await oldRun;
  assert.equal(visible, "BBB"); assert.equal(loading, true); assert.equal(second.isCurrent(), true);
  requests.cancel(); assert.equal(second.isCurrent(), false);
});
test("latest request rejects a superseded failure", async () => {
  const requests = createLatestRequest(), first = requests.begin(); let fail, error = null;
  const response = new Promise((_resolve, reject) => { fail = reject; });
  const settled = response.catch(() => { if (first.isCurrent()) error = "stale failure"; });
  requests.begin(); fail(new Error("late")); await settled; assert.equal(error, null);
});
test("forecast return uses response anchor, not a live quote or zero fallback", () => {
  assert.ok(Math.abs(forecastReturn(110, 100) - 10) < 1e-10);
  for (const anchor of [0, -1, NaN, undefined, null]) assert.equal(forecastReturn(110, anchor), null);
  assert.equal(forecastReturn(NaN, 100), null);
});
test("same-day intraday predictions retain ordered unique UTC timestamps", () => {
  const points = forecastPoints(["2026-10-05T15:35:00Z", "2026-10-05T15:30:00Z", "2026-10-05T15:35:00Z"], [102, 101, 103], true);
  assert.equal(points.length, 2); assert.equal(points[0].time, Date.parse("2026-10-05T15:30:00Z") / 1000);
  assert.equal(points[1].value, 103); assert.equal(chartTime("2026-10-05 15:30:00", true), points[0].time);
});
test("daily chart anchors to executed origin and excludes pre-origin predictions", () => {
  assert.deepEqual(forecastPoints(["2026-10-01", "2026-10-06"], [99, 110], false, { time: "2026-10-05", value: 100 }),
    [{ time: "2026-10-05", value: 100 }, { time: "2026-10-06", value: 110 }]);
});
test("invalid intraday timestamps and prices are not rendered", () => {
  assert.deepEqual(forecastPoints(["broken", "2026-10-05T15:30Z"], [100, NaN], true), []);
});
test("explicit action overrides contradictory inferred/raw direction", () => {
  assert.deepEqual(optionIntent({ type: "C", action: "STO", ask_pct: 99, side: "Bull" }), { side: "Bear", action: "call selling" });
  assert.deepEqual(optionIntent({ type: "PUT", action: "BTO", ask_pct: 0 }), { side: "Bear", action: "put buying" });
  assert.equal(optionIntent({ type: "C", action: "STC" }).action, "call selling to close");
  assert.equal(optionIntent({ type: "PUT", decision_receipt: { intent: { action: "STO" } }, action: "BTO" }).side, "Bull");
});
test("unknown intent and ambiguous gray-band allocations abstain without explicit direction", () => {
  for (const entry of [{ type: "OTHER", ask_pct: 99 }, { type: "CALL" }, { type: "CALL", action: "UNCLASSIFIED", ask_pct: 99 }]) assert.equal(optionIntent(entry).side, "Unknown");
  assert.equal(optionIntent({ type: "CALL", ask_pct: 45, vol_oi_ratio: "2x" }).side, "Unknown");
  assert.equal(optionIntent({ type: "CALL", trade_action: "STO", action: "BTO", ask_pct: 99 }).side, "Bear");
  assert.equal(optionIntent({ type: "CALL", side: "Bull", ask_pct: 45 }).side, "Bull");
});
test("expiry keys preserve years; yearless legacy values never roll forward", () => {
  assert.equal(canonicalExpiry("10/16/2026"), "2026-10-16");
  assert.notEqual(canonicalExpiry("10/16/2026"), canonicalExpiry("10/16/2027"));
  assert.equal(canonicalExpiry("10/16"), null);
  assert.equal(canonicalExpiry("10/16", "2026-08-11", 66), "2026-10-16");
  assert.equal(canonicalExpiry("2/30/2026"), null);
  assert.equal(expiryDte("2026-10-16", "2026-10-05"), 11);
  assert.equal(expiryDte("2025-10-16", "2026-10-05"), -354);
});
test("PT activity windows use calendar days, not the last populated dates", () => {
  const now = new Date("2026-10-06T01:00:00Z"); assert.equal(marketDate(now), "2026-10-05");
  assert.deepEqual(activityWindow([{ date: "2026-09-17", added: 9 }, { date: "2026-10-01", added: 2 }], now),
    { today: "2026-10-05", cutoff: "2026-09-29", todayAdded: 0, weekAdded: 2 });
});
test("polling covers recent/weekend feeds, not historical archives", () => {
  const now = new Date("2026-10-05T18:00:00Z");
  assert.equal(activeFlowInterval("2026-10-05", now), 60_000);
  assert.equal(activeFlowInterval("2026-10-02", now), 60_000);
  assert.equal(activeFlowInterval("2026-09-17", now), false);
});
test("watchlist activity respects the API's reported ET timezone at midnight", () => {
  const now = new Date("2026-10-06T04:30:00Z");
  assert.equal(marketDate(now), "2026-10-05");
  assert.equal(activityWindow([{ date: "2026-10-06", added: 3 }], now, "America/New_York").todayAdded, 3);
});
test("freshness flags stale, unknown and incomplete marks", () => {
  const now = new Date("2026-10-05T18:00:00Z");
  assert.equal(markFreshness("2026-09-17 18:00:00", now).stale, true);
  assert.equal(markFreshness(null, now).stale, true);
  assert.equal(markFreshness("2026-10-05T17:00Z", now).stale, false);
  for (const status of ["corporate_action_review_required", "settlement_price_unavailable", "model_price_unavailable", "underlying_unavailable", "equity_exit_quote_unavailable", "invalid_position_basis", "invalid_contract_identity", "expiry_calendar_unavailable"]) assert.equal(markFreshness("2026-10-05T17:00Z", now, status).stale, true);
});
test("recorded premium change requires mark timestamp; zero current premium is valid", () => {
  assert.equal(premiumChange(3, 2, "2026-10-05T17:00Z"), 50);
  assert.equal(premiumChange(0, 2, "2026-10-05T17:00Z"), -100);
  assert.equal(premiumChange(3, 2), null);
  assert.equal(premiumChange(null, 2, "2026-10-05T17:00Z"), null);
  assert.equal(signedPercent(null), "Unknown");
});
test("incomplete quality overrides a recent timestamp and benign status; unverified remains explicit", () => {
  const now = new Date("2026-10-05T18:00:00Z");
  const at = "2026-10-05T17:59:00Z";
  assert.equal(markFreshness(at, now, "ok", "incomplete").stale, true);
  assert.match(markFreshness(at, now, "ok", "incomplete").label, /Incomplete mark/);
  assert.match(markFreshness(at, now, null, "unverified").label, /Unverified mark/);
  assert.equal(markFreshness(at, now, null, "unverified").stale, true);
  assert.equal(markFreshness(at, now, "invalid_quote").stale, true);
  assert.deepEqual(markedExposure([
    { current_value: 200, cost_basis: 100, updated_at: at, mark_status: "ok", mark_quality: "incomplete" },
    { current_value: 300, cost_basis: 250, updated_at: at, mark_quality: "unverified" },
    { current_value: 400, cost_basis: 350, updated_at: at },
  ], now), { count: 2, value: 500 });
});
test("portfolio coverage sums stale, unmarked and incomplete carried exposure", () => {
  assert.deepEqual(markedExposure([
    { current_value: 1200, cost_basis: 1000, last_marked_at: "2026-09-17T18:00Z" },
    { current_value: null, cost_basis: 800 },
    { current_value: 200, cost_basis: 100, last_marked_at: "2026-10-05T17:00Z", mark_status: "underlying_unavailable" },
    { current_value: 500, cost_basis: 500, last_marked_at: "2026-10-05T17:00Z" },
  ], new Date("2026-10-05T18:00Z")), { count: 3, value: 2200 });
});
test("return ranking requires >=90% coverage and all liquid benchmarks", () => {
  assert.equal(flowCoverage().reliable, false); assert.equal(flowCoverage({ price_coverage_pct: 75 }).reliable, false);
  assert.equal(flowCoverage({ price_coverage_pct: 100, benchmark_missing: ["SPY"] }).reliable, false);
  assert.equal(flowCoverage({ price_coverage_pct: 90, benchmark_missing: [] }).reliable, true);
});
test("metadata display never grants probability/trading approval", () => {
  const label = modelMetadataLabel({ version: "5.1", serving_mode: "rank_only", deployment_approved: false });
  assert.match(label, /rank only/); assert.match(label, /not approved for trading/);
  assert.equal(canShowMlProbability(false, "calibrated"), false);
  assert.equal(canShowMlProbability(true, "uncalibrated"), false);
  assert.equal(canShowMlProbability(true, "calibrated"), true);
});
test("estimator mirrors _flow_valuation: sold prints negate, expired -> null, 0DTE uses 5d floor", () => {
  const today = toLocalDateOnly(new Date()), ago = n => toLocalDateOnly(new Date(Date.now() - n * 86400000));
  const bought = estimateOptionPnl(100, 90, 2, 100, 30, "CALL", ago(3));
  assert.ok(bought < 0);
  assert.equal(estimateOptionPnl(100, 90, 2, 100, 30, "CALL", ago(3), true), -bought);
  assert.ok(estimateOptionPnl(100, 50, 1, 100, 30, "CALL", ago(3), true) <= 100);
  assert.equal(estimateOptionPnl(100, 100, 2, 120, 5, "CALL", ago(10)), null);
  assert.equal(estimateOptionPnl(100, 100, 2, 100, 0, "CALL", today), 0);
  assert.equal(estimateOptionPnl(100, 100, 2, 100, 3, "CALL", ago(3)), -33.33);
});
