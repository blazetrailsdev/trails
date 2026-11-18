#!/usr/bin/env bash
# Precompile views, write the AOT boot/autoload maps, seed the DB and bundle into dist/handler.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .trails dist
pnpm exec trails-tsc-views build
TRAILS_ENV=production node bin/trails build
node db/seed.mjs
node bundle.mjs
