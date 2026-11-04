#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="/opt/node/bin:$PATH"
export TRAILS_ENV=production
export SECRET_KEY_BASE="${SECRET_KEY_BASE:-$(openssl rand -hex 64)}"
exec node_modules/.bin/trails server -p "${PORT:-3000}" -b "${HOST:-127.0.0.1}"
