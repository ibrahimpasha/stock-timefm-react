import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync(new URL("../lib/tickerMatch.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { rankTickers } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

const names = { AAPL: "Apple Inc.", APO: "Apollo Global Management, Inc.", GEMI: "Gemini Space", NVDA: "NVIDIA Corp", WM: "Waste Management Inc" };

test("symbol and company name both resolve", () => {
  assert.equal(rankTickers(names, "appl", 5)[0].ticker, "AAPL");
  assert.equal(rankTickers(names, "apple", 5)[0].ticker, "AAPL");
  assert.equal(rankTickers(names, "nvid", 5)[0].ticker, "NVDA");
});

test("names match at a word start, not inside a word", () => {
  assert.deepEqual(rankTickers(names, "gem", 5).map((m) => m.ticker), ["GEMI"]);
  assert.deepEqual(rankTickers(names, "manage", 5).map((m) => m.ticker), ["APO", "WM"]);
});

test("empty query finds nothing and limit holds", () => {
  assert.deepEqual(rankTickers(names, "  ", 5), []);
  assert.equal(rankTickers(names, "a", 1).length, 1);
});
