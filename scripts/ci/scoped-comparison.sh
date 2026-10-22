#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."
export CI_BG_DIR="${CI_BG_DIR:-$(mktemp -d)}"

pkg="${1:?usage: scoped-comparison.sh <package>}"

case "$pkg" in
  thor) src=packages/trailties/src/thor ;;
  *) src="packages/$pkg/src" ;;
esac

only="with_entries(select(.key == \"$pkg\"))"
LIB_PATHS_JSON=$(pnpm --silent vendor:fetch --print-lib-paths | jq -c "$only")
LIB_ENTRY_FILES_JSON=$(pnpm --silent vendor:fetch --print-lib-entry-files | jq -c "$only")
TEST_PATHS_JSON=$(pnpm --silent vendor:fetch --print-test-paths | jq -c "$only")
LOCKFILE_PATH="$PWD/vendor/sources.lock.json"
export LIB_PATHS_JSON LIB_ENTRY_FILES_JSON TEST_PATHS_JSON LOCKFILE_PATH

api='pnpm exec tsx scripts/api-compare'
tests='pnpm exec tsx scripts/test-compare'
unscoped_reasons=(
  "inlined: takes no --package; reads the pairs the scoped compare wrote"
  "reasons: takes no --package; reads committed @missingRailsCall tags and baseline reasons"
  "legacy: takes no --package; greps the repo for retired script names"
)
unscoped=$(
  cat <<SPEC
reasons: pnpm exec tsx scripts/api-compare/lint-missing-rails-call-reasons.ts
legacy: pnpm exec tsx scripts/parity/lint-legacy-script-names.ts
SPEC
)
scoped=$(
  cat <<SPEC
ts-api: $api/extract-ts-api.ts --package $pkg
ruby-api: cd scripts/api-compare && API_COMPARE_FORCE=1 ruby extract-ruby-api.rb
ruby-tests: cd scripts/test-compare && ruby extract-ruby-tests.rb
compare after ts-api,ruby-api: $api/compare.ts --package $pkg && $api/compare.ts --privates --package $pkg && $api/compare.ts --calls --package $pkg
extra-tags after compare: $api/extra-surface.ts --package $pkg
extra-ratchet after compare: $api/lint-extra-surface-ratchet.ts --package $pkg
body-pins after compare: $api/lint-body-pins.ts --package $pkg
call-mismatches after compare: $api/lint-call-mismatches.ts --no-regen --package $pkg
call-args after compare: $api/lint-call-args.ts --no-regen --package $pkg
ruby-compat after compare: $api/lint-ruby-compat-calls.ts --no-regen --package $pkg
arms-report after compare: $api/report-arms.ts --report --package=$pkg
arm-throws after compare: $api/lint-arm-throws.ts --package $pkg
predicates after compare: $api/lint-predicate-kinds.ts --package $pkg
parents after compare: $api/lint-ambiguous-parents.ts --package $pkg
inlined after compare: $api/lint-inlined-from.ts
privates-manifest after ruby-api: pnpm exec tsx scripts/build-rails-privates-manifest.ts --package $pkg
rails-private after privates-manifest: pnpm exec eslint --no-inline-config --config eslint/rails-private-jsdoc.config.mjs $src
detached-jsdoc: $api/lint-detached-jsdoc-tags.ts --package $pkg
test-compare after ruby-tests: $tests/extract-ts-tests.ts --package $pkg && $tests/compare.ts --package $pkg --gates
assertions after test-compare: $tests/lint-assertion-mismatches.ts --no-regen --package $pkg
SPEC
)

if [ "$LIB_PATHS_JSON" = "{}" ]; then
  echo "::warning::$pkg has no vendored lib path, so it is not enrolled in the compare tooling; ran only its unscoped gates"
  spec="$unscoped"
else
  spec="$scoped"$'\n'"$unscoped"
fi

printf "unscoped %s\n" "${unscoped_reasons[@]}"
node scripts/ci/bg-gates.mjs start <<<"$spec"
status=0
while IFS= read -r id; do
  echo "::group::$id"
  node scripts/ci/bg-gates.mjs wait "$id" || status=1
  echo "::endgroup::"
done < <(sed -E 's/^([a-z-]+)( after [^:]+)?: .*/\1/' <<<"$spec")
node scripts/ci/bg-gates.mjs summary
exit "$status"
