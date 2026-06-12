import test from "node:test";
import assert from "node:assert/strict";
import { extractFunctions } from "./helpers/extract.mjs";

test("harness extracts a known bundle function", () => {
  const { calcBmi } = extractFunctions("calcBmi");
  assert.equal(calcBmi("150", "64"), 25.7);
});
