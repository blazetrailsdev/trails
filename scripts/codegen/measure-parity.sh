#!/usr/bin/env bash
# Swap the generated tree in as packages/activerecord/src, run parity:api
# (with --calls) for activerecord, save the outputs, and restore the hand tree.
# The hand tree is restored on any exit.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEM="${CODEGEN_GEM:-activerecord}"
PKG="$ROOT/packages/$GEM"
GEN="$PKG/codegen-out"
MODE="${1:-gen}"
OUTDIR="$GEN/parity-$MODE"
[ -d "$PKG/src.hand" ] && { echo "src.hand exists — previous run did not restore; fix by hand" >&2; exit 1; }
restore() {
  if [ -d "$PKG/src.hand" ]; then
    rm -rf "$GEN/src" && mv "$PKG/src" "$GEN/src"
    mv "$PKG/src.hand" "$PKG/src"
  fi
}
cd "$ROOT"
if [ "$MODE" = gen ]; then
  trap restore EXIT
  mv "$PKG/src" "$PKG/src.hand"
  mv "$GEN/src" "$PKG/src"
fi
API_COMPARE_FORCE=1 API_COMPARE_ALLOW_STALE_BUILD=1 pnpm parity:api --package "$GEM" --calls > "$GEN/parity.log" 2>&1
status=$?
# The @inlinedFrom gate (RFC 0188) reads the pairs compare.ts just wrote, so it
# runs while the generated tree is still in place.
pnpm parity:api:inlined > "$GEN/inlined.log" 2>&1
inlined_status=$?
restore
trap - EXIT
mkdir -p "$OUTDIR"
cp scripts/api-compare/output/api-comparison.json "$OUTDIR/"
cp scripts/api-compare/output/call-mismatches.json scripts/api-compare/output/call-arg-mismatches.json scripts/api-compare/output/call-skeletons.json "$OUTDIR/" 2>/dev/null
cp scripts/api-compare/output/param-name-mismatches.json "$OUTDIR/" 2>/dev/null
node -e '
const t=require(require("path").resolve(process.argv[1])); const ar=t.packages[process.argv[3]];
require("fs").writeFileSync(process.argv[2], JSON.stringify(ar));' scripts/api-compare/output/ts-api.json "$OUTDIR/ts-api-$GEM.json" "$GEM"
cp "$GEN/parity.log" "$OUTDIR/parity.log"
grep -E "Overall|Parameter names|Option keys|Literals" "$GEN/parity.log"
echo "parity:api exit=$status"
tail -3 "$GEN/inlined.log"
echo "parity:api:inlined exit=$inlined_status"
