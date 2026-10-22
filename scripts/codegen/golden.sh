#!/usr/bin/env bash
# Golden-output harness for the generator: regenerate every target gem and
# compare its output with a snapshot, so a refactor of the generator can be
# shown to change nothing (or exactly what it means to).
#
#   scripts/codegen/golden.sh update   # regenerate all, snapshot to .golden/
#   scripts/codegen/golden.sh check    # regenerate all, diff against .golden/
#   scripts/codegen/golden.sh check activejob builder   # only these gems
#
# The snapshot (scripts/codegen/.golden/<gem>/) is local and gitignored. Each
# gem regenerates in parallel; it has its own IR dir, oracle and codegen-out.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GOLDEN="$ROOT/scripts/codegen/.golden"
LOGS="${TMPDIR:-/tmp}/codegen-golden-$$"
mkdir -p "$LOGS"

mode="${1:-check}"
shift || true
[[ "$mode" == update || "$mode" == check ]] || { echo "usage: $0 update|check [gem…]" >&2; exit 2; }

declare -A PKG=(
  [activejob]=activejob
  [mini_magick]=mini-magick
  [builder]=builder
  [image_processing]=image-processing
)
# The test files each gem's run ports (`--tests`, relative to its test dir).
declare -A TESTS=(
  [activejob]="cases/adapter_test.rb,cases/argument_serialization_test.rb,cases/async_adapter_test.rb,cases/callbacks_test.rb,cases/enqueue_after_transaction_commit_test.rb,cases/exceptions_test.rb,cases/instrumentation_test.rb,cases/job_serialization_test.rb,cases/logging_test.rb,cases/queue_adapter_test.rb,cases/queue_naming_test.rb,cases/queue_priority_test.rb,cases/queuing_test.rb,cases/rescue_test.rb,cases/serializers_test.rb,cases/test_case_test.rb,cases/test_helper_test.rb,cases/timezones_test.rb,cases/translation_test.rb"
  [mini_magick]="lib/mini_magick_spec.rb,lib/mini_magick/image_spec.rb,lib/mini_magick/shell_spec.rb,lib/mini_magick/tool_spec.rb,lib/mini_magick/utilities_spec.rb"
  [builder]="test_markupbuilder.rb,test_eventbuilder.rb,test_xchar.rb,test_namecollision.rb,test_method_caching.rb"
  [image_processing]="builder_test.rb,mini_magick_test.rb,pipeline_test.rb,vips_test.rb"
)

gems=("$@")
[[ ${#gems[@]} -eq 0 ]] && gems=(activejob mini_magick builder image_processing)

for g in "${gems[@]}"; do
  [[ -n "${PKG[$g]:-}" ]] || { echo "unknown gem: $g" >&2; exit 2; }
  (
    cd "$ROOT" &&
      CODEGEN_GEM="$g" pnpm --silent tsx scripts/codegen/src/cli.ts --tests "${TESTS[$g]}" \
        >"$LOGS/$g.log" 2>&1
  ) &
done
wait

status=0
for g in "${gems[@]}"; do
  out="$ROOT/packages/${PKG[$g]}/codegen-out/src"
  summary=$(grep -E '^\{"rubyFiles' "$LOGS/$g.log" || echo "(no summary: see $LOGS/$g.log)")
  if [[ ! -d "$out" ]]; then
    echo "$g: no output — see $LOGS/$g.log"
    status=1
    continue
  fi
  if [[ "$mode" == update ]]; then
    rm -rf "${GOLDEN:?}/$g"
    mkdir -p "$GOLDEN/$g"
    cp -r "$out/." "$GOLDEN/$g/"
    echo "$g: snapshot updated  $summary"
  elif [[ ! -d "$GOLDEN/$g" ]]; then
    echo "$g: no snapshot — run '$0 update' first"
    status=1
  elif diff -r -q "$GOLDEN/$g" "$out" >/dev/null; then
    echo "$g: unchanged  $summary"
  else
    n=$(diff -r "$GOLDEN/$g" "$out" | grep -c '^[<>]')
    echo "$g: CHANGED ($n lines)  $summary"
    diff -r -u "$GOLDEN/$g" "$out" >"$LOGS/$g.diff"
    echo "  diff: $LOGS/$g.diff"
    status=1
  fi
done
exit $status
