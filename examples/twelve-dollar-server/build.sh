#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="/opt/node/bin:$PATH"
npm install -g corepack >/dev/null 2>&1 || true
corepack enable --install-directory "$HOME/.local/bin" >/dev/null 2>&1 || true
export PATH="$HOME/.local/bin:$PATH"
pnpm install --frozen-lockfile --filter "@blazetrails/example-twelve-dollar-server..."
pnpm --filter "@blazetrails/example-twelve-dollar-server^..." run build
