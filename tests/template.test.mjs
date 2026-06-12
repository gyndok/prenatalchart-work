import test from "node:test";
import assert from "node:assert/strict";
import { bundleSource } from "./helpers/extract.mjs";

test("chart script guards empty weight data and signals readiness", () => {
  const src = bundleSource();
  assert.match(src, /wtData\.length\s*\?\s*Math\.ceil/);
  assert.match(src, /window\.__chartsReady = true/);
});
