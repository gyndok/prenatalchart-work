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

test("calcGaFromEdc honors refDate and computes GA", () => {
  const { calcGaFromEdc } = extractFunctions("parseLocalDate", "calcGaFromEdc");
  // 2026-06-12 -> 2026-09-18 is 98 days; GA = 280-98 = 182d = 26w0d
  assert.equal(calcGaFromEdc("2026-09-18", "2026-06-12"), "26w 0d");
  assert.equal(calcGaFromEdc("2026-09-18", "2026-06-13"), "26w 1d");
});

test("calcGaFromEdc returns dash for pre-conception EDC, not Postterm", () => {
  const { calcGaFromEdc } = extractFunctions("parseLocalDate", "calcGaFromEdc");
  assert.equal(calcGaFromEdc("2027-06-01", "2026-06-12"), "—");
});

test("calcGaFromEdc past EDC keeps counting weeks", () => {
  const { calcGaFromEdc } = extractFunctions("parseLocalDate", "calcGaFromEdc");
  assert.equal(calcGaFromEdc("2026-06-05", "2026-06-12"), "41w 0d");
});

test("calcAge is timezone-safe and supports refDate", () => {
  const { calcAge } = extractFunctions("parseLocalDate", "calcAge");
  assert.equal(calcAge("1990-06-12", "2026-06-12"), 36); // birthday today
  assert.equal(calcAge("1990-06-13", "2026-06-12"), 35); // birthday tomorrow
  assert.equal(calcAge(""), 0);
});

test("getBmiCategory shows dash when BMI unknown", () => {
  const { getBmiCategory } = extractFunctions("getBmiCategory");
  assert.equal(getBmiCategory(0), "—");
  assert.equal(getBmiCategory(22), "Normal weight");
  assert.equal(getBmiCategory(31), "Obese");
});
