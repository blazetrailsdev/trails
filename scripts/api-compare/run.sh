#!/usr/bin/env bash
# Driver for `pnpm api:compare`. Forwards any extra args ("$@") to
# compare.ts so flags like `--package`, `--public-only`, `--privates-only`,
# `--files`, `--incomplete`, `--missing`, `--inheritance` reach the
# comparison step. The fetch / extract / manifest steps don't take args,
# so they run unconditionally.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"

pnpm tsx "$ROOT/vendor/fetch.ts" --source rails
RAILS_DIR="$(pnpm tsx "$ROOT/vendor/fetch.ts" --print-paths rails)" ruby "$DIR/extract-ruby-api.rb"
pnpm tsx "$DIR/extract-ts-api.ts"
pnpm tsx "$DIR/compare.ts" "$@"
pnpm tsx "$ROOT/scripts/build-rails-privates-manifest.ts"
