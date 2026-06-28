#!/usr/bin/env node
// One-schema discovery companion. Reads a vitest JSON report produced by an
// `AR_ONE_SCHEMA=1` run and prints, to stdout, the candidate exclude list: the
// repo-relative path of every test file that had at least one failing test
// under the no-drop constraint (OneSchemaViolation deviations plus any file
// that breaks under truncate-reset). Feed the output into
// eslint/one-schema-exclude.json, then re-run to converge.
//
//   node scripts/ci/one-schema-discovery.mjs <vitest-report.json>
import fs from "node:fs";
import path from "node:path";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: one-schema-discovery.mjs <vitest-report.json>");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const repoRoot = process.cwd();

const failing = new Set();
for (const tr of report.testResults ?? []) {
  // A file-level failure (e.g. a beforeAll OneSchemaViolation) surfaces either
  // as tr.status === "failed" or as failing assertionResults.
  const fileFailed =
    tr.status === "failed" || (tr.assertionResults ?? []).some((a) => a.status === "failed");
  if (!fileFailed) continue;
  const abs = tr.name;
  const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
  failing.add(rel);
}

const sorted = [...failing].sort();
process.stderr.write(`one-schema discovery: ${sorted.length} candidate file(s) to exclude\n`);
process.stdout.write(JSON.stringify(sorted, null, 2) + "\n");
