#!/usr/bin/env node
// Rebuilds scripts/ci/ar-shard-durations.json, the per-file timings
// scripts/ci/duration-sequencer.ts balances the AR adapter shards with.
//
//   node scripts/ci/ar-shard-durations.mjs <run-id>
//
// <run-id> is a green `CI` run on main. Every leg of the SQLite, PostgreSQL
// and MariaDB lanes is read, so each adapter's table covers every file once.
// A file vitest reports with no time (a skipped file) is recorded as 0; the
// sequencer adds its per-file overhead to every file either way.
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const OUT = new URL("./ar-shard-durations.json", import.meta.url);
const LANES = {
  sqlite3: /^Active Record SQLite Tests \(\d+\)$/,
  postgresql: /^Active Record PostgreSQL Tests \(\d+\)$/,
  mysql2: /^Active Record MariaDB Tests \(\d+\)$/,
};
// ` ✓  activerecord  packages/activerecord/test/cases/finder.test.ts (261 tests | 1 skipped) 9387ms`
const FILE_LINE =
  /^\S+Z +[✓❯×↓] +\S+ +(packages\/\S+\.test\.ts) \([^)]*\)(?: (\d+(?:\.\d+)?)(ms|s))?\s*$/;

async function gh(args) {
  const { stdout } = await run("gh", args, { maxBuffer: 512 * 1024 * 1024 });
  return stdout;
}

const runId = process.argv[2];
if (!runId) {
  console.error("usage: node scripts/ci/ar-shard-durations.mjs <run-id>");
  process.exit(2);
}

const { jobs } = JSON.parse(await gh(["run", "view", runId, "--json", "jobs"]));
const out = {};
for (const [adapter, pattern] of Object.entries(LANES)) {
  const legs = jobs.filter((job) => pattern.test(job.name));
  if (legs.length === 0) throw new Error(`run ${runId} has no ${adapter} legs`);
  const table = {};
  for (const leg of legs) {
    if (leg.conclusion !== "success") throw new Error(`${leg.name} is ${leg.conclusion}`);
    const log = await gh([
      "api",
      "--allow-escape-sequences",
      `repos/{owner}/{repo}/actions/jobs/${leg.databaseId}/logs`,
    ]);
    for (const raw of log.split("\n")) {
      const match = FILE_LINE.exec(
        raw.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), ""),
      );
      if (!match || match[1].startsWith("packages/activerecord-cli/")) continue;
      const ms = match[2] == null ? 0 : Number(match[2]) * (match[3] === "s" ? 1000 : 1);
      table[match[1]] = Math.round(ms);
    }
  }
  out[adapter] = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)));
  console.log(`${adapter}: ${Object.keys(table).length} files from ${legs.length} legs`);
}

// One line per adapter: the table is data, and a line per file would be
// thousands of diff lines on every refresh.
const body = Object.entries(out)
  .map(([adapter, table]) => `  ${JSON.stringify(adapter)}: ${JSON.stringify(table)}`)
  .join(",\n");
await writeFile(OUT, `{\n${body}\n}\n`);
