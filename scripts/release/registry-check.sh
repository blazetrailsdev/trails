#!/usr/bin/env bash
# Checks a version just published to npm from a clean directory: the README's
# `npm-new` block generates and installs an app, and a fresh project installing
# activerecord and actionpack holds one copy of each runtime-shared singleton.
# Usage: scripts/release/registry-check.sh <version>
set -euo pipefail

VERSION=${1:?usage: registry-check.sh <version>}
TRAILS=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "registry-check $VERSION: $*" >&2
  exit 1
}

for _ in $(seq 1 30); do
  npm view "@blazetrails/trailties@$VERSION" version >/dev/null 2>&1 && break
  sleep 10
done
npm view "@blazetrails/trailties@$VERSION" version >/dev/null || fail "not on the registry"

block=$(awk '
  /<!-- #region npm-new -->/ { on = 1; next }
  /<!-- #endregion npm-new -->/ { exit }
  on && /^```sh$/ { inside = 1; next }
  on && inside && /^```$/ { inside = 0; next }
  on && inside { print }
' "$TRAILS/README.md")
[ -n "$block" ] || fail "README.md has no npm-new block"

echo "== README npm-new"
(cd "$WORK" && bash -euo pipefail -c "${block//@alpha/@$VERSION}") || fail "trails new / pnpm install failed"

echo "== single copy of shared singletons"
mkdir "$WORK/singletons"
cd "$WORK/singletons"
echo '{ "name": "singletons", "private": true }' >package.json
pnpm add "@blazetrails/activerecord@$VERSION" "@blazetrails/actionpack@$VERSION"
for name in ruby-compat activesupport; do
  pnpm why "@blazetrails/$name" --depth Infinity
  copies=$(find node_modules/.pnpm -maxdepth 1 -name "@blazetrails+$name@*" | wc -l)
  [ "$copies" -eq 1 ] || fail "@blazetrails/$name installed $copies times"
done
echo "registry-check $VERSION: ok"
