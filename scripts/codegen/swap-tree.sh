#!/usr/bin/env bash
# Put the whole generated tree in as packages/$CODEGEN_GEM/src, keeping the hand
# port's test files and every hand file the generator has no twin for (the
# package entry point, namespace seats). Typecheck the package, tests included,
# run those tests, and restore the hand tree on any exit.
#
#   CODEGEN_GEM=activejob scripts/codegen/swap-tree.sh
#   SWAP_TESTS=rescue CODEGEN_GEM=activejob scripts/codegen/swap-tree.sh   # one test file
#
# Writes packages/$GEM/codegen-out/swap-tree-tsc.txt and swap-tree-vitest.txt.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEM="${CODEGEN_GEM:-activerecord}"
PKG="$ROOT/packages/$GEM"
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
  if [[ "$f" == *.test.ts ]] || [ ! -e "$PKG/src/$f" ]; then
    mkdir -p "$PKG/src/$(dirname "$f")"
    cp "$PKG/src.hand/$f" "$PKG/src/$f"
    [[ "$f" == *.test.ts ]] || kept+=("$f")
  fi
done < <(cd "$PKG/src.hand" && find . -name '*.ts' | sed 's#^\./##' | sort)
echo "AJ_ADAPTER=${SWAP_ADAPTER:-inline}"
echo "hand files kept (no generated twin): ${kept[*]:-none}"
"$ROOT/node_modules/.bin/tsc" -p "$PKG/tsconfig.json" --noEmit > "$GEN/swap-tree-tsc.txt" 2>&1
echo "tsc errors: $(grep -c 'error TS' "$GEN/swap-tree-tsc.txt")  in tests: $(grep 'error TS' "$GEN/swap-tree-tsc.txt" | grep -c '\.test\.ts')"
# activejob's Rakefile runs the suite once per adapter (AJ_ADAPTER), leaving out a
# file that names another adapter (async, delayed_job): SWAP_ADAPTER picks one.
export AJ_ADAPTER="${SWAP_ADAPTER:-inline}"
mapfile -t tests < <(cd "$ROOT" && find "packages/$GEM/src" -name "${SWAP_TESTS:-*}.test.ts" | sort |
  { if [ "$GEM" = activejob ]; then grep -v -e "$( [ "$AJ_ADAPTER" = async ] && echo '^$' || echo async)" -e "$( [ "$AJ_ADAPTER" = delayed_job ] && echo '^$' || echo delayed-job)"; else cat; fi; })
# An empty list would hand vitest no paths, and it would run every project.
[ "${#tests[@]}" -gt 0 ] || { echo "no test files match ${SWAP_TESTS:-*}.test.ts" >&2; exit 1; }
(cd "$ROOT" && NO_COLOR=1 timeout 90 pnpm vitest run --testTimeout 5000 ${SWAP_FILTER:+-t "$SWAP_FILTER"} "${tests[@]}") 2>&1 | sed 's/\x1b\[[0-9;]*m//g' > "$GEN/swap-tree-vitest.txt"
grep -E "Test Files|Tests  " "$GEN/swap-tree-vitest.txt"
