# PrenatalChart PDF Tweaks

This standalone repo captures the PDF export layout changes made to `PrenatalChart.app`.

Main edited file:

- `extracted/out/renderer/assets/index-DU3ZcdpM.js`

Included extracted app files:

- `extracted/out/main/index.js`
- `extracted/out/preload/index.js`
- `extracted/out/renderer/index.html`
- `extracted/out/renderer/assets/index-BvP0VLdo.css`
- `extracted/out/renderer/assets/index-DU3ZcdpM.js`
- `extracted/package.json`

What changed:

- reduced rigid PDF pagination by merging notes, attestation, and chart content
- enlarged and rebalanced page 1 and page 2 to use more of each sheet
- kept major sections from splitting across pages
- 2026-06-12 bug-fix pass: urine-dip 3+/4+ preserved; height parser (plain inches/cm);
  parity recognizes spelled-out delivery types; timezone-safe GA/age; removed inverted
  "Postterm" label; BMI category dash when unknown; pre-pregnancy weight double-unit;
  end-of-text parser sections (\Z regex bug); export/print use current state; charts
  signal readiness (no fixed 2s wait) and survive empty data; temp PHI file cleanup on
  failure; patient rename no longer duplicates files; corrupt patient JSON skipped;
  IPC filename traversal guard; delete dialog parented. Tests in `tests/` (run with
  `node --test tests/*.test.mjs`).

Installed app target:

- `/Applications/PrenatalChart.app/Contents/Resources/app.asar`

Rebuild bundle:

```bash
npx @electron/asar pack extracted app-patched.asar
```

Install into the app (quits PrenatalChart, backs up the current asar to
`../prenatalchart-backups/`, swaps in `app-patched.asar`, relaunches):

```bash
bash install.command   # or double-click install.command in Finder
```

Local safety backups:

- `../prenatalchart-backups/patients-backup-2026-03-18-1833.tgz`
- `../prenatalchart-backups/app-original-2026-03-18-1833.asar`
