import test from "node:test";
import assert from "node:assert/strict";
import { bundleSource } from "./helpers/extract.mjs";

test("chart script guards empty weight data and signals readiness", () => {
  const src = bundleSource();
  assert.match(src, /wtData\.length\s*\?\s*Math\.ceil/);
  assert.match(src, /window\.__chartsReady = true/);
});

test("attestation block embeds signature image and typed name", () => {
  const src = bundleSource();
  assert.match(src, /data:image\/jpeg;base64,/);
  assert.match(src, /Geffrey Klein, MD FACOG/);
});

test("induction date is labeled Delivery Scheduled and attestation date is auto-filled", () => {
  const src = bundleSource();
  assert.match(src, /<label>Delivery Scheduled<\/label>/);
  assert.doesNotMatch(src, /<label>Induction Date<\/label>/);
  assert.match(src, /\{\{PRINTED_DATE\}\}<\/span><\/div>\s*<div style="font-size:7\.5pt; color:#555;">Date<\/div>/);
});
