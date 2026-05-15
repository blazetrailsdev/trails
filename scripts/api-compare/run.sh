#!/usr/bin/env bash
# Driver for `pnpm api:compare`. Forwards any extra args ("$@") to
# compare.ts so flags like `--package`, `--public-only`, `--privates-only`,
# `--files`, `--incomplete`, `--missing`, `--inheritance` reach the
# comparison step. The fetch / extract / manifest steps don't take args,
# so they run unconditionally.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

# Fetch every source the registry knows about (rails, rack, globalid, …).
# extract-ruby-api.rb iterates whichever packages are in LIB_PATHS_JSON; the
# old per-source --source rails was a wave-2b vestige that pre-dated rack
# and globalid being api-compared.
pnpm -s tsx "$ROOT/vendor/fetch.ts"
LIB_PATHS_JSON="$(pnpm -s tsx "$ROOT/vendor/fetch.ts" --print-lib-paths)" \
  LOCKFILE_PATH="$ROOT/vendor/sources.lock.json" \
  ruby "$DIR/extract-ruby-api.rb"
pnpm tsx "$DIR/extract-ts-api.ts"
pnpm tsx "$DIR/compare.ts" "$@"
pnpm tsx "$ROOT/scripts/build-rails-privates-manifest.ts"
pnpm tsx "$ROOT/scripts/build-rails-method-order-manifest.ts"
