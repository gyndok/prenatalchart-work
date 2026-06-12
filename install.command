#!/usr/bin/env bash
# PrenatalChart updater — double-click in Finder (or run: bash install.command)
# Quits the app, backs up the installed app.asar, installs app-patched.asar, relaunches.
# Rollback: copy any backup from ../prenatalchart-backups back over
#   /Applications/PrenatalChart.app/Contents/Resources/app.asar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="/Applications/PrenatalChart.app"
TARGET="$APP/Contents/Resources/app.asar"
SOURCE="$ROOT/app-patched.asar"
BACKUP_DIR="$ROOT/../prenatalchart-backups"

echo "PrenatalChart updater"
echo "====================="

if [ ! -f "$SOURCE" ]; then
  echo "ERROR: $SOURCE not found. Run repack.sh first."
  exit 1
fi
if [ ! -f "$TARGET" ]; then
  echo "ERROR: PrenatalChart.app not found at $APP."
  exit 1
fi

if pgrep -xq "PrenatalChart"; then
  echo "Quitting PrenatalChart..."
  osascript -e 'quit app "PrenatalChart"' >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -xq "PrenatalChart" || break
    sleep 1
  done
  if pgrep -xq "PrenatalChart"; then
    echo "ERROR: PrenatalChart is still running. Quit it manually and re-run."
    exit 1
  fi
fi

if cmp -s "$SOURCE" "$TARGET"; then
  echo "Already up to date — installed app matches app-patched.asar."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d-%H%M)"
BACKUP="$BACKUP_DIR/app-replaced-$STAMP.asar"
cp "$TARGET" "$BACKUP"
echo "Backed up current app.asar -> $BACKUP"

cp "$SOURCE" "$TARGET"
echo "Installed new app.asar."

echo
echo "Done. Launching PrenatalChart..."
open "$APP"
