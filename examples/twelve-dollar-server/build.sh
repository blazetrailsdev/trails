#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="/opt/node/bin:$PATH"
corepack enable --install-directory "$HOME/.local/bin" >/dev/null 2>&1 || true
export PATH="$HOME/.local/bin:$PATH"
pnpm install --frozen-lockfile
pnpm exec tsc --build packages/trailties packages/rackup packages/activerecord packages/actionpack
