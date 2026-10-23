#!/usr/bin/env bash
set -euo pipefail
THOR_ONLY_RE='^(packages/trailties/src/thor/|vendor/thor/|scripts/parity/unported-files/thor\.ts$|scripts/api-compare/call-mismatches-(exclude|unreviewed)/thor/)'
ACTIONCABLE_ONLY_RE='^(packages/actioncable/|scripts/parity/unported-files/actioncable\.ts$)'
files="${1:-}"
scoped_only() {
  if [ -n "$files" ] && ! grep -qvE "$2" <<<"$files"; then
    echo "$1=true"
  else
    echo "$1=false"
  fi
}
scoped_only thor_only "$THOR_ONLY_RE"
scoped_only actioncable_only "$ACTIONCABLE_ONLY_RE"
