#!/usr/bin/env bash
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
extra-ratchet after compare: $api/lint-extra-surface-ratchet.ts --package thor
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
