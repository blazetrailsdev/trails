#!/usr/bin/env bash
set -euo pipefail
THOR_ONLY_RE='^(packages/trailties/src/thor/|vendor/thor/|scripts/parity/unported-files/thor\.ts$|scripts/api-compare/call-mismatches-(exclude|unreviewed)/thor/)'
if [ -n "$1" ] && ! grep -qvE "$THOR_ONLY_RE" <<<"$1"; then
  echo "thor_only=true"
else
  echo "thor_only=false"
fi
