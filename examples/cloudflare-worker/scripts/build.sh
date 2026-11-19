#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .trails dist
pnpm exec trails-tsc-views build
TRAILS_ENV=production node bin/trails build
node bundle.mjs
