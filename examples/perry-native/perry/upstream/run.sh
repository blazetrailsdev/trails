#!/usr/bin/env bash
# Perry bug: `importedClassExpression.prototype` reads undefined.
#   PERRY=/path/to/perry ./run.sh
set -uo pipefail
cd "$(dirname "$0")"
PERRY="${PERRY:-perry}"
echo "--- node ---"; node b.js
echo "--- perry ---"
"$PERRY" compile b.js -o /tmp/perry-proto-repro >/dev/null 2>&1 || { echo "compile failed"; exit 1; }
/tmp/perry-proto-repro
