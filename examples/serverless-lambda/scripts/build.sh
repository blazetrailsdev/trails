#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .trails dist
TRAILS_ENV=production node bin/trails build
node db/seed.mjs
node bundle.mjs
