#!/usr/bin/env bash
# Put the whole generated tree in as packages/$CODEGEN_GEM/src, keeping the hand
# port's test files and every hand file the generator has no twin for (the
# package entry point, namespace seats). Typecheck the package, tests included,
# run those tests, and restore the hand tree on any exit.
#
#   CODEGEN_GEM=activejob scripts/codegen/swap-tree.sh
#   SWAP_TESTS=rescue CODEGEN_GEM=activejob scripts/codegen/swap-tree.sh   # one test file
#   SWAP_GENERATED_TESTS=1 CODEGEN_GEM=activejob scripts/codegen/swap-tree.sh
#     runs the generated tests (ported from the gem's own) instead of the hand
#     port's, so the gate measures the generated tree on its own terms.
#
# Writes packages/<pkg>/codegen-out/swap-tree-tsc.txt and swap-tree-vitest.txt.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEM="${CODEGEN_GEM:-activerecord}"
PKG="$ROOT/packages/${CODEGEN_PKG:-${GEM//_/-}}"
GEN="$PKG/codegen-out"
[ -d "$PKG/src.hand" ] && { echo "src.hand exists — previous run did not restore; fix by hand" >&2; exit 1; }
restore() {
  if [ -d "$PKG/src.hand" ]; then
    rm -rf "$PKG/src"
    mv "$PKG/src.hand" "$PKG/src"
  fi
}
trap restore EXIT
mv "$PKG/src" "$PKG/src.hand"
cp -r "$GEN/src" "$PKG/src"
kept=()
while IFS= read -r f; do
  if [[ "$f" == *.test.ts ]] && [ -n "${SWAP_GENERATED_TESTS:-}" ]; then
    continue
  fi
  if [[ "$f" == *.test.ts ]] || [ ! -e "$PKG/src/$f" ]; then
    mkdir -p "$PKG/src/$(dirname "$f")"
    cp "$PKG/src.hand/$f" "$PKG/src/$f"
    [[ "$f" == *.test.ts ]] || kept+=("$f")
  fi
done < <(cd "$PKG/src.hand" && find . -name '*.ts' | sed 's#^\./##' | sort)
echo "AJ_ADAPTER=${SWAP_ADAPTER:-inline}  tests: ${SWAP_GENERATED_TESTS:+generated}${SWAP_GENERATED_TESTS:-hand}"
echo "hand files kept (no generated twin): ${kept[*]:-none}"
"$ROOT/node_modules/.bin/tsc" -p "$PKG/tsconfig.json" --noEmit > "$GEN/swap-tree-tsc.txt" 2>&1
echo "tsc errors: $(grep -c 'error TS' "$GEN/swap-tree-tsc.txt")  in tests: $(grep 'error TS' "$GEN/swap-tree-tsc.txt" | grep -c '\.test\.ts')"
# activejob's Rakefile runs the suite once per adapter (AJ_ADAPTER), leaving out a
# file that names another adapter (async, delayed_job): SWAP_ADAPTER picks one.
export AJ_ADAPTER="${SWAP_ADAPTER:-inline}"
mapfile -t tests < <(cd "$ROOT" && find "${PKG#$ROOT/}/src" -name "${SWAP_TESTS:-*}.test.ts" | sort |
  { if [ "$GEM" = activejob ]; then grep -v -e "$( [ "$AJ_ADAPTER" = async ] && echo '^$' || echo async)" -e "$( [ "$AJ_ADAPTER" = delayed_job ] && echo '^$' || echo delayed-job)"; else cat; fi; })
# An empty list would hand vitest no paths, and it would run every project.
[ "${#tests[@]}" -gt 0 ] || { echo "no test files match ${SWAP_TESTS:-*}.test.ts" >&2; exit 1; }
run_vitest() { # <timeout> <test files…>
  local t="$1"
  shift
  (cd "$ROOT" && NO_COLOR=1 timeout "$t" pnpm vitest run --testTimeout 5000 ${SWAP_FILTER:+-t "$SWAP_FILTER"} "$@") 2>&1 | sed 's/\x1b\[[0-9;]*m//g'
  return "${PIPESTATUS[0]}"
}
run_vitest 90 "${tests[@]}" > "$GEN/swap-tree-vitest.txt"
if [ "$?" -eq 124 ]; then
  # A synchronous loop no testTimeout can interrupt (fugit's brute_frequency
  # walks a year of minutes; Ruby takes a minute) stalls the whole run: run each
  # file under its own limit, name those that time out, and sum the rest.
  : > "$GEN/swap-tree-vitest.txt"
  timed_out=()
  for t in "${tests[@]}"; do
    out="$(run_vitest "${SWAP_FILE_TIMEOUT:-120}" "$t")"
    if [ "$?" -ne 124 ]; then
      printf '%s\n' "$out" >> "$GEN/swap-tree-vitest.txt"
      continue
    fi
    # …and a file that times out, one second-level `describe` at a time.
    outer="$(grep -m1 -oP '^describe\("\K[^"]+' "$ROOT/$t")"
    while IFS= read -r inner; do
      pat="$(printf '%s %s ' "$outer" "$inner" | sed 's/[][\.*^$?+(){}|]/\\&/g')"
      out="$(SWAP_FILTER="$pat" run_vitest "${SWAP_FILE_TIMEOUT:-120}" "$t")"
      [ "$?" -eq 124 ] && timed_out+=("$t > $inner")
      printf '%s\n' "$out" | grep -v "skipped (" >> "$GEN/swap-tree-vitest.txt"
      printf '%s\n' "$out" | grep -E "^ *Tests  " | sed -E 's/(\| )?[0-9]+ skipped//' >> "$GEN/swap-tree-vitest.txt"
    done < <(grep -oP '^  describe\("\K[^"]+' "$ROOT/$t")
  done
  awk -v to="${#timed_out[@]}" '
    /^ *Tests  / { for (i = 1; i <= NF; i++) { if ($(i+1) ~ /^(failed|passed|skipped)/) c[$(i+1)] += $i } }
    END {
      n = c["failed"] + c["passed"] + c["skipped"]
      printf "      Tests  %d failed | %d passed | %d skipped (%d)  (%d file(s) timed out)\n", c["failed"], c["passed"], c["skipped"], n, to
    }' "$GEN/swap-tree-vitest.txt" >> "$GEN/swap-tree-vitest.txt"
  grep -E "Tests  .*timed out" "$GEN/swap-tree-vitest.txt" | tail -1
  [ "${#timed_out[@]}" -gt 0 ] && echo "timed out: ${timed_out[*]}" | tee -a "$GEN/swap-tree-vitest.txt"
  exit 0
fi
grep -E "Test Files|Tests  " "$GEN/swap-tree-vitest.txt"
