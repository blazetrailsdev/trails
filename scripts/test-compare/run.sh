#!/usr/bin/env bash
# Driver for `pnpm test:compare`. Forwards extra args ("$@") to
# test-compare.ts so flags like `--package`, `--missing`, `--json`,
# `--incomplete` reach the comparison step.
#
# Special flag handled here (not forwarded to test-compare.ts):
#   --cached   Skip the fetch + Ruby/TS extract steps if the cached
#              output/rails-tests.json and output/ts-tests.json already
#              exist. Falls back to a full run if either is missing.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
OUT_DIR="$DIR/output"

USE_CACHE=0
FORWARD_ARGS=()
for arg in "$@"; do
  if [[ "$arg" == "--cached" ]]; then
    USE_CACHE=1
  else
    FORWARD_ARGS+=("$arg")
  fi
done

CACHE_HIT=0
if [[ "$USE_CACHE" -eq 1 ]]; then
  if [[ -f "$OUT_DIR/rails-tests.json" && -f "$OUT_DIR/ts-tests.json" ]]; then
    CACHE_HIT=1
    echo "==> Using cached rails-tests.json + ts-tests.json (--cached)"
  else
    echo "==> --cached requested but cache missing; running full extract" >&2
  fi
fi

if [[ "$CACHE_HIT" -eq 0 ]]; then
  # Single tsx invocation fetches every source registered in vendor/sources.ts.
  pnpm -s vendor:fetch
  # Vendored sources always land at $ROOT/vendor/<name> — no need to shell
  # out to tsx three times just to print the same paths.
  RAILS_DIR="$ROOT/vendor/rails" \
    RACK_DIR="$ROOT/vendor/rack" \
    GLOBALID_DIR="$ROOT/vendor/globalid" \
    ruby "$DIR/extract-ruby-tests.rb"
  pnpm tsx "$DIR/extract-ts-tests.ts"
fi

pnpm tsx "$DIR/test-compare.ts" "${FORWARD_ARGS[@]+"${FORWARD_ARGS[@]}"}"
