#!/usr/bin/env bash
# Trace which `changes`-job gates a given set of changed paths would flip.
#
# The gate regexes are read straight out of .github/workflows/ci.yml rather
# than copied here, so this can't drift from what CI actually evaluates: it
# greps the `NAME_RE='...'` assignments and evals them, then replays the same
# infra-carve-out + set_gate logic the workflow runs.
#
# Usage:
#   scripts/ci/gate-trace.sh path [path...]
#   printf '%s\n' path1 path2 | scripts/ci/gate-trace.sh
set -euo pipefail

workflow="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.github/workflows/ci.yml"

# The gate regexes this script replays. Both directions are checked against
# ci.yml so the script fails loudly instead of quietly tracing a stale model:
# a name that disappears from ci.yml, and a new `*_RE` gate added to ci.yml
# that this script doesn't yet report.
names='INFRA_RE|INFRA_CARVEOUT_RE|AR_PKGS_RE|AP_PKGS_RE|AV_PKGS_RE|RACK_PKGS_RE|TRAILTIES_PKGS_RE|TRAILS_TSC_PKGS_RE|TSE_COMPILER_PKGS_RE|UNIT_TESTS_PKGS_RE|GUIDES_PKGS_RE|WEBSITE_PKGS_RE|COMPARISON_RE'
declared=$(grep -oE "^ +[A-Z_]+_RE='" "$workflow" | tr -d " ='" | sort -u)
expected=$(echo "$names" | tr '|' '\n' | sort)
drift=$(comm -3 <(echo "$declared") <(echo "$expected"))
if [ -n "$drift" ]; then
  echo "gate-trace: out of sync with $workflow (left = only in ci.yml, right = only in this script):" >&2
  echo "$drift" >&2
  exit 1
fi
eval "$(grep -E "^ +($names)='" "$workflow")"

if [ "$#" -gt 0 ]; then
  files=$(printf '%s\n' "$@")
else
  files=$(cat)
fi

infra_files=$(echo "$files" | grep -vE "$INFRA_CARVEOUT_RE" || true)
comparison_files=$(echo "$files" | grep -vE '^packages/website/' || true)

report() {
  local name="$1" re="$2" subject="${3:-$files}"
  if echo "$infra_files" | grep -qE "$INFRA_RE" || echo "$subject" | grep -qE "$re"; then
    echo "${name}=true"
  else
    echo "${name}=false"
  fi
}

report activerecord_affected "$AR_PKGS_RE"
report actionpack_affected "$AP_PKGS_RE"
report actionview_affected "$AV_PKGS_RE"
report rack_affected "$RACK_PKGS_RE"
report trailties_affected "$TRAILTIES_PKGS_RE"
report trails_tsc_affected "$TRAILS_TSC_PKGS_RE"
report tse_compiler_affected "$TSE_COMPILER_PKGS_RE"
report unit_tests_affected "$UNIT_TESTS_PKGS_RE"
report guides_affected "$GUIDES_PKGS_RE"
report website_affected "$WEBSITE_PKGS_RE"
report comparison_affected "$COMPARISON_RE" "$comparison_files"
