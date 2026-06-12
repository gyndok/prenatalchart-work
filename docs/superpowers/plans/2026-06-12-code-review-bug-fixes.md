# PrenatalChart Code-Review Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 bugs found in the code review of the PrenatalChart extracted bundle (clinical calculations, paste parser, and Electron main process), verified by an extraction-based test harness, then repack the asar.

**Architecture:** The original source is lost; the pretty-printed bundle `extracted/out/renderer/assets/index-DU3ZcdpM.js` is the source of truth and is edited directly. Pure functions in the bundle are unit-tested by a harness that slices top-level functions out of the bundle by name and evaluates them with `node:test`. The Electron main process (`extracted/out/main/index.js`) is plain readable JS, verified by `node --check` plus review. Final step repacks `app-patched.asar`.

**Tech Stack:** Node 18+ (`node:test`, no deps), `@electron/asar` via npx, bash.

**Conventions:**
- All paths relative to repo root `/Users/gyndok/.codex/workspaces/default/prenatalchart-work`.
- Work on branch `fix/code-review-bugs`.
- The bundle is pretty-printed: every top-level function starts at column 0 with `function name(` and ends with `}` at column 0 — the test harness relies on this.
- Run tests with: `node --test tests/`

---

### Task 0: Branch + extraction test harness

**Files:**
- Create: `tests/helpers/extract.mjs`
- Create: `tests/harness.test.mjs`

- [ ] **Step 1: Create branch**

```bash
git checkout -b fix/code-review-bugs
```

- [ ] **Step 2: Write the harness**

Create `tests/helpers/extract.mjs`:

```js
import { readFileSync } from "node:fs";

const bundlePath = new URL(
  "../../extracted/out/renderer/assets/index-DU3ZcdpM.js",
  import.meta.url
);
const bundle = readFileSync(bundlePath, "utf-8");

// Slice top-level `function name(...) { ... }` blocks out of the
// pretty-printed bundle (body ends at the first column-0 `}`) and
// evaluate them together so they can call each other.
export function extractFunctions(...names) {
  const src = names
    .map((name) => {
      const re = new RegExp(`^function ${name}\\([\\s\\S]*?^\\}`, "m");
      const m = bundle.match(re);
      if (!m) throw new Error(`function ${name} not found in bundle`);
      return m[0];
    })
    .join("\n");
  return new Function(`${src}; return { ${names.join(", ")} };`)();
}

export function bundleSource() {
  return bundle;
}
```

- [ ] **Step 3: Write a smoke test**

Create `tests/harness.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { extractFunctions } from "./helpers/extract.mjs";

test("harness extracts a known bundle function", () => {
  const { calcBmi } = extractFunctions("calcBmi");
  assert.equal(calcBmi("150", "64"), 25.7);
});
```

- [ ] **Step 4: Run it**

Run: `node --test tests/`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add tests/
git commit -m "test: add bundle function extraction harness"
```

---

### Task 1: normUa — stop coercing 3+/4+ proteinuria to "Neg"

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`normUa`, nested in `parsePatientText`, ~line 7553)
- Test: `tests/parser.test.mjs`

`normUa` is nested inside `parsePatientText`, so test through the parser using a pipe-delimited flowsheet line.

- [ ] **Step 1: Write the failing test**

Create `tests/parser.test.mjs`:

```js
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
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/`
Expected: "3+ and 4+" test FAILS (gets `"Neg"`).

- [ ] **Step 3: Fix in bundle**

In `index-DU3ZcdpM.js`, replace:

```js
  function normUa(v2) {
    const l2 = v2.trim().toLowerCase();
    if (["n", "neg", "negative", "none", ""].includes(l2)) return "Neg";
    if (["tr", "trace"].includes(l2)) return "Tr";
    if (l2 === "1+") return "1+";
    if (l2 === "2+") return "2+";
    if (l2 === "+") return "+";
    return "Neg";
  }
```

with:

```js
  function normUa(v2) {
    const l2 = v2.trim().toLowerCase();
    if (["n", "neg", "negative", "none", ""].includes(l2)) return "Neg";
    if (["tr", "trace"].includes(l2)) return "Tr";
    if (/^[1-4]\+$/.test(l2)) return l2;
    if (l2 === "+") return "+";
    return v2.trim();
  }
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test tests/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/parser.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: preserve 3+/4+ urine dip values instead of coercing to Neg"
```

---

### Task 2: parseHeightToInches — plain inches and cm

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`parseHeightToInches`, ~line 7149)
- Test: `tests/calc.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/calc.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { extractFunctions } from "./helpers/extract.mjs";

test("parseHeightToInches handles ft/in, plain inches, and cm", () => {
  const { parseHeightToInches } = extractFunctions("parseHeightToInches");
  assert.equal(parseHeightToInches("5'4\""), 64);
  assert.equal(parseHeightToInches("5 ft 4 in"), 64);
  assert.equal(parseHeightToInches("5'"), 60);
  assert.equal(parseHeightToInches("64"), 64);       // plain inches, was 768
  assert.equal(parseHeightToInches("160cm"), 63);    // was 1920
  assert.equal(parseHeightToInches("160 cm"), 63);
  assert.equal(parseHeightToInches(""), 0);
});
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/`
Expected: plain-inches and cm assertions FAIL.

- [ ] **Step 3: Fix in bundle**

Replace:

```js
function parseHeightToInches(heightStr) {
  const ftIn = heightStr.match(/(\d+)[''ft\s]*(\d*)[""in]?/);
  if (ftIn) {
    const ft = parseInt(ftIn[1], 10);
    const inches = ftIn[2] ? parseInt(ftIn[2], 10) : 0;
    return ft * 12 + inches;
  }
  const cmMatch = heightStr.match(/(\d+\.?\d*)\s*cm/);
  if (cmMatch) return parseFloat((parseFloat(cmMatch[1]) / 2.54).toFixed(1));
  return parseFloat(heightStr) || 0;
}
```

with:

```js
function parseHeightToInches(heightStr) {
  const s = (heightStr || "").trim();
  const cmMatch = s.match(/(\d+\.?\d*)\s*cm/i);
  if (cmMatch) return Math.round(parseFloat(cmMatch[1]) / 2.54);
  const ftIn = s.match(/(\d+)\s*(?:'|ft|feet)\s*(\d*)/i);
  if (ftIn) {
    const ft = parseInt(ftIn[1], 10);
    const inches = ftIn[2] ? parseInt(ftIn[2], 10) : 0;
    return ft * 12 + inches;
  }
  return parseFloat(s) || 0;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test tests/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/calc.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: height parser no longer reads plain inches/cm as feet"
```

---

### Task 3: calcObstetric — recognize spelled-out delivery types, word-boundary match

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`calcObstetric`, ~line 7122)
- Test: `tests/calc.test.mjs` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/calc.test.mjs`)

```js
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
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/`
Expected: "Cesarean", "VBAC", "vaginal delivery" rows FAIL (counted as P0).

- [ ] **Step 3: Fix in bundle**

Replace:

```js
function calcObstetric(data) {
  const priorPregs = data.obHistory.length;
  const g = priorPregs + 1;
  const p2 = data.obHistory.filter(
    (r2) => ["SVD", "NSVD", "C/S", "CS", "forceps", "vacuum"].some(
      (t2) => r2.deliveryType.toLowerCase().includes(t2.toLowerCase())
    )
  ).length;
  return `G${g}P${p2}`;
}
```

with:

```js
function calcObstetric(data) {
  const priorPregs = data.obHistory.length;
  const g = priorPregs + 1;
  const deliveryRe = /\b(svd|nsvd|c\/s|cs|c-section|csection|cesarean|caesarean|vbac|forceps|vacuum|vaginal)\b/i;
  const p2 = data.obHistory.filter((r2) => deliveryRe.test(r2.deliveryType || "")).length;
  return `G${g}P${p2}`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test tests/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/calc.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: parity counts cesarean/VBAC/vaginal delivery types"
```

---

### Task 4: Local-date parsing + GA/age fixes (timezone, refDate, inverted Postterm)

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`calcAge` ~7059, `calcGaFromEdc` ~7071; insert `parseLocalDate` before `calcAge`)
- Test: `tests/calc.test.mjs` (append)

- [ ] **Step 1: Write the failing tests** (append to `tests/calc.test.mjs`)

```js
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
```

- [ ] **Step 2: Run, verify failure**

Run: `node --test tests/`
Expected: FAIL — `parseLocalDate` not found in bundle; refDate ignored.

- [ ] **Step 3: Fix in bundle**

Insert immediately before `function calcAge(dob) {`:

```js
function parseLocalDate(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
  const m2 = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m2) return new Date(parseInt(m2[1], 10), parseInt(m2[2], 10) - 1, parseInt(m2[3], 10));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
```

Replace `calcAge`:

```js
function calcAge(dob) {
  if (!dob) return 0;
  const birth = new Date(dob);
  const today = /* @__PURE__ */ new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m2 = today.getMonth() - birth.getMonth();
  if (m2 < 0 || m2 === 0 && today.getDate() < birth.getDate()) age--;
  return age;
}
```

with:

```js
function calcAge(dob, refDate) {
  const birth = parseLocalDate(dob);
  if (!birth) return 0;
  const today = parseLocalDate(refDate) || /* @__PURE__ */ new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m2 = today.getMonth() - birth.getMonth();
  if (m2 < 0 || m2 === 0 && today.getDate() < birth.getDate()) age--;
  return age;
}
```

Replace `calcGaFromEdc`:

```js
function calcGaFromEdc(edcStr, refDate) {
  if (!edcStr) return "";
  const edc = new Date(edcStr);
  const ref = /* @__PURE__ */ new Date();
  if (isNaN(edc.getTime())) return "";
  const diffDays = Math.round((edc.getTime() - ref.getTime()) / (1e3 * 60 * 60 * 24));
  const gadays = 280 - diffDays;
  if (gadays <= 0) return "Postterm";
  const weeks = Math.floor(gadays / 7);
  const days = gadays % 7;
  return `${weeks}w ${days}d`;
}
```

with:

```js
function calcGaFromEdc(edcStr, refDate) {
  const edc = parseLocalDate(edcStr);
  if (!edc) return "";
  const refRaw = parseLocalDate(refDate) || /* @__PURE__ */ new Date();
  const ref = new Date(refRaw.getFullYear(), refRaw.getMonth(), refRaw.getDate());
  const diffDays = Math.round((edc.getTime() - ref.getTime()) / (1e3 * 60 * 60 * 24));
  const gadays = 280 - diffDays;
  if (gadays < 0) return "—";
  const weeks = Math.floor(gadays / 7);
  const days = gadays % 7;
  return `${weeks}w ${days}d`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --test tests/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/calc.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: timezone-safe GA/age math, honor refDate, drop inverted Postterm label"
```

---

### Task 5: getBmiCategory(0) → "—"

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`getBmiCategory`, ~line 7100)
- Test: `tests/calc.test.mjs` (append)

- [ ] **Step 1: Write the failing test** (append)

```js
test("getBmiCategory shows dash when BMI unknown", () => {
  const { getBmiCategory } = extractFunctions("getBmiCategory");
  assert.equal(getBmiCategory(0), "—");
  assert.equal(getBmiCategory(22), "Normal weight");
  assert.equal(getBmiCategory(31), "Obese");
});
```

- [ ] **Step 2: Run, verify failure** — `getBmiCategory(0)` returns `"Normal weight"`.

- [ ] **Step 3: Fix in bundle** — replace:

```js
function getBmiCategory(bmi) {
  if (bmi <= 0) return "Normal weight";
```

with:

```js
function getBmiCategory(bmi) {
  if (bmi <= 0) return "—";
```

- [ ] **Step 4: Run tests, verify pass** — `node --test tests/`

- [ ] **Step 5: Commit**

```bash
git add tests/calc.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: unknown BMI no longer labeled Normal weight"
```

---

### Task 6: Pre-pregnancy weight — store bare number, render single unit

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (parser ~line 7474; `renderTemplate` PRE_PREG_WEIGHT line ~7320)
- Test: `tests/parser.test.mjs` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/parser.test.mjs`)

```js
test("pre-pregnancy weight stored as bare number, empty when missing", () => {
  const { parsePatientText } = parserFns();
  const withWt = parsePatientText("Pre-Pregnancy Wt: 150 lbs");
  assert.equal(withWt.prePregnancyWeight, "150");
  const without = parsePatientText("Name: Jane Doe");
  assert.equal(without.prePregnancyWeight, "");
});
```

- [ ] **Step 2: Run, verify failure** — gets `"150 lbs"` and `" lbs"`.

- [ ] **Step 3: Fix in bundle**

Replace:

```js
  patient.prePregnancyWeight = (get(text, /Pre-Pregnancy Wt:\s*([\d.]+)\s*lbs/) || "") + " lbs";
```

with:

```js
  patient.prePregnancyWeight = get(text, /Pre-Pregnancy Wt:\s*([\d.]+)\s*lbs/);
```

And make the template robust to legacy saved values ("150 lbs"): in `renderTemplate`, replace:

```js
    PRE_PREG_WEIGHT: data.prePregnancyWeight ? `${data.prePregnancyWeight} lbs` : "—",
```

with:

```js
    PRE_PREG_WEIGHT: parseFloat(data.prePregnancyWeight) ? `${parseFloat(data.prePregnancyWeight)} lbs` : "—",
```

- [ ] **Step 4: Run tests, verify pass** — `node --test tests/`

- [ ] **Step 5: Commit**

```bash
git add tests/parser.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: pre-pregnancy weight double-unit and phantom ' lbs' value"
```

---

### Task 7: Replace Python `\Z` end-anchors in parser regexes

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (three regexes in `parsePatientText`: `miscBlock`, `usMatches`, `noteMatches`)
- Test: `tests/parser.test.mjs` (append)

- [ ] **Step 1: Write the failing tests** (append)

```js
test("Misc labs block at end of text is parsed (no \\Z bug)", () => {
  const { parsePatientText } = parserFns();
  const p = parsePatientText("Name: Jane Doe\nMisc: Hep B viral load undetectable\n1/15/2026 ferritin 18");
  assert.match(p.labs.antibodyScreen28.value, /Hep B viral load/);
});

test("ultrasound at end of text is parsed", () => {
  const { parsePatientText } = parserFns();
  const p = parsePatientText(
    "Ultrasound Data:\n5/01/2026 (12.3) @ WSCL EDC: 11/15/2026 Normal anatomy, posterior placenta"
  );
  assert.equal(p.ultrasounds.length, 1);
  assert.match(p.ultrasounds[0].findings, /Normal anatomy/);
});

test("last visit note at end of text is parsed", () => {
  const { parsePatientText } = parserFns();
  const p = parsePatientText(
    "5/01/2026 12.3 wks Seen by: GHK\nRoutine visit, no complaints.\n5/15/2026 14.3 wks Seen by: GHK\nFundal height appropriate."
  );
  assert.equal(p.visitNotes.length, 2);
  assert.match(p.visitNotes[1].note, /Fundal height/);
});
```

- [ ] **Step 2: Run, verify failure** — end-of-text sections dropped.

- [ ] **Step 3: Fix in bundle** — three replacements, each swapping `|\Z)` for `|(?![\s\S]))`:

Replace:

```js
  const miscBlock = get(text, /^Misc:\s*([\s\S]+?)(?=\n\nUltrasound|\nUltrasound|\nPre-Pregnancy|\nPHYSICAL|\Z)/im);
```

with:

```js
  const miscBlock = get(text, /^Misc:\s*([\s\S]+?)(?=\n\nUltrasound|\nUltrasound|\nPre-Pregnancy|\nPHYSICAL|(?![\s\S]))/im);
```

Replace:

```js
  const usMatches = [...text.matchAll(/(\d+\/\d+\/\d{4})\s*\(([\d.]+)\)\s*@\s*(\w+)\s+EDC:\s*([\d/]+)\s*(.+?)(?=\d+\/\d+\/\d{4}\s*\(|\nPre-Pregnancy|\nPHYSICAL|\Z)/gis)];
```

with:

```js
  const usMatches = [...text.matchAll(/(\d+\/\d+\/\d{4})\s*\(([\d.]+)\)\s*@\s*(\w+)\s+EDC:\s*([\d/]+)\s*(.+?)(?=\d+\/\d+\/\d{4}\s*\(|\nPre-Pregnancy|\nPHYSICAL|(?![\s\S]))/gis)];
```

Replace:

```js
    /(\d+\/\d+\/\d{4})\s+([\d.]+)\s*wks?\s+Seen by:\s*\w+\s*([\s\S]*?)(?=\d+\/\d+\/\d{4}\s+[\d.]+\s*wks?\s+Seen by:|\nPlanning:|\Z)/gi
```

with:

```js
    /(\d+\/\d+\/\d{4})\s+([\d.]+)\s*wks?\s+Seen by:\s*\w+\s*([\s\S]*?)(?=\d+\/\d+\/\d{4}\s+[\d.]+\s*wks?\s+Seen by:|\nPlanning:|(?![\s\S]))/gi
```

- [ ] **Step 4: Run tests, verify pass** — `node --test tests/`

- [ ] **Step 5: Commit**

```bash
git add tests/parser.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: \\Z is not a JS regex anchor — end-of-text sections were dropped"
```

---

### Task 8: Export/print use fresh HTML, not stale debounced preview

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`handleExportPdf` ~9334, `handlePrint` ~9350)

No extractable unit test (React component); verified by code review + the existing template tests, and by manual smoke test after repack.

- [ ] **Step 1: Fix `handleExportPdf`** — replace:

```js
      setStatus("Exporting PDF...");
      const result = await window.electronAPI.exportPdf(renderedHtml, patient.lastName);
```

with:

```js
      setStatus("Exporting PDF...");
      const freshHtml = renderTemplate(templateHtml, patient);
      const result = await window.electronAPI.exportPdf(freshHtml, patient.lastName);
```

- [ ] **Step 2: Fix `handlePrint`** — replace:

```js
      setStatus("Printing...");
      await window.electronAPI.printDocument(renderedHtml);
```

with:

```js
      setStatus("Printing...");
      await window.electronAPI.printDocument(renderTemplate(templateHtml, patient));
```

- [ ] **Step 3: Surface export failure reason** — in `handleExportPdf`, replace:

```js
      } else {
        setStatus("Export failed");
      }
```

with:

```js
      } else {
        setStatus(`Export failed${result.reason ? ": " + result.reason : ""}`);
      }
```

- [ ] **Step 4: Verify bundle still parses**

Run: `node --check extracted/out/renderer/assets/index-DU3ZcdpM.js && node --test tests/`
Expected: no syntax error, tests pass.

- [ ] **Step 5: Commit**

```bash
git add extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: export/print render from current patient state, not stale preview"
```

---

### Task 9: Chart script robustness — empty-data yMax, readiness flag

**Files:**
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (chart IIFE in template, ~lines 9132–9216)
- Test: `tests/template.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/template.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { bundleSource } from "./helpers/extract.mjs";

test("chart script guards empty weight data and signals readiness", () => {
  const src = bundleSource();
  assert.match(src, /wtData\.length\s*\?\s*Math\.ceil/);
  assert.match(src, /window\.__chartsReady = true/);
});
```

- [ ] **Step 2: Run, verify failure** — both assertions FAIL.

- [ ] **Step 3: Fix in bundle**

In the template's chart IIFE, replace:

```js
(function() {
  const wtData  = {{CHART_WT_DATA}};
  const bpData  = {{CHART_BP_DATA}};
  const glomLow  = {{IOM_LOW}};
  const glomHigh = {{IOM_HIGH}};
  const yMax = Math.ceil(Math.max(...wtData.map(d=>d[1])) + 15);
```

with:

```js
(function() {
  try {
  const wtData  = {{CHART_WT_DATA}};
  const bpData  = {{CHART_BP_DATA}};
  const glomLow  = {{IOM_LOW}};
  const glomHigh = {{IOM_HIGH}};
  const yMax = wtData.length ? Math.ceil(Math.max(...wtData.map(d=>d[1])) + 15) : 45;
```

and replace the IIFE close (the `})();` directly after the Chart config's closing `});`, just before `<\/script>` at the end of the template):

```js
  });
})();
<\/script>
```

with:

```js
  });
  } catch (e) { console.error('Chart render failed:', e); }
  window.__chartsReady = true;
})();
<\/script>
```

- [ ] **Step 4: Run tests, verify pass**

Run: `node --check extracted/out/renderer/assets/index-DU3ZcdpM.js && node --test tests/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/template.test.mjs extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: chart survives empty data and signals readiness for PDF capture"
```

---

### Task 10: Main process — wait for charts instead of fixed 2 s; temp-file/window cleanup on failure

**Files:**
- Modify: `extracted/out/main/index.js:202-250` (`export-pdf`, `print-document` handlers)

Electron APIs aren't unit-testable here; verify with `node --check` and careful diff review.

- [ ] **Step 1: Add `waitForChartsReady` helper** — insert before `function setupIPC() {`:

```js
async function waitForChartsReady(win, timeoutMs = 5e3) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ready = await win.webContents.executeJavaScript("window.__chartsReady === true");
      if (ready) break;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  try {
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
  } catch {
  }
}
```

- [ ] **Step 2: Rewrite `export-pdf` handler** — replace the whole handler:

```js
  electron.ipcMain.handle("export-pdf", async (_event, html, lastName) => {
    const safeName = lastName.replace(/[^a-zA-Z0-9]/g, "") || "patient";
    const defaultPath = path.join(os.homedir(), "Desktop", `${safeName}-prenatal-record.pdf`);
    const { filePath } = await electron.dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }]
    });
    if (!filePath) return { success: false, reason: "cancelled" };
    const tmpPath = path.join(os.tmpdir(), `prenatal-export-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, "utf-8");
    const win = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        nodeIntegration: false
      }
    });
    await win.loadFile(tmpPath);
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "Letter"
    });
    win.close();
    fs.unlinkSync(tmpPath);
    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, filePath };
  });
```

with:

```js
  electron.ipcMain.handle("export-pdf", async (_event, html, lastName) => {
    const safeName = (lastName || "").replace(/[^a-zA-Z0-9]/g, "") || "patient";
    const defaultPath = path.join(os.homedir(), "Desktop", `${safeName}-prenatal-record.pdf`);
    const { filePath } = await electron.dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }]
    });
    if (!filePath) return { success: false, reason: "cancelled" };
    const tmpPath = path.join(os.tmpdir(), `prenatal-export-${Date.now()}.html`);
    const win = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        nodeIntegration: false
      }
    });
    try {
      fs.writeFileSync(tmpPath, html, "utf-8");
      await win.loadFile(tmpPath);
      await waitForChartsReady(win);
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: "Letter"
      });
      fs.writeFileSync(filePath, pdfBuffer);
      return { success: true, filePath };
    } catch (err) {
      return { success: false, reason: String(err && err.message || err) };
    } finally {
      win.destroy();
      try {
        fs.unlinkSync(tmpPath);
      } catch {
      }
    }
  });
```

- [ ] **Step 3: Rewrite `print-document` handler** — replace the whole handler:

```js
  electron.ipcMain.handle("print-document", async (_event, html) => {
    const tmpPath = path.join(os.tmpdir(), `prenatal-print-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, "utf-8");
    const win = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        nodeIntegration: false
      }
    });
    await win.loadFile(tmpPath);
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    win.webContents.print(
      { printBackground: true, silent: false },
      (_success, _failureReason) => {
        win.close();
        fs.unlinkSync(tmpPath);
      }
    );
    return { success: true };
  });
```

with:

```js
  electron.ipcMain.handle("print-document", async (_event, html) => {
    const tmpPath = path.join(os.tmpdir(), `prenatal-print-${Date.now()}.html`);
    const win = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        nodeIntegration: false
      }
    });
    try {
      fs.writeFileSync(tmpPath, html, "utf-8");
      await win.loadFile(tmpPath);
      await waitForChartsReady(win);
      await new Promise((resolve) => {
        win.webContents.print({ printBackground: true, silent: false }, () => resolve());
      });
      return { success: true };
    } catch (err) {
      return { success: false, reason: String(err && err.message || err) };
    } finally {
      win.destroy();
      try {
        fs.unlinkSync(tmpPath);
      } catch {
      }
    }
  });
```

- [ ] **Step 4: Verify**

Run: `node --check extracted/out/main/index.js`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add extracted/out/main/index.js
git commit -m "fix: PDF/print wait for charts+fonts and always clean up temp PHI file"
```

---

### Task 11: save-patient rename handling (main + preload + renderer)

**Files:**
- Modify: `extracted/out/main/index.js` (`save-patient` handler)
- Modify: `extracted/out/preload/index.js` (`savePatient`)
- Modify: `extracted/out/renderer/assets/index-DU3ZcdpM.js` (`handleSave` ~9310)

- [ ] **Step 1: Main handler** — replace:

```js
  electron.ipcMain.handle("save-patient", async (_event, data) => {
    const dir = getPatientsDir();
    const lastName = (data.lastName || "Unknown").toLowerCase().replace(/[^a-z0-9]/g, "");
    const mrn = (data.mrn || "0000").replace(/[^a-z0-9]/gi, "");
    const filename = `${lastName}-${mrn}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return { success: true, filename };
  });
```

with:

```js
  electron.ipcMain.handle("save-patient", async (_event, data, previousFilename) => {
    const dir = getPatientsDir();
    const lastName = (data.lastName || "Unknown").toLowerCase().replace(/[^a-z0-9]/g, "");
    const mrn = (data.mrn || "0000").replace(/[^a-z0-9]/gi, "");
    const filename = `${lastName || "unknown"}-${mrn || "0000"}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    if (previousFilename && previousFilename !== filename) {
      const prevPath = path.join(dir, path.basename(String(previousFilename)));
      if (prevPath !== filePath && fs.existsSync(prevPath)) {
        try {
          fs.unlinkSync(prevPath);
        } catch {
        }
      }
    }
    return { success: true, filename };
  });
```

- [ ] **Step 2: Preload** — replace:

```js
  savePatient: (data) => electron.ipcRenderer.invoke("save-patient", data),
```

with:

```js
  savePatient: (data, previousFilename) => electron.ipcRenderer.invoke("save-patient", data, previousFilename),
```

- [ ] **Step 3: Renderer `handleSave`** — replace:

```js
      const result = await window.electronAPI.savePatient(patient);
```

with:

```js
      const result = await window.electronAPI.savePatient(patient, currentFile);
```

- [ ] **Step 4: Verify**

Run: `node --check extracted/out/main/index.js && node --check extracted/out/preload/index.js && node --check extracted/out/renderer/assets/index-DU3ZcdpM.js && node --test tests/`
Expected: clean, tests pass.

- [ ] **Step 5: Commit**

```bash
git add extracted/out/main/index.js extracted/out/preload/index.js extracted/out/renderer/assets/index-DU3ZcdpM.js
git commit -m "fix: renaming a patient no longer leaves a stale duplicate file"
```

---

### Task 12: load-patients resilience + path-traversal guard + parented delete dialog

**Files:**
- Modify: `extracted/out/main/index.js` (`load-patients`, `load-patient`, `delete-patient`)

- [ ] **Step 1: Add filename guard** — insert after `function getPatientsDir() { ... }`:

```js
function resolvePatientFile(filename) {
  const safe = path.basename(String(filename || ""));
  if (!safe.endsWith(".json")) throw new Error("Invalid patient filename");
  return path.join(getPatientsDir(), safe);
}
```

- [ ] **Step 2: Harden `load-patients`** — replace:

```js
  electron.ipcMain.handle("load-patients", async () => {
    const dir = getPatientsDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files.map((filename) => {
      const filePath = path.join(dir, filename);
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      return {
        filename,
        lastName: data.lastName || "",
        firstName: data.firstName || "",
        mrn: data.mrn || "",
        dob: data.dob || ""
      };
    });
  });
```

with:

```js
  electron.ipcMain.handle("load-patients", async () => {
    const dir = getPatientsDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const patients = [];
    for (const filename of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, filename), "utf-8");
        const data = JSON.parse(raw);
        patients.push({
          filename,
          lastName: data.lastName || "",
          firstName: data.firstName || "",
          mrn: data.mrn || "",
          dob: data.dob || ""
        });
      } catch (err) {
        console.error(`Skipping unreadable patient file ${filename}:`, err);
      }
    }
    return patients;
  });
```

- [ ] **Step 3: Guard `load-patient`** — replace:

```js
  electron.ipcMain.handle("load-patient", async (_event, filename) => {
    const dir = getPatientsDir();
    const filePath = path.join(dir, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  });
```

with:

```js
  electron.ipcMain.handle("load-patient", async (_event, filename) => {
    const filePath = resolvePatientFile(filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  });
```

- [ ] **Step 4: Guard + parent `delete-patient`** — replace:

```js
  electron.ipcMain.handle("delete-patient", async (_event, filename) => {
    const filePath = path.join(getPatientsDir(), filename);
    const { response } = await electron.dialog.showMessageBox({
```

with:

```js
  electron.ipcMain.handle("delete-patient", async (event, filename) => {
    const filePath = resolvePatientFile(filename);
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    const { response } = await electron.dialog.showMessageBox(win, {
```

(the remainder of the handler is unchanged)

- [ ] **Step 5: Verify**

Run: `node --check extracted/out/main/index.js`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add extracted/out/main/index.js
git commit -m "fix: corrupt-file resilience, IPC path traversal guard, parented delete dialog"
```

---

### Task 13: Repack, final verification, merge

**Files:**
- Modify: `app-patched.asar` (regenerated)
- Modify: `README.md` (note the fixes)

- [ ] **Step 1: Full test + syntax pass**

```bash
node --test tests/ && node --check extracted/out/main/index.js && node --check extracted/out/preload/index.js && node --check extracted/out/renderer/assets/index-DU3ZcdpM.js
```

Expected: all tests pass, all checks clean.

- [ ] **Step 2: Repack the asar**

```bash
bash repack.sh
npx @electron/asar list app-patched.asar | head -5
```

Expected: "Wrote .../app-patched.asar" and a file listing.

- [ ] **Step 3: Update README** — append under "What changed":

```markdown
- 2026-06-12 bug-fix pass: urine-dip 3+/4+ preserved; height parser (plain inches/cm);
  parity recognizes spelled-out delivery types; timezone-safe GA/age; removed inverted
  "Postterm" label; BMI category dash when unknown; pre-pregnancy weight double-unit;
  end-of-text parser sections (\Z regex bug); export/print use current state; charts
  signal readiness (no fixed 2s wait) and survive empty data; temp PHI file cleanup on
  failure; patient rename no longer duplicates files; corrupt patient JSON skipped;
  IPC filename traversal guard; delete dialog parented. Tests in `tests/` (node --test).
```

- [ ] **Step 4: Commit, merge to main, push**

```bash
git add app-patched.asar README.md
git commit -m "chore: repack asar with bug-fix pass; document changes"
git checkout main
git merge --no-ff fix/code-review-bugs -m "Merge fix/code-review-bugs: code-review bug-fix pass"
git push origin main
```

- [ ] **Step 5: Install (user-confirmed)** — installing into `/Applications/PrenatalChart.app` overwrites the live app; confirm with the user first, then:

```bash
cp app-patched.asar /Applications/PrenatalChart.app/Contents/Resources/app.asar
```

(An original-asar backup already exists at `../prenatalchart-backups/app-original-2026-03-18-1833.asar`.)

---

## Known limitations (deliberately out of scope)

- Charts and fonts still load from CDNs — offline exports print without charts (the readiness flag prevents hangs and the catch keeps the rest of the page printing). Vendoring Chart.js into the template is a follow-up feature.
- Feature requests from the review (autosave/dirty guard, backup/restore, edema column, per-visit GA, flowsheet out-of-range highlighting, sidebar search) are not part of this bug-fix pass.
