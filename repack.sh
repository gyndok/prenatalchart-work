#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

npx @electron/asar pack extracted app-patched.asar
echo "Wrote $ROOT/app-patched.asar"
