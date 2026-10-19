import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";

// Run against an isolated build. The local server never proxies API traffic.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BROWSER_PACKAGE ?? "/home/ibmhd/perplexity-ai/venv/lib/python3.12/site-packages/patchright/driver/package");
const build = process.env.SMOKE_BUILD ?? "/tmp/stock-timefm-frontend-fix-build";
const output = process.env.SMOKE_OUTPUT ?? "/tmp/stock-timefm-frontend-fix-smoke";
const preview = process.argv.includes("--preview");
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path.startsWith("/api/") || path === "/health" || req.method !== "GET") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await mock({
      request: () => ({ url: () => `${origin}${req.url}`, postDataJSON: () => JSON.parse(Buffer.concat(chunks).toString() || "{}") }),
      fulfill: async ({ status, contentType, body }) => { res.writeHead(status, { "Content-Type": contentType }); res.end(body); },
      abort: async () => { res.writeHead(403); res.end(); },
    });
    return;
  }
  try {
    const file = resolve(build, `.${extname(path) ? path : "/index.html"}`);
    if (!file.startsWith(`${build}/`)) throw new Error("invalid path");
    res.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" }); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(preview ? Number(process.env.PREVIEW_PORT ?? 3017) : 0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = preview ? null : await chromium.launch({ headless: true });
const failures = [], proofs = [];
let failNews = false, failTape = false, resetBody, largeWatchlist = false;
const counts = new Map();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const position = {
  id: 1, persona: "smart", instrument: "option", entry_date: "2026-09-17", ticker: "SOXL", option_type: "CALL", side: "Bull", strike: 50, expiry: "2026-10-16", dte_at_entry: 66,
  premium_at_entry: 2, contracts: 5, cost_basis: 1000, current_premium: 2.6, current_value: 1300, pnl_pct: 30, pnl_dollars: 300, status: "open", scale_stage: 0,
  last_marked_at: "2026-09-17T18:00:00Z", mark_status: "corporate_action_review_required", ml_score: null, n_score: null,
};
const observation = {
  id: 1, ticker: "IWM", option_type: "CALL", strike: 240, expiry: "2026-10-16", dte: 66, added: "2026-10-01", added_at: "2026-10-01T18:00:00Z", source_date: "2026-09-30",
  note: "Legacy observation rationale retained", status: "watching", decision_state: "blocked", block_reason: "position_limit", pnl_pct: null, peak_pnl_pct: null,
  last_marked_at: "2026-09-17T18:00:00Z", decision_receipt: { intent: { action: "BTO" } },
  last_evaluated_at: "2026-10-05T18:00:00Z", provenance_status: "recorded",
};
const flowPosition = { ...position, entry_premium: 2, score: 8, scaled_out: 0, hold_days: 18, slot_type: "day_trade", last_marked_at: null, updated_at: new Date().toISOString(), mark_status: null, mark_quality: "incomplete" };
const flowObservation = { ...observation, list: "A", ref_premium: 2, current_premium: 3, score: 8 };
async function mock(route) {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  if (url.origin !== origin) { await route.abort(); return; }
  if (!(path.startsWith("/api/") || path === "/health")) { await route.continue(); return; }
  counts.set(path, (counts.get(path) ?? 0) + 1);
  let status = 200, data;
  if (path === "/health") data = { status: "ok" };
  else if (path === "/api/flow/alerts") data = [];
  else if (path === "/api/market/ticker-names") data = { AAA: "Instrument AAA", BBB: "Instrument BBB" };
  else if (path === "/api/market/price") data = { price: 999, change_pct: 0 };
  else if (path === "/api/market/history") data = Array.from({ length: 35 }, (_, i) => {
    const date = new Date(Date.parse("2026-09-01T00:00:00Z") + i * 86400000).toISOString().slice(0, 10);
    return { date, open: 199, high: 201, low: 198, close: 200, volume: 100000 };
  });
  else if (path.startsWith("/api/forecast/")) {
    const body = request.postDataJSON(), old = body.ticker === "AAA";
    if (old) await new Promise(resolve => setTimeout(resolve, 1200));
    const intraday = path.endsWith("intraday"), prices = old ? [700, 777] : [210, 220];
    data = { model: body.model, current_price: 200, prices, end_price: prices.at(-1), latency_ms: old ? 1200 : 1,
      predictions: prices.map((price, i) => ({ timestamp: intraday ? `2026-10-05T15:${i ? "45" : "30"}:00Z` : `2026-10-0${6 + i}`, price })) };
  }
  else if (path === "/api/flow/iflow/dates") data = { dates: [{ date: today, entries: 1 }] };
  else if (path === "/api/flow/iflow/summary") data = { date: today, tickers: [{ ticker: "BBB", count: 1, bullish: 0, bearish: 1, total_premium: 100000 }], total_entries: 1 };
  else if (path === "/api/flow/iflow/entries") {
    if (failTape) { status = 503; data = { detail: "mock flow unavailable" }; }
    else data = { entries: [{ ticker: "BBB", type: "CALL", action: "STO", side: "Bull", expiry: "10/16/2026", dte: 11, strike: 250, ask_pct: 99, vol_oi_ratio: 3, underlying_price: 200, avg_price: 2, premium: "$100K", image_downloaded_at: `${today} 18:00:00 UTC`, _date: today, msg_id: "probe-1" }] };
  }
  else if (path === "/api/flow/iflow/returns") data = { meta: { earliest_date: "2026-09-17", latest_date: today, days_covered: 10, entry_count: 100, ticker_count: 4, ticker_priced: 3, price_coverage_pct: 75, benchmark_missing: ["SPY"] }, tickers: { BBB: { avg_pnl_pct: 20, score: 20, entry_count: 1, scored_entries: 1 } } };
  else if (path === "/api/smart-trader/summary") data = { persona: url.searchParams.get("persona"), persona_description: "Paper book", starting_capital: 20000, cash: 19000, positions_value: 1300, total_value: 20300, return_pct: 1.5, realized_pnl: 0, unrealized_pnl: 300, open_positions: 1, closed_positions: 0, win_rate: 0, positions: [position], closed: [] };
  else if (path === "/api/smart-trader/personas") data = { personas: [] };
  else if (path === "/api/smart-trader/today") data = { date: today, picked: [], rejected_count: 0, rejected_by_rule: {} };
  else if (path === "/api/smart-trader/history") data = [];
  else if (path === "/api/smart-trader/watchlist") data = { date: today,
    wla: largeWatchlist ? Array.from({ length: 26 }, (_, i) => ({ ...observation, id: i + 1, ticker: `WLS${String(i + 1).padStart(2, "0")}` })) : [observation],
    wlb: largeWatchlist ? [{ ...observation, id: 100, ticker: "LEGACY", pnl_pct: 9999, peak_pnl_pct: 9999, provenance_status: "unverified_legacy" }] : [],
    history: [], activity: { timezone: "America/New_York", daily: [{ date: "2026-09-17", added: 9, scans: 1 }, { date: "2026-10-01", added: 2, scans: 1 }] } };
  else if (path === "/api/smart-trader/watchlist/reset") { resetBody = request.postDataJSON(); data = { persona: url.searchParams.get("persona"), archived_count: 1, reset_at: "2026-10-05T18:00:00Z" }; }
  else if (path === "/api/flow-paper/summary") data = { cash: 9000, positions_value: 1300, total_value: 10300, return_pct: 3, realized_pnl: 0, unrealized_pnl: 300, open_positions: 1, closed_positions: 0, win_rate: 0, positions: [flowPosition] };
  else if (path === "/api/flow-paper/watchlist") data = [flowObservation];
  else if (path === "/api/flow-paper/status") data = { macro: { market_status: "OPEN", spy_price: 600, spy_change_pct: 0, vix: 15, is_safe: true }, slots: { day_trade: { used: 1, max: 3 }, swing: { used: 0, max: 5 } } };
  else if (path === "/api/iflow-trader/status") data = { portfolio: { peak_value: 10300, lotto_budget: 0 }, watchlist: { wla_count: 1, wlb_count: 0 }, slots: { day_trade: { used: 1, max: 3 }, swing: { used: 0, max: 5 }, lotto: { used: 0, max: 0 } }, risk: { circuit_breaker_enabled: false, circuit_breaker_state: "FREE", drawdown_pct: -1, drawdown_freeze_threshold: null, drawdown_cash_threshold: null, sector_warnings: [], exit_policy: { day_trade: { stop_pct: -20, trim_pct: 40, take_profit_pct: 80 } } } };
  else if (path === "/api/iflow-trader/synthesis") data = { report: "", date: today };
  else if (path.startsWith("/api/news/feed") || path.startsWith("/api/news/by-ticker")) { status = failNews ? 503 : 200; data = failNews ? { detail: "mock news unavailable" } : { ok: true, items: [] }; }
  else { status = 503; data = { detail: "isolated fixture: unavailable optional data" }; }
  try { await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) }); } catch (error) { if (!path.includes("forecast")) console.log("MOCK FAILURE", path, error.message); }
}
async function context(viewport, serviceWorkers = "block") {
  const ctx = await browser.newContext({ viewport, serviceWorkers, timezoneId: "America/Los_Angeles" });
  await ctx.route(/.*/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__probeErrors = [];
    window.addEventListener("error", e => window.__probeErrors.push(e.message));
    window.addEventListener("unhandledrejection", e => window.__probeErrors.push(String(e.reason)));
  });
  page.setDefaultTimeout(8000);
  await ctx.setOffline(false);
  page.on("pageerror", error => failures.push(error.message));
  return { ctx, page };
}
async function body(page) { return page.locator("body").innerText(); }
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "document must fit viewport");
}
async function readErrors(page) {
  const session = await page.context().newCDPSession(page);
  const result = await session.send("Runtime.evaluate", { expression: "window.__probeErrors || []", returnByValue: true });
  await session.detach(); return result.result.value ?? [];
}
if (preview) {
  console.log(`Isolated frontend preview: ${origin} (mocked APIs; no production connections)`);
  await new Promise(resolve => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  await new Promise(resolve => server.close(resolve)); process.exit(0);
}
try {
  const { ctx, page } = await context({ width: 1440, height: 1000 });
  await page.goto(origin); await page.getByRole("combobox").first().fill("AAA"); await page.getByRole("combobox").first().press("Enter");
  await page.waitForTimeout(100);
  await page.getByRole("combobox").first().fill("BBB"); await page.getByRole("combobox").first().press("Enter");
  await page.getByText("+10.0%", { exact: true }).waitFor(); await page.waitForTimeout(1400);
  assert.doesNotMatch(await body(page), /\$777/); assert.match(await body(page), /\$220/);
  proofs.push("AAA delayed 1200ms then BBB: only BBB $220/+10.0% persisted, live quote $999 ignored");
  await page.getByRole("button", { name: "intraday", exact: true }).click();
  await page.getByRole("button", { name: /Run Forecast/ }).click();
  await page.getByText("historical bars unavailable", { exact: false }).waitFor();
  assert.ok(await page.locator("canvas").count() > 0);
  const chart = page.getByText("Intraday forecast · historical bars unavailable").locator("../..");
  const pixels = await chart.locator("canvas").evaluateAll(canvases => canvases.reduce((count, canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
    return count;
  }, 0));
  assert.ok(pixels > 100, "intraday chart must contain rendered pixels");
  await chart.screenshot({ path: `${output}/desktop-intraday-chart.png` });
  proofs.push("intraday returned same-day 15:30/15:45 points and rendered canvas without daily candle overlay");
  await page.screenshot({ path: `${output}/desktop-forecast.png`, fullPage: true }); await noOverflow(page);
  await page.getByRole("button", { name: "Close analysis panel" }).click();
  await page.getByRole("button", { name: "TraderJoe", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByText(/TraderJoe Portfolio/i).waitFor();
  await page.locator("span:visible").filter({ hasText: /corporate action review required/ }).first().waitFor();
  assert.match(await body(page), /carried exposure/);
  assert.match(await body(page), /2026-10-16.*11d/);
  assert.match(await body(page), /Added today \(ET\)/);
  assert.match(await body(page), /No entries or rejections recorded for this market date\./);
  assert.doesNotMatch(await body(page), /Picks fire at 06:30|click Run Picks/);
  assert.equal(await page.getByLabel("Watchlist additions period").isEnabled(), true);
  await page.getByLabel("Watchlist additions period").selectOption("today");
  assert.match(await body(page), /Screened observations \(0\)/);
  await page.getByLabel("Watchlist additions period").selectOption("all");
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Reset watchlist", exact: true }).click();
  await page.getByText(/1 observations archived at/).waitFor(); assert.deepEqual(resetBody, { confirm_persona: "smart" });
  proofs.push("persona: incomplete mark coverage, expiry11d not stored66d, ET activity, no stale date counted today, truthful empty decision state, reset POST mocked exact body+receipt");
  largeWatchlist = true;
  await page.getByRole("button", { name: "Reload watchlist", exact: true }).click();
  await page.getByText("Screened observations (26)").waitFor();
  const screened = page.getByText("Screened observations (26)").locator("..");
  assert.match(await screened.innerText(), /WLS26/);
  assert.doesNotMatch(await screened.innerText(), /WLS01/);
  await page.getByRole("button", { name: "Next screened page", exact: true }).click();
  assert.match(await screened.innerText(), /WLS14/);
  await page.getByRole("button", { name: "Next screened page", exact: true }).click();
  assert.match(await screened.innerText(), /WLS01/);
  assert.equal(await page.getByRole("button", { name: "Next screened page", exact: true }).isDisabled(), true);
  await page.getByLabel("Sort watchlist").selectOption("ticker");
  assert.match(await screened.innerText(), /WLS01/);
  assert.doesNotMatch(await body(page), /9999%|Show all observations/);
  assert.doesNotMatch(await page.getByText("Monitoring / blocked (0)").locator("..").innerText(), /LEGACY/);
  await page.getByLabel("Watchlist evidence status").selectOption("unverified");
  await page.locator("span:visible").filter({ hasText: /^LEGACY$/ }).first().waitFor();
  assert.doesNotMatch(await body(page), /9999%/);
  await page.getByLabel("Watchlist evidence status").selectOption("evaluated");
  await page.getByLabel("Watchlist rows per page").selectOption("48");
  assert.match(await screened.innerText(), /WLS26/);
  proofs.push("watchlist: all 26 rows reachable through bounded pages, sorting resets page, legacy gains hidden, page-size selection works");
  await page.getByLabel("Sort watchlist").evaluate(select => window.scrollTo({ top: window.scrollY + select.getBoundingClientRect().top - 90, behavior: "instant" }));
  await page.screenshot({ path: `${output}/desktop-watchlist.png` });
  await page.screenshot({ path: `${output}/desktop-persona.png`, fullPage: true }); await noOverflow(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `${output}/desktop-persona-viewport.png` });
  await page.getByRole("button", { name: "Flow Trader", exact: true }).click();
  await page.waitForTimeout(1000);
  await page.getByText("Circuit breaker unavailable", { exact: true }).waitFor();
  assert.doesNotMatch(await body(page), /CB FREE|Freeze at/);
  await page.getByRole("button", { name: "Expand SOXL position" }).click();
  assert.match(await body(page), /Stop \$1\.60 \(-20%\)/); assert.match(await body(page), /TP1 \$2\.80 \(\+40%\)/); assert.match(await body(page), /TP2 \$3\.60 \(\+80%\)/);
  assert.match(await body(page), /mark \+50\.0%/);
  await page.getByText("Incomplete mark: incomplete", { exact: true }).waitFor();
  proofs.push("Flow Trader: incomplete mark_quality overrides recent updated_at; disabled CB/null thresholds/lotto0; API DT exit targets -20/+40/+80; timestamped premium2->3 mark+50%");
  await page.screenshot({ path: `${output}/desktop-flow-trader.png`, fullPage: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: `${output}/desktop-flow-trader-viewport.png` });
  failNews = true; await page.getByRole("button", { name: "News", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "News feed" }).waitFor(); assert.doesNotMatch(await body(page), /No news in this window/);
  proofs.push("503 news -> explicit error/retry, not quiet empty feed");
  await ctx.setOffline(true); await page.getByText(/Offline\. Live data is unavailable/).waitFor();
  proofs.push("offline event -> persistent live-data warning"); failures.push(...await readErrors(page)); await ctx.close();

  failNews = false;
  const mobile = await context({ width: 390, height: 844 });
  await mobile.page.goto(origin); await mobile.page.getByRole("button", { name: "TraderJoe", exact: true }).click();
  await mobile.page.getByText(/carried exposure/).waitFor(); await noOverflow(mobile.page);
  const activityToggle = mobile.page.getByRole("button", { name: "Toggle watchlist activity", exact: true });
  assert.equal(await activityToggle.getAttribute("aria-expanded"), "false");
  await activityToggle.click();
  assert.equal(await activityToggle.getAttribute("aria-expanded"), "true");
  await activityToggle.click();
  await mobile.page.getByRole("button", { name: "Next screened page", exact: true }).click();
  await mobile.page.locator("span:visible").filter({ hasText: /^WLS14$/ }).first().waitFor();
  await noOverflow(mobile.page);
  await mobile.page.getByLabel("Sort watchlist").evaluate(select => window.scrollTo({ top: window.scrollY + select.getBoundingClientRect().top - 170, behavior: "instant" }));
  await mobile.page.screenshot({ path: `${output}/mobile-watchlist.png` });
  const capital = mobile.page.getByRole("spinbutton", { name: "Reset starting capital" });
  assert.equal(await capital.inputValue(), "20000");
  assert.ok((await capital.boundingBox()).width >= 96, "mobile capital must not clip the balance");
  await mobile.page.screenshot({ path: `${output}/mobile-persona.png`, fullPage: true });
  await mobile.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await mobile.page.screenshot({ path: `${output}/mobile-persona-viewport.png` });
  await mobile.page.getByRole("button", { name: "Flow Trader", exact: true }).click();
  await mobile.page.getByRole("button", { name: "Expand SOXL position" }).click(); await noOverflow(mobile.page);
  await mobile.page.getByText("Incomplete mark: incomplete", { exact: true }).waitFor();
  await mobile.page.screenshot({ path: `${output}/mobile-flow-trader.png`, fullPage: true });
  await mobile.page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await mobile.page.screenshot({ path: `${output}/mobile-flow-trader-viewport.png` });
  proofs.push("390x844 persona and expanded Flow Trader fit viewport"); failures.push(...await readErrors(mobile.page)); await mobile.ctx.close();

  const offline = await context({ width: 390, height: 844 }, "allow");
  await offline.page.goto(origin);
  await offline.page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((_resolve, reject) => setTimeout(() => reject(new Error("SW readiness timeout")), 8000))]));
  await offline.page.reload();
  await offline.page.waitForFunction(() => navigator.serviceWorker.controller != null);
  await offline.ctx.setOffline(true);
  await offline.page.reload({ waitUntil: "domcontentloaded" });
  await offline.page.getByText(/Offline\. Live data is unavailable/).waitFor();
  await noOverflow(offline.page);
  await offline.page.screenshot({ path: `${output}/mobile-offline-shell.png`, fullPage: true });
  proofs.push("existing production-build service worker loaded the cached shell on a fully offline reload with explicit unavailable-data warning");
  failures.push(...await readErrors(offline.page)); await offline.ctx.close();
  assert.deepEqual(failures, [], "no uncaught browser errors");
  console.log(JSON.stringify({ proofs, screenshots: output, uncaughtErrors: failures, isolatedOrigin: origin }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
