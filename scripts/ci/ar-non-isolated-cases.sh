#!/usr/bin/env bash
set -uo pipefail

shard="${1:?usage: ar-non-isolated-cases.sh <shard>/<total>}"
report="${RUNNER_TEMP:-$(mktemp -d)}/ar-cases.json"
rm -f "$report"

AR_SPLIT=cases pnpm vitest run packages/activerecord/ --project activerecord \
  --shard="$shard" --reporter=default --reporter=json --outputFile.json="$report" && exit 0

[ -s "$report" ] || exit 1
mapfile -t failed < <(node -e '
  const report = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const file of report.testResults) {
    if (file.status === "failed") console.log(require("node:path").relative(process.cwd(), file.name));
  }
' "$report")
[ "${#failed[@]}" -gt 0 ] || exit 1

echo "Re-running ${#failed[@]} file(s) in isolated forks:"
printf '  %s\n' "${failed[@]}"
pnpm vitest run "${failed[@]}" --project activerecord
