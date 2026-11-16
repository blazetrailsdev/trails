#!/usr/bin/env bash
# Path-triggered pull_request lanes that the `changes` job's filter step has no
# room for (its `run:` script sits at the Actions size limit).
#
#   parity_inputs — the diff touches the query/schema parity pipeline or a
#     `lib/` of the `@blazetrails/activerecord...` build closure the trails-side
#     dump builds, so the run-parity-sqlite jobs run without the label.
#   sqlite_mem — an added or removed line under packages/activerecord/ names
#     `inMemoryDb`, an arm only the ARCONN=sqlite3_mem lane reaches.
#
# Usage: scripts/ci/pr-lanes.sh <base> <head>   (prints name=value lines)
#        scripts/ci/pr-lanes.sh --self-test
set -euo pipefail

PARITY_INPUTS_RE='^(scripts/parity/pipeline/|packages/(actionpack|actionview|activejob|activemodel|activerecord|activesupport|arel|bcrypt|builder|date|did-you-mean|globalid|html-sanitizer|i18n|msgpack|nokogiri|rack|rack-session|rack-test|rackup|rake|ruby-compat|trails-tsc|tse-compiler|tzinfo|vitest-matchers|zeitwerk)/lib/)'

lanes() {
  local files="$1" ar_body="$2"
  if grep -qE "$PARITY_INPUTS_RE" <<<"$files"; then
    echo "parity_inputs=true"
  else
    echo "parity_inputs=false"
  fi
  if grep -E '^[+-]' <<<"$ar_body" | grep -vE '^(\+\+\+|---)' | grep -q 'inMemoryDb'; then
    echo "sqlite_mem=true"
  else
    echo "sqlite_mem=false"
  fi
}

if [ "${1:-}" = --self-test ]; then
  expect() {
    local got
    got=$(lanes "$1" "$2" | tr '\n' ' ')
    if [ "$got" != "$3" ]; then
      echo "pr-lanes self-test: files=[$1] got [$got] want [$3]" >&2
      exit 1
    fi
  }
  expect "scripts/parity/pipeline/fixtures/ar-36/query.ts" "" "parity_inputs=true sqlite_mem=false "
  expect "packages/arel/lib/nodes/node.ts" "" "parity_inputs=true sqlite_mem=false "
  expect "packages/activerecord/test/cases/base.test.ts" "" "parity_inputs=false sqlite_mem=false "
  expect "packages/thor/lib/thor.ts" "" "parity_inputs=false sqlite_mem=false "
  expect "packages/activerecord/test/cases/x.test.ts" "+  it.skipIf(inMemoryDb())(\"x\", () => {});" "parity_inputs=false sqlite_mem=true "
  expect "packages/activerecord/test/cases/x.test.ts" "-  if (inMemoryDb()) return;" "parity_inputs=false sqlite_mem=true "
  expect "packages/activerecord/test/cases/x.test.ts" "+++ b/inMemoryDb.ts" "parity_inputs=false sqlite_mem=false "
  echo "pr-lanes self-test: ok"
  exit 0
fi

base="$1" head="$2"
if ! files=$(git diff --name-only "$base"..."$head" 2>/dev/null); then
  echo "parity_inputs=true"
  echo "sqlite_mem=true"
  exit 0
fi
lanes "$files" "$(git diff --unified=0 "$base"..."$head" -- packages/activerecord/)"
