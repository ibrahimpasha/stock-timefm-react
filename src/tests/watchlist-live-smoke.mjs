import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

// Only watchlist GETs reach the live API. All other data/commands are isolated.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BROWSER_PACKAGE ?? "/home/ibmhd/perplexity-ai/venv/lib/python3.12/site-packages/patchright/driver/package");
const origin = process.env.WATCHLIST_ORIGIN ?? "http://127.0.0.1:3000";
const output = process.env.SMOKE_OUTPUT ?? "/tmp/stock-timefm-watchlist-live-smoke";
await mkdir(output, { recursive: true });
const receipts = {};
for (const persona of ["smart", "aggressive", "builder", "ruby"]) {
  const response = await fetch(`${origin}/api/smart-trader/watchlist?persona=${persona}`);
  assert.equal(response.status, 200);
  const data = await response.json(), rows = [...data.wla, ...data.wlb];
  assert.equal(new Set(rows.map(row => `${row.ticker}|${row.option_type}|${row.strike}|${row.expiry}`)).size, rows.length);
  assert.ok(data.activity.last_scan_at);
  assert.ok(data.activity.last_maintenance_at);
  assert.ok(rows.every(row => row.id && typeof row.current_dte === "number"));
  receipts[persona] = {
    active: rows.length, recorded: rows.filter(row => row.provenance_status === "recorded").length,
    last_scan_at: data.activity.last_scan_at, last_maintenance_at: data.activity.last_maintenance_at,
    latest_source_date: data.activity.latest_source_date,
  };
}
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, serviceWorkers: "block" });
    await context.route(/.*/, async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith("/api/") && url.pathname !== "/health") return route.continue();
      if (url.pathname === "/api/smart-trader/watchlist" && request.method() === "GET") return route.continue();
      let status = 503, data = { detail: "isolated live-watchlist probe" };
      if (url.pathname === "/api/smart-trader/summary") {
        status = 200;
        data = { persona: url.searchParams.get("persona"), persona_description: "Paper book",
          starting_capital: 20000, cash: 20000, positions_value: 0, total_value: 20000, return_pct: 0,
          realized_pnl: 0, unrealized_pnl: 0, open_positions: 0, closed_positions: 0, win_rate: 0,
          positions: [], closed: [] };
      }
      if (url.pathname === "/api/smart-trader/history") { status = 200; data = []; }
      if (url.pathname === "/api/smart-trader/personas") { status = 200; data = { personas: [] }; }
      if (url.pathname === "/api/smart-trader/today") { status = 200; data = { picked: [], rejected_count: 0, rejected_by_rule: {} }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole("button", { name: "TraderJoe", exact: true }).click();
    await page.getByLabel("Watchlist evidence status").waitFor();
    await page.getByRole("button", { name: "Reload watchlist", exact: true }).waitFor();
    await page.locator("body").filter({ hasText: "Latest observed flow:" }).waitFor();
    assert.equal(await page.getByLabel("Watchlist evidence status").inputValue(), "evaluated");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.doesNotMatch(await page.locator("body").innerText(), /Legacy observation; eligibility not evaluated\./);
    await page.getByLabel("Sort watchlist").evaluate(select => window.scrollTo({
      top: window.scrollY + select.getBoundingClientRect().top - (innerWidth < 768 ? 175 : 100), behavior: "instant",
    }));
    await page.screenshot({ path: `${output}/${name}-watchlist.png` });
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ receipts, screenshots: output, errors, live_write_requests: 0 }, null, 2));
} finally {
  await browser.close();
}
