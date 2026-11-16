#!/usr/bin/env bash
# Trace which `changes`-job gates a given set of changed paths would flip.
#
# Replays the filter step's gate block verbatim out of .github/workflows/ci.yml
# (the `*_RE` definitions, `is_additive_registration`, and the region from
# `infra_files=$(` through the `scoped-only.sh` call), the same slice
# `gateRunner` in scripts/ci-suite-coverage.test.ts runs, so there is no hand
# copy to drift. `base` / `head` feed the additive-registration narrowing and
# default to origin/main and HEAD.
#
# Usage:
#   scripts/ci/gate-trace.sh path [path...]
#   printf '%s\n' path1 path2 | scripts/ci/gate-trace.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
workflow="$root/.github/workflows/ci.yml"

block=$(sed -E 's/^[[:space:]]+//' "$workflow" | awk '
  /^[A-Z_]+_RE=\x27/ { defs = defs $0 "\n" }
  /^is_additive_registration\(\)/ { infn = 1 }
  infn { fn = fn $0 "\n"; if ($0 == "}") infn = 0 }
  /^infra_files=\$\(/ { ingate = 1 }
  ingate { gate = gate $0 "\n"; if ($0 ~ /^bash scripts\/ci\/scoped-only\.sh/) ingate = 0 }
  END {
    if (fn == "" || gate == "") exit 1
    printf "%s%s%s", defs, fn, gate
  }') || { echo "gate-trace: no gate block found in $workflow" >&2; exit 1; }

if [ "$#" -gt 0 ]; then
  files=$(printf '%s\n' "$@")
else
  files=$(cat)
fi

GITHUB_OUTPUT=$(mktemp)
trap 'rm -f "$GITHUB_OUTPUT"' EXIT
base="${GATE_TRACE_BASE:-origin/main}"
head="${GATE_TRACE_HEAD:-HEAD}"
cd "$root"
eval "$block" >/dev/null
cat "$GITHUB_OUTPUT"
