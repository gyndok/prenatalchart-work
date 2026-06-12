import test from "node:test";
import assert from "node:assert/strict";
import { extractFunctions } from "./helpers/extract.mjs";

export const parserFns = () =>
  extractFunctions("createDefaultPatient", "get", "toIsoDate", "lab", "parsePatientText");

const flowLine = (protein) =>
  `Date: 5/01/2026 | FH: 30 | Presentation: cephalic | FHR: 140 | Movement: good | PTL: no | Cervical Exam: na | SBP: 118 | DBP: 72 | Edema: none | Wt: 152 | Protein: ${protein} | Ketones: neg | Glucose: neg | Follow-up: 1 wk | Initials: ghk | GA by LMP: 30.1 | GA by US: 30.3`;

test("3+ and 4+ proteinuria are preserved, not coerced to Neg", () => {
  const { parsePatientText } = parserFns();
  const p3 = parsePatientText(flowLine("3+"));
  assert.equal(p3.visits[0].protein, "3+");
  const p4 = parsePatientText(flowLine("4+"));
  assert.equal(p4.visits[0].protein, "4+");
});

test("negative and trace proteinuria still normalize", () => {
  const { parsePatientText } = parserFns();
  assert.equal(parsePatientText(flowLine("neg")).visits[0].protein, "Neg");
  assert.equal(parsePatientText(flowLine("trace")).visits[0].protein, "Tr");
});
