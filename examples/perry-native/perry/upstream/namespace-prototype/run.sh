#!/usr/bin/env bash
# Perry bug: a module namespace object's [[Prototype]] is not null.
#   PERRY=/path/to/perry ./run.sh
set -uo pipefail
cd "$(dirname "$0")"
PERRY="${PERRY:-perry}"
echo "--- node ---";  node probe.js
echo "--- perry ---"
"$PERRY" compile probe.js -o /tmp/perry-ns-proto >/dev/null 2>&1 || { echo "compile failed"; exit 1; }
timeout 60 /tmp/perry-ns-proto
