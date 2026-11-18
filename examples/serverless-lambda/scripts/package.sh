#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
P=build/pkg
rm -rf build; mkdir -p "$P/node_modules"
cp dist/handler.mjs "$P/"
cp -rL node_modules/libxml2-wasm "$P/node_modules/"
cp -r app config config.ts "$P/"
[ -f db/spike.sqlite3 ] && { mkdir -p "$P/db"; cp db/spike.sqlite3 "$P/db/"; }
echo '{ "type": "module" }' > "$P/package.json"
(cd "$P" && zip -qr ../lambda.zip .)
ls -la build/lambda.zip
