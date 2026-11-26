#!/usr/bin/env bash
set -uo pipefail

shard="${1:?usage: ar-non-isolated-cases.sh <shard>/<total>}"
report="${RUNNER_TEMP:-$(mktemp -d)}/ar-cases.json"
rm -f "$report"

AR_SPLIT=cases pnpm vitest run packages/activerecord/ --project activerecord \
  --shard="$shard" --reporter=default --reporter=json --outputFile.json="$report"
status=$?
[ "$status" -eq 0 ] && exit 0

if [ ! -s "$report" ]; then
  echo "vitest exit was $status and it wrote no report" >&2
  exit 1
fi
mapfile -t failed < <(node -e '
  const report = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
  for (const file of report.testResults) {
    if (file.status === "failed") console.log(require("node:path").relative(process.cwd(), file.name));
  }
' "$report")
if [ "${#failed[@]}" -eq 0 ]; then
  echo "report had no failed files; vitest exit was $status" >&2
  exit 1
fi

echo "Re-running ${#failed[@]} file(s) in isolated forks:"
printf '  %s\n' "${failed[@]}"
printf '::warning title=AR non-isolated re-run::%s\n' "${failed[@]}"
pnpm vitest run "${failed[@]}" --project activerecord
