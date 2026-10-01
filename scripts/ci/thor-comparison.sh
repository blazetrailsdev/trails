#!/usr/bin/env bash
# Rails API/Test Comparison for a thor-only diff (`thor_only`, thor-only.sh):
# the `rails-comparison` job's gates, extracted and compared for the `thor`
# package alone. The whole-surface job stays the one that runs on `main` and on
# every other diff; this one must red on exactly what that job would red on
# for a change confined to packages/trailties/src/thor/ and thor's own
# register rows. Gate reference: scripts/ci-suite-coverage.test.ts.
#
# Three kinds of step, each named with its reason. Every script the
# whole-surface job runs is named below, as a spec line or as a skip — the
# gate reference's test fails on one that is neither.
#
# SCOPED — `--package thor`. A gate that reads a whole-surface artifact holds
# only thor's committed rows against it and refuses an artifact that compared
# anything else (scripts/api-compare/scope.ts), so no other package's rows read
# as STALE.
#
# UNSCOPED — run exactly as the whole-surface job runs them:
#   scripts/api-compare/lint-missing-rails-call-reasons.ts
#       reads every packages/*/src JSDoc block; no artifact, ~2s.
#   scripts/parity/lint-legacy-script-names.ts
#       reads every tracked file for a retired script name; ~3s.
#
# SKIPPED — thor is outside the population the step judges, or nothing it
# reads is in the thor-only path set:
#   scripts/api-compare/receipt-audit.ts            `--package activerecord`.
#   scripts/api-compare/lint-extra-surface-ratchet.ts
#   scripts/api-compare/lint-param-names.ts
#   scripts/api-compare/lint-block-params.ts        thor is in no GATED_PACKAGES.
#   scripts/api-compare/lint-deps.ts                no RULES row names thor.
#   scripts/test-compare/compare.ts --check         GATE_ENFORCED_PACKAGES is
#                                                   activerecord alone.
#       (scripts/api-compare/scope.test.ts fails when one of those four
#       premises stops holding.)
#   lint-call-mismatches.ts --write (reseed drift)  the scoped call ratchets
#       already fail on a NEW or STALE thor row, an over- or under-tight mark
#       and a non-canonical shard; a reseed would rewrite packages this run
#       never measured.
#   scripts/build-rails-file-structure-manifest.ts  method order: arel and
#                                                   activemodel only.
#   scripts/build-rails-test-names-manifest.ts      test names: actionview,
#       arel, date, did-you-mean and i18n only.
#   scripts/build-rails-privates-manifest.ts --check-deprecated,
#   scripts/parity/conventions-doc.ts, the runtime privates artifact
#       generated from vendored Ruby and conventions.ts.
#   scripts/generate-standalone-associations-exclude.ts
#   scripts/test-deps/rails-test-deps.ts
#   scripts/test-deps/build-fixture-baseline.ts
#   scripts/test-compare/closure-cli.ts
#   scripts/fixtures-compare/compare.ts
#   scripts/schema-compare/compare.ts (and its vitest suite)
#       activerecord and activesupport inputs only.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
export CI_BG_DIR="${CI_BG_DIR:-$(mktemp -d)}"

only='with_entries(select(.key == "thor"))'
LIB_PATHS_JSON=$(pnpm --silent vendor:fetch --print-lib-paths | jq -c "$only")
LIB_ENTRY_FILES_JSON=$(pnpm --silent vendor:fetch --print-lib-entry-files | jq -c "$only")
TEST_PATHS_JSON=$(pnpm --silent vendor:fetch --print-test-paths | jq -c "$only")
LOCKFILE_PATH="$PWD/vendor/sources.lock.json"
export LIB_PATHS_JSON LIB_ENTRY_FILES_JSON TEST_PATHS_JSON LOCKFILE_PATH

api='pnpm exec tsx scripts/api-compare'
tests='pnpm exec tsx scripts/test-compare'
spec=$(
  cat <<SPEC
ts-api: $api/extract-ts-api.ts --package thor
ruby-api: cd scripts/api-compare && API_COMPARE_FORCE=1 ruby extract-ruby-api.rb
ruby-tests: cd scripts/test-compare && ruby extract-ruby-tests.rb
compare after ts-api,ruby-api: $api/compare.ts --package thor && $api/compare.ts --privates --package thor && $api/compare.ts --calls --package thor
extra-tags after compare: $api/extra-surface.ts --package thor
arity after compare: $api/lint-arity-excludes.ts --package thor
inheritance after compare: $api/lint-inheritance-excludes.ts --package thor
body-pins after compare: $api/lint-body-pins.ts --package thor
call-mismatches after compare: $api/lint-call-mismatches.ts --no-regen --package thor
call-args after compare: $api/lint-call-args.ts --no-regen --package thor
ruby-compat after compare: $api/lint-ruby-compat-calls.ts --no-regen --package thor
arms-report after compare: $api/report-arms.ts --report --package=thor
arm-throws after compare: $api/lint-arm-throws.ts --package thor
predicates after compare: $api/lint-predicate-kinds.ts --package thor
parents after compare: $api/lint-ambiguous-parents.ts --package thor
privates-manifest after ruby-api: pnpm exec tsx scripts/build-rails-privates-manifest.ts --package thor
rails-private after privates-manifest: pnpm exec eslint --no-inline-config --config eslint/rails-private-jsdoc.config.mjs packages/trailties/src/thor
detached-jsdoc: $api/lint-detached-jsdoc-tags.ts --package thor
reasons: pnpm exec tsx scripts/api-compare/lint-missing-rails-call-reasons.ts
legacy: pnpm exec tsx scripts/parity/lint-legacy-script-names.ts
test-compare after ruby-tests: $tests/extract-ts-tests.ts --package thor && $tests/compare.ts --package thor --gates
assertions after test-compare: $tests/lint-assertion-mismatches.ts --no-regen --package thor
SPEC
)

node scripts/ci/bg-gates.mjs start <<<"$spec"
status=0
while IFS= read -r id; do
  echo "::group::$id"
  node scripts/ci/bg-gates.mjs wait "$id" || status=1
  echo "::endgroup::"
done < <(sed -E 's/^([a-z-]+)( after [^:]+)?: .*/\1/' <<<"$spec")
node scripts/ci/bg-gates.mjs summary
exit "$status"
