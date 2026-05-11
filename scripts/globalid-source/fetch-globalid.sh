#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -d vendor/bundle ]; then
  echo "globalid already vendored at $SCRIPT_DIR/vendor/bundle — skipping."
  echo "Source: \$(ls vendor/bundle/ruby/*/gems/globalid-*/lib 2>/dev/null | head -1)"
  exit 0
fi

bundle config set --local path vendor/bundle
bundle install

GIDLIB="$(ls -d vendor/bundle/ruby/*/gems/globalid-*/lib 2>/dev/null | head -1)"
echo "globalid vendored. Source: $SCRIPT_DIR/$GIDLIB"
