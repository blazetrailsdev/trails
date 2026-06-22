#!/usr/bin/env node
// Reporting-only: turn coverage/coverage-summary.json into a markdown table
// (overall + per-package) and append it to $GITHUB_STEP_SUMMARY so the numbers
// show up in the CI run UI. Never exits non-zero on low coverage — there is no
// gate. Exits 0 even if the summary file is missing (job stays green).
import { readFileSync, appendFileSync } from "node:fs";

const summaryPath = process.argv[2] ?? "coverage/coverage-summary.json";

let data;
try {
  data = JSON.parse(readFileSync(summaryPath, "utf8"));
} catch {
  console.error(`coverage-summary: no report at ${summaryPath}; skipping summary.`);
  process.exit(0);
}

const pct = (n) => (typeof n === "number" ? `${n.toFixed(2)}%` : "—");

// Aggregate per-package totals from the per-file entries.
const pkgs = new Map();
for (const [file, m] of Object.entries(data)) {
  if (file === "total") continue;
  const match = file.replace(/\\/g, "/").match(/packages\/([^/]+)\//);
  const pkg = match ? match[1] : "(other)";
  const acc = pkgs.get(pkg) ?? { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
  for (const key of ["lines", "branches", "functions"]) {
    acc[key][0] += m[key]?.covered ?? 0;
    acc[key][1] += m[key]?.total ?? 0;
  }
  pkgs.set(pkg, acc);
}

const ratio = ([cov, tot]) => (tot === 0 ? null : (cov / tot) * 100);

const t = data.total;
const lines = [];
lines.push("## Code coverage (reporting-only — no gate)");
lines.push("");
lines.push("| Scope | Lines | Branches | Functions |");
lines.push("| --- | --- | --- | --- |");
lines.push(
  `| **Overall** | ${pct(t.lines.pct)} (${t.lines.covered}/${t.lines.total}) | ${pct(t.branches.pct)} (${t.branches.covered}/${t.branches.total}) | ${pct(t.functions.pct)} (${t.functions.covered}/${t.functions.total}) |`,
);
for (const [pkg, acc] of [...pkgs].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(
    `| ${pkg} | ${pct(ratio(acc.lines))} (${acc.lines[0]}/${acc.lines[1]}) | ${pct(ratio(acc.branches))} (${acc.branches[0]}/${acc.branches[1]}) | ${pct(ratio(acc.functions))} (${acc.functions[0]}/${acc.functions[1]}) |`,
  );
}
lines.push("");
// The AR sqlite lane scopes coverage to activerecord; the light baseline run
// excludes it. Tailor the footnote to whichever report this is.
const hasAr = pkgs.has("activerecord") || pkgs.has("activerecord-cli");
lines.push(
  hasAr
    ? "_Coverage is collected for reporting only and never fails the build. This report is the activerecord sqlite-lane coverage (RFC 0028); the light-package baseline is reported separately by the Coverage job._"
    : "_Coverage is collected for reporting only and never fails the build. activerecord / activerecord-cli are excluded from this baseline (collected separately on the sqlite lane)._",
);

const out = lines.join("\n") + "\n";
console.log(out);

const stepSummary = process.env.GITHUB_STEP_SUMMARY;
if (stepSummary) appendFileSync(stepSummary, out);
