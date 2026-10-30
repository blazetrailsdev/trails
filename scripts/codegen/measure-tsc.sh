#!/usr/bin/env bash
# Typecheck the generated tree and summarize diagnostics by code and by file.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GEM="${CODEGEN_GEM:-activerecord}"
OUT="${1:-$ROOT/packages/$GEM/codegen-out}"
"$ROOT/node_modules/.bin/tsc" -p "$OUT/tsconfig.json" > "$OUT/tsc.txt"
echo "tsc errors: $(grep -c 'error TS' "$OUT/tsc.txt")  syntax(TS1xxx): $(grep -c 'error TS1[0-9][0-9][0-9]:' "$OUT/tsc.txt")"
echo "files with errors: $(grep 'error TS' "$OUT/tsc.txt" | cut -d'(' -f1 | sort -u | wc -l) / $(find "$OUT/src" -name '*.ts' | wc -l)"
grep -o 'error TS[0-9]*' "$OUT/tsc.txt" | sort | uniq -c | sort -rn | head -15
