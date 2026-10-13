#!/usr/bin/env bash
# Build a dist-only install of this app, the shape a real trails app has.
#
#   ./perry/dist-tree.sh [dest]        # default: tmp/dist-tree
#
# Why this exists: the example resolves `@blazetrails/*` through pnpm
# workspace symlinks, so the packages' TypeScript `src/` is visible and Perry
# prefers it — which is what trips the shape-mint abort (FINDINGS.md, 3b).
# Published trails packages ship `dist` JS only, so a dist-only tree is both
# the realistic deployment shape and the one that avoids 3b.
#
# Three things here are load-bearing, each found by getting them wrong first:
#   * EVERY @blazetrails package is copied, not just this app's direct
#     dependencies — activesupport pulls i18n, nokogiri and others
#     transitively, and a missing one fails at resolution.
#   * Each package's nested `node_modules` is recreated with its
#     non-@blazetrails deps linked individually and `@blazetrails` pointed at
#     the single copy set. Linking a package's whole nested tree instead lets
#     `@blazetrails/*` resolve back to the workspace, which both reintroduces
#     `src/` and loads some packages twice — the second instance re-runs
#     top-level `Object.defineProperty(..., Symbol.hasInstance, ...)` and
#     throws "Cannot redefine property".
#   * Node 24+; the framework uses a regex with duplicate named capture
#     groups, which is a SyntaxError on Node 20.
set -uo pipefail
cd "$(dirname "$0")/.."
APP=$PWD
ROOT=$(cd ../.. && pwd)
DEST=${1:-$APP/tmp/dist-tree}

rm -rf "$DEST"; mkdir -p "$DEST/node_modules/@blazetrails"
for d in app config db public lib perry .trails; do
  [ -e "$APP/$d" ] && cp -r "$APP/$d" "$DEST/"
done
cp "$APP/package.json" "$APP/tsconfig.json" "$APP/config.ts" "$DEST/" 2>/dev/null

# npm dependencies: absolute symlinks, so the tree can live anywhere.
for p in "$APP"/node_modules/*; do
  n=$(basename "$p"); [ "$n" = "@blazetrails" ] && continue
  ln -sfn "$(readlink -f "$p")" "$DEST/node_modules/$n"
done

# Every @blazetrails package, dist only.
declare -A SRCDIR=()
for d in "$ROOT"/packages/*/; do
  [ -f "$d/package.json" ] || continue
  name=$(node -e "process.stdout.write(require('$d/package.json').name||'')" 2>/dev/null)
  case "$name" in @blazetrails/*) ;; *) continue;; esac
  short=${name#@blazetrails/}
  [ -d "$d/dist" ] || { echo "skip $short (no dist — run its build)" >&2; continue; }
  tgt="$DEST/node_modules/@blazetrails/$short"
  mkdir -p "$tgt"; cp "$d/package.json" "$tgt/"; cp -r "$d/dist" "$tgt/dist"
  SRCDIR[$short]=$d
done

# Nested deps, with @blazetrails redirected to the single copy set.
for short in "${!SRCDIR[@]}"; do
  src=${SRCDIR[$short]}; tgt="$DEST/node_modules/@blazetrails/$short"
  [ -d "$src/node_modules" ] || continue
  mkdir -p "$tgt/node_modules"
  for d in "$src"/node_modules/*; do
    dn=$(basename "$d")
    if [ "$dn" = "@blazetrails" ]; then
      ln -sfn "$DEST/node_modules/@blazetrails" "$tgt/node_modules/@blazetrails"
    else
      ln -sfn "$(readlink -f "$d")" "$tgt/node_modules/$dn"
    fi
  done
done

echo "dist-only tree: $DEST"
echo "  @blazetrails packages: $(ls "$DEST/node_modules/@blazetrails" | wc -l)"
echo "  stray src/ dirs (must be 0): $(find "$DEST/node_modules/@blazetrails" -maxdepth 2 -name src -type d | wc -l)"
echo
echo "verify under Node first:  (cd $DEST && TRAILS_ENV=development tsx perry/ladder/07-boot.ts)"
