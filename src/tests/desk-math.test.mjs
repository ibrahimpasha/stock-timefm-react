import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync(new URL("../lib/deskMath.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { leanTone, changeTone, minutesToOpen } = await import(`data:text/javascript,${encodeURIComponent(outputText)}`);

test("lean is diverging around a neutral midpoint", () => {
  assert.equal(leanTone(50, 50), "0");
  assert.equal(leanTone(100, 0), "up-3");
  assert.equal(leanTone(35, 65), "down-1");
  assert.equal(leanTone(0, 0), "0");
});

test("unknown-side premium dilutes the lean instead of counting as a side", () => {
  assert.equal(leanTone(3, 7, 53), "0"); // INTC on 10/30: mostly unknown, must not read as bearish
  assert.equal(leanTone(3, 7), "down-2");
});

test("daily change steps", () => {
  assert.equal(changeTone(0), "0");
  assert.equal(changeTone(0.5), "up-1");
  assert.equal(changeTone(-1), "down-2");
  assert.equal(changeTone(-3), "down-3");
});

test("minutes to the next open skip weekends and a session already started", () => {
  assert.equal(minutesToOpen(new Date("2026-11-02T00:00:00Z")), 14 * 60 + 30); // Sun 19:00 ET
  assert.equal(minutesToOpen(new Date("2026-11-02T14:00:00Z")), 30); // Mon 09:00 ET
  assert.equal(minutesToOpen(new Date("2026-11-06T21:00:00Z")), 2 * 1440 + 17 * 60 + 30); // Fri 16:00 ET
  assert.equal(minutesToOpen(new Date("2026-11-02T15:00:00Z")), 1440 - 30); // Mon 10:00 ET
});
