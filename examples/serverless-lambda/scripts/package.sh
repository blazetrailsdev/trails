#!/usr/bin/env bash
# Stage what /var/task needs and zip it to build/lambda.zip.
set -euo pipefail
cd "$(dirname "$0")/.."
P=build/pkg
rm -rf build; mkdir -p "$P/node_modules"
cp dist/handler.mjs "$P/"
# The only external: libxml2-wasm's top-level await breaks esbuild's lazy module init.
cp -rL node_modules/libxml2-wasm "$P/node_modules/"
# Rails' path checks, the template resolver and the .tse source reads still touch these.
cp -r app config "$P/"
[ -f db/spike.sqlite3 ] && { mkdir -p "$P/db"; cp db/spike.sqlite3 "$P/db/"; }
echo '{ "type": "module" }' > "$P/package.json"
(cd "$P" && zip -qr ../lambda.zip .)
ls -la build/lambda.zip
