#!/usr/bin/env bash
# Generate, typecheck, run parity, summarize; append one JSON line to
# scripts/codegen/measurements.jsonl tagged with $1 (a short step label).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
LABEL="${1:-unlabeled}"
GEM="${CODEGEN_GEM:-activerecord}"
GEN=packages/$GEM/codegen-out
mkdir -p "$GEN"
pnpm tsx scripts/codegen/src/cli.ts ${CODEGEN_ARGS:-} > "$GEN/cli.log" 2>&1 || { tail -20 "$GEN/cli.log"; exit 1; }
scripts/codegen/measure-tsc.sh > "$GEN/tsc-summary.txt"
scripts/codegen/measure-parity.sh gen > /dev/null
node -e '
const fs=require("fs");
const label=process.argv[1];
const gen=process.argv[2];
const rep=JSON.parse(fs.readFileSync(gen+"/report.json"));
const tsc=fs.readFileSync(gen+"/tsc.txt","utf8").split("\n").filter(l=>l.includes("error TS"));
const files=new Set(tsc.map(l=>l.split("(")[0]));
const sum=JSON.parse(require("child_process").execSync("pnpm tsx scripts/codegen/src/summary.ts --json").toString());
const row={label, at:new Date().toISOString(), defs:rep.summary.defs, declines:rep.summary.declines, declineReasons:rep.declines,
  tscErrors:tsc.length, tscSyntax:tsc.filter(l=>/error TS1\d{3}:/.test(l)).length, tscFilesWithErrors:files.size,
  stats:rep.stats, wantedRuntimeHelpers:Object.keys(rep.wanted).length, gen:sum.gen, agreement:sum.agreement};
fs.appendFileSync(process.env.CODEGEN_GEM && process.env.CODEGEN_GEM !== "activerecord" ? `scripts/codegen/measurements-${process.env.CODEGEN_GEM}.jsonl` : "scripts/codegen/measurements.jsonl", JSON.stringify(row)+"\n");
console.log(JSON.stringify({label, defs:row.defs, declines:row.declines, tscErrors:row.tscErrors, tscFiles:row.tscFilesWithErrors, ...sum.gen, agreement:sum.agreement}, null, 1));
' "$LABEL" "$GEN"
