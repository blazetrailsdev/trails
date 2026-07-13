#!/usr/bin/env bash
# Driver for `pnpm rails:find <query>`. Ensures the two manifests the lookup
# reads exist (building them once via the SAME extractors test:compare /
# api:compare use), then runs the pure lookup in bin.ts. Subsequent runs are
# fast — they hit the cached manifests and skip the build.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
TEST_JSON="$ROOT/scripts/test-compare/output/rails-tests.json"
API_JSON="$ROOT/scripts/api-compare/output/rails-api.json"

if [[ ! -f "$TEST_JSON" ]]; then
  echo "==> rails:find: building test manifest (one-time)…" >&2
  TEST_PATHS_JSON="$(pnpm -s vendor:fetch --print-test-paths)" \
    ruby "$ROOT/scripts/test-compare/extract-ruby-tests.rb" >&2
fi

if [[ ! -f "$API_JSON" ]]; then
  echo "==> rails:find: building api manifest (one-time)…" >&2
  LIB_PATHS_JSON="$(pnpm -s vendor:fetch --print-lib-paths)" \
    LOCKFILE_PATH="$ROOT/vendor/sources.lock.json" \
    ruby "$ROOT/scripts/api-compare/extract-ruby-api.rb" >&2
fi

pnpm tsx "$DIR/bin.ts" "$@"
