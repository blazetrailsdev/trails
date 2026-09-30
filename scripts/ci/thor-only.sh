#!/usr/bin/env bash
set -euo pipefail
THOR_ONLY_RE='^(packages/trailties/src/thor/|vendor/thor/|scripts/parity/unported-files/thor\.ts$|scripts/api-compare/call-mismatches-(exclude|unreviewed)/thor/)'
files="${1:-}"
if [ -n "$files" ] && ! grep -qvE "$THOR_ONLY_RE" <<<"$files"; then
  echo "thor_only=true"
else
  echo "thor_only=false"
fi
