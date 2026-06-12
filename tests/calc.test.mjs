import test from "node:test";
import assert from "node:assert/strict";
import { extractFunctions } from "./helpers/extract.mjs";

test("parseHeightToInches handles ft/in, plain inches, and cm", () => {
  const { parseHeightToInches } = extractFunctions("parseHeightToInches");
  assert.equal(parseHeightToInches("5'4\""), 64);
  assert.equal(parseHeightToInches("5 ft 4 in"), 64);
  assert.equal(parseHeightToInches("5'"), 60);
  assert.equal(parseHeightToInches("64"), 64); // plain inches, was 768
  assert.equal(parseHeightToInches("160cm"), 63); // was 1920
  assert.equal(parseHeightToInches("160 cm"), 63);
  assert.equal(parseHeightToInches(""), 0);
});

test("calcObstetric counts spelled-out deliveries and skips losses", () => {
  const { calcObstetric } = extractFunctions("calcObstetric");
  const row = (deliveryType) => ({ deliveryType });
  assert.equal(
    calcObstetric({ obHistory: [row("Cesarean"), row("NSVD"), row("SAB at 8 wks")] }),
    "G4P2"
  );
  assert.equal(calcObstetric({ obHistory: [row("VBAC")] }), "G2P1");
  assert.equal(calcObstetric({ obHistory: [row("vaginal delivery")] }), "G2P1");
  assert.equal(calcObstetric({ obHistory: [row("miscarriage D&C")] }), "G2P0");
  assert.equal(calcObstetric({ obHistory: [] }), "G1P0");
});
