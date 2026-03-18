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

Installed app target:

- `/Applications/PrenatalChart.app/Contents/Resources/app.asar`

Rebuild bundle:

```bash
npx @electron/asar pack extracted app-patched.asar
```

Local safety backups:

- `../prenatalchart-backups/patients-backup-2026-03-18-1833.tgz`
- `../prenatalchart-backups/app-original-2026-03-18-1833.asar`
