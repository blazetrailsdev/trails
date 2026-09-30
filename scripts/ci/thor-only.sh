#!/usr/bin/env bash
# Prints `thor_only=true` when every changed path (newline-separated in $1) is
# in the thor-only set, else `thor_only=false`. Called from the `changes` job's
# filter step; the gate reference in scripts/ci-suite-coverage.test.ts
# documents what the flag narrows.
set -euo pipefail
THOR_ONLY_RE='^(packages/trailties/src/thor/|vendor/thor/|scripts/parity/unported-files/thor\.ts$|scripts/api-compare/call-mismatches-(exclude|unreviewed)/thor/)'
if [ -n "$1" ] && ! grep -qvE "$THOR_ONLY_RE" <<<"$1"; then
  echo "thor_only=true"
else
  echo "thor_only=false"
fi
