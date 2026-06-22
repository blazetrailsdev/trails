#!/usr/bin/env node
// THROWAWAY INSTRUMENTATION companion — aggregate the per-worker DDL-profile
// JSON dumps (written by test-helpers/ddl-profile.ts, collected as CI
// artifacts) into a single summary. Usage:
//   node scripts/ddl-profile-aggregate.mjs <dir-of-json> [<dir2> ...]
import fs from "node:fs";
import path from "node:path";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("usage: ddl-profile-aggregate.mjs <dir> [<dir> ...]");
  process.exit(1);
}

const files = [];
for (const d of dirs) {
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith(".json")) files.push(path.join(d, f));
  }
}

// Group worker dumps by adapter.
const byAdapter = {};
for (const f of files) {
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const adapter = data.adapter ?? "unknown";
  (byAdapter[adapter] ??= []).push(data);
}

const fmt = (n) => Number(n).toFixed(1);

for (const [adapter, dumps] of Object.entries(byAdapter)) {
  const byOp = {};
  const byTable = {};
  const byFile = {};
  let totalMs = 0;
  let totalCount = 0;
  const bump = (bucket, key, ms) => {
    const a = (bucket[key] ??= { count: 0, ms: 0 });
    a.count += 1;
    a.ms += ms;
  };
  for (const d of dumps) {
    for (const r of d.records ?? []) {
      totalMs += r.ms;
      totalCount += 1;
      bump(byOp, r.op, r.ms);
      bump(byTable, `${r.op} ${r.table ?? "?"}`, r.ms);
      bump(byFile, r.file, r.ms);
    }
  }
  const top = (bucket, n) =>
    Object.entries(bucket)
      .sort((a, b) => b[1].ms - a[1].ms)
      .slice(0, n);

  console.log(`\n================ ${adapter} (${dumps.length} worker dumps) ================`);
  console.log(`Total DDL ops: ${totalCount}   Total DDL ms: ${fmt(totalMs)}`);
  console.log(`\nBy op type:`);
  for (const [k, v] of top(byOp, 20))
    console.log(
      `  ${k.padEnd(22)} count=${String(v.count).padStart(6)}  ms=${fmt(v.ms).padStart(10)}`,
    );
  console.log(`\nTop 15 op+table by ms:`);
  for (const [k, v] of top(byTable, 15))
    console.log(
      `  ${k.padEnd(40)} count=${String(v.count).padStart(6)}  ms=${fmt(v.ms).padStart(10)}`,
    );
  console.log(`\nTop 15 files by DDL ms:`);
  for (const [k, v] of top(byFile, 15))
    console.log(
      `  ${k.padEnd(60)} count=${String(v.count).padStart(6)}  ms=${fmt(v.ms).padStart(10)}`,
    );
}
