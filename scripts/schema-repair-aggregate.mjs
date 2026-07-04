#!/usr/bin/env node
// Companion to the DDL profiler — aggregate the per-worker schema-repair
// frequency dumps (written by test-helpers/schema-repair.ts, collected as CI
// artifacts alongside the DDL profile) into a single summary. Answers: how
// often does a test file open onto a drifted shared DB and have to
// drop-recreate a canonical table, and which tables drift most? Usage:
//   node scripts/schema-repair-aggregate.mjs <dir-of-json> [<dir2> ...]
import fs from "node:fs";
import path from "node:path";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: schema-repair-aggregate.mjs <dir> [<dir> ...]");
  process.exit(1);
}

const files = [];
for (const d of dirs) {
  for (const f of fs.readdirSync(d)) {
    if (f.startsWith("schema-repair-") && f.endsWith(".json")) files.push(path.join(d, f));
  }
}

if (files.length === 0) {
  console.log("(no schema-repair dumps found)");
  process.exit(0);
}

// Group worker dumps by adapter.
const byAdapter = {};
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const adapter = data.adapter ?? "unknown";
  (byAdapter[adapter] ??= []).push(data);
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

for (const [adapter, dumps] of Object.entries(byAdapter)) {
  let filesSeen = 0;
  let filesRepaired = 0;
  let totalTablesRepaired = 0;
  const byTable = {};
  for (const d of dumps) {
    filesSeen += d.filesSeen ?? 0;
    filesRepaired += d.filesRepaired ?? 0;
    totalTablesRepaired += d.totalTablesRepaired ?? 0;
    for (const [t, c] of Object.entries(d.byTable ?? {})) byTable[t] = (byTable[t] ?? 0) + c;
  }
  const rate = filesSeen > 0 ? filesRepaired / filesSeen : 0;

  console.log(
    `\n============ schema-repair: ${adapter} (${dumps.length} worker dumps) ============`,
  );
  console.log(`Files seen: ${filesSeen}   Files that repaired: ${filesRepaired} (${pct(rate)})`);
  console.log(`Total table repairs: ${totalTablesRepaired}`);
  console.log(`\nBy table (files that had to repair it):`);
  for (const [t, c] of Object.entries(byTable).sort((a, b) => b[1] - a[1]))
    console.log(`  ${t.padEnd(40)} ${String(c).padStart(6)}`);
}
