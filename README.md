# PrenatalChart

A macOS desktop app for **Women's Specialists of Clear Lake** (Geffrey H. Klein, MD) that generates a polished, multi-page prenatal record PDF from structured patient data. Built with Electron + React.

This repo is the **source of truth** for the app. The original source project was lost; what lives here is the extracted (pretty-printed) production bundle, which is edited directly, tested, repacked into `app-patched.asar`, and installed into the app at `/Applications/PrenatalChart.app`.

---

## What the app does

- **Patient management** — create, save, load, and delete patients. Records are plain JSON files stored locally in `~/Documents/PrenatalChart/patients/` (filename derived from last name + MRN). No network, no cloud — all PHI stays on the machine.
- **Structured editor** — form-based entry for demographics, pregnancy dating (LMP, EDC by LMP/US, selected EDC, scheduled delivery), prior OB history, medical/surgical history, medications/allergies, social history, birth plan, initial physical exam, labs (initial + late), ultrasounds, problem list, visit flowsheet, and free-text visit notes.
- **Paste-to-parse import** — paste a plain-text patient summary (the office's standard export format) and the parser extracts the full record: demographics, G/P obstetric summary, dates, labs (with normal/abnormal flagging), ultrasounds, pipe-delimited flowsheet visits, and dated visit notes.
- **Live preview** — the chart re-renders ~500 ms after each edit in an embedded preview pane.
- **PDF export & printing** — renders the record into a standalone HTML document and converts it to a Letter-size PDF (default save location: Desktop) or sends it to a printer.

### The printed record (3 pages)

1. **Page 1 — Prenatal Record**: practice header, patient banner (name, G/P, DOB, MRN), pregnancy dates card, demographics, prior OB history, medical history, birth plan, and initial physical exam.
2. **Page 2 — Labs & Flowsheet**: initial labs and late labs (color-coded normal/abnormal), ultrasounds, problem list, and the visit flowsheet (date, GA, FH, presentation, FHR, movement, PTL, cervix, BP/MAP, weight, urine dip, follow-up, initials).
3. **Page 3 — Notes & Charts**: prenatal visit notes, provider attestation (embedded signature image, typed name *Geffrey Klein, MD FACOG*, auto-filled creation date), and a combined **weight-gain / blood-pressure chart** (Chart.js) with the IOM weight-gain band for the patient's pre-pregnancy BMI category and BP danger/warning annotation lines (SBP 140/160, DBP 90/110).

### Clinical calculations built in

- Gestational age from selected EDC (timezone-safe, valid for any reference date)
- Age from DOB; BMI from pre-pregnancy weight + height (accepts `5'4"`, `5 ft 4 in`, `64`, `160cm`)
- BMI category and the corresponding IOM weight-gain range (used for the chart band and "Gained vs Goal" badge)
- Total pregnancy weight gain from the flowsheet; MAP per visit; G/P from prior OB history (or the parsed G_P_A_LC override)
- Lab flagging: TSH out of 0.45–4.5, HbA1c ≥ 6.5, 1-hr GCT ≥ 140, late Hgb < 11, ferritin < 12, Rh-negative highlighting

---

## Repo layout

| Path | Purpose |
|---|---|
| `extracted/` | The unpacked Electron app (de facto source). Repacked into the asar. |
| `extracted/out/main/index.js` | Electron main process: window creation, IPC (patient file CRUD, PDF export, print), chart-readiness wait, temp-file cleanup. Readable JS. |
| `extracted/out/preload/index.js` | Context-isolated bridge exposing `window.electronAPI` to the renderer. |
| `extracted/out/renderer/assets/index-DU3ZcdpM.js` | The renderer bundle: React UI, paste parser, clinical calculations, and the full HTML/CSS/JS print template (~9k lines, pretty-printed minified). **Main edited file.** |
| `extracted/out/renderer/index.html` | Renderer shell + CSP. |
| `tests/` | Node test suite (no dependencies). `tests/helpers/extract.mjs` slices top-level functions out of the bundle by name so the pure logic is unit-testable. |
| `docs/superpowers/plans/` | Implementation plans (incl. the 2026-06-12 bug-fix pass with the remaining feature backlog). |
| `repack.sh` | Packs `extracted/` → `app-patched.asar`. |
| `install.command` | Double-clickable installer (see below). |
| `app-patched.asar` | Build artifact (gitignored). |

## Architecture notes

- **Renderer → main IPC** (via preload bridge): `load-patients`, `load-patient`, `save-patient`, `delete-patient`, `export-pdf`, `print-document`. Filenames are sanitized against path traversal; corrupt patient JSON files are skipped rather than breaking the list; renaming a patient (name/MRN change) removes the old file.
- **PDF pipeline**: the renderer renders the template *at export time* (never a stale preview), the main process writes it to a temp HTML file, loads it in a hidden window, waits for a `window.__chartsReady` signal plus `document.fonts.ready` (max 5 s) instead of a fixed delay, prints to PDF, and **always** deletes the temp file (PHI) even on failure.
- **Template rendering** is `{{TOKEN}}` substitution over one large HTML template string inside the bundle; the chart script and the signature image (base64 JPEG) are embedded so the exported document is self-contained, **except** Chart.js and Google Fonts which load from CDNs — offline exports print without the chart/custom fonts (everything else still works).
- **Security posture**: context isolation on, node integration off, webview disabled, external links open in the system browser, CSP restricts scripts to self + jsdelivr.

## Development workflow

There is no build step from source — edits are made directly in the extracted bundle:

1. Edit `extracted/out/renderer/assets/index-DU3ZcdpM.js` (or main/preload).
2. Run the tests: `node --test tests/*.test.mjs` (and `node --check` on edited files).
3. Repack: `bash repack.sh` → writes `app-patched.asar`.
4. Install: `bash install.command` (or double-click in Finder). It quits the app, backs up the installed `app.asar` to `../prenatalchart-backups/app-replaced-<timestamp>.asar`, swaps in the new one, and relaunches. Re-running when already up to date is a no-op.

Rollback = copy any backup from `../prenatalchart-backups/` back over `/Applications/PrenatalChart.app/Contents/Resources/app.asar`.

The app is ad-hoc/linker-signed with no resource seal, so swapping the asar does not require re-signing.

### Testing

`tests/helpers/extract.mjs` regex-slices named top-level functions out of the pretty-printed bundle and evaluates them in isolation, so clinical logic (GA/age math, BMI/height parsing, parity, lab normalization, the paste parser) has real unit tests without the original source. Template-level invariants (chart guards, signature, labels) are asserted as content checks. 17 tests as of 2026-06-12.

## Data locations

- Patient records: `~/Documents/PrenatalChart/patients/*.json`
- PDF exports: user-chosen, defaults to `~/Desktop/<lastname>-prenatal-record.pdf`
- Backups: `../prenatalchart-backups/` (original asar from 2026-03-18, patient backup tarball, and every asar replaced by the installer)

## Change history (high level)

- **2026-03-18** — PDF layout pass: merged notes/attestation/chart content to reduce rigid pagination, rebalanced pages 1–2, kept major sections from splitting across pages.
- **2026-06-12** — Bug-fix pass (15 fixes): urine-dip 3+/4+ preserved (was coerced to "Neg"); height parser handles plain inches/cm; parity recognizes spelled-out delivery types; timezone-safe GA/age; removed inverted "Postterm" label; unknown BMI shows "—"; pre-pregnancy weight double-unit fixed; end-of-text parser sections recovered (`\Z` is not a JS regex anchor); export/print render current state; charts signal readiness and survive empty data; temp PHI file cleanup on failure; patient rename no longer duplicates files; corrupt patient JSON skipped; IPC filename traversal guard; delete dialog parented. Plus: test suite, installer.
- **2026-06-12** — Features: embedded signature image + typed name in attestation, auto-filled attestation date, "Induction Date" renamed to "Delivery Scheduled".

## Known limitations / backlog

- Offline exports lack the growth chart and Inter font (CDN-loaded); vendoring Chart.js is a candidate fix.
- No autosave or unsaved-changes warning — switching patients or quitting discards unsaved edits.
- No in-app backup/restore, no sidebar search, no edema column on the flowsheet (parsed but unused), GA not auto-computed per visit.

See `docs/superpowers/plans/2026-06-12-code-review-bug-fixes.md` for details.
