#!/usr/bin/env node
// Rebuilds scripts/ci/ar-shard-durations.json, the per-file timings
// scripts/ci/duration-sequencer.ts balances the AR adapter shards with.
//
//   node scripts/ci/ar-shard-durations.mjs <run-id>...
//   node scripts/ci/ar-shard-durations.mjs --latest <n>
//
// Each <run-id> is a green `CI` run on main; `--latest <n>` takes the n most
// recent ones, newest first. A table holds only the files the newest run
// reports, so a deleted or renamed file drops out. A file's time is the
// median of its timed samples, so one slow hosted runner (about ±25% between
// jobs, trails#10272) does not skew it. Every leg of the SQLite, PostgreSQL,
// MariaDB and numbered Trailties lanes is read, so each table covers every
// file once.
// A file vitest reports with no time (a skipped file) is recorded as 0, and
// a 0 sample counts only when every sample is 0; the sequencer adds its
// per-file overhead to every file either way.
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);
const OUT = new URL("./ar-shard-durations.json", import.meta.url);
const LANES = {
  sqlite3: /^Active Record SQLite Tests \(\d+\)$/,
  postgresql: /^Active Record PostgreSQL Tests \(\d+\)$/,
  mysql2: /^Active Record MariaDB Tests \(\d+\)$/,
  trailties: /^Trailties Tests \(\d+\)$/,
};
// ` ✓  activerecord  packages/activerecord/test/cases/finder.test.ts (261 tests | 1 skipped) 9387ms`
const FILE_LINE =
  /^\S+Z +[✓❯×↓] +\S+ +(packages\/\S+\.test\.ts) \([^)]*\)(?: (\d+(?:\.\d+)?)(ms|s))?\s*$/;

async function gh(args) {
  const { stdout } = await run("gh", args, { maxBuffer: 512 * 1024 * 1024 });
  return stdout;
}

const args = process.argv.slice(2);
let runIds = args;
if (args[0] === "--latest") {
  const n = Number(args[1]);
  if (!(n > 0)) throw new Error("--latest takes a positive count");
  const runs = JSON.parse(
    await gh([
      "run",
      "list",
      "-w",
      "ci.yml",
      "-b",
      "main",
      "-s",
      "success",
      "-e",
      "push",
      "-L",
      String(n),
      "--json",
      "databaseId",
    ]),
  );
  runIds = runs.map((r) => String(r.databaseId));
}
if (runIds.length === 0) {
  console.error("usage: node scripts/ci/ar-shard-durations.mjs <run-id>... | --latest <n>");
  process.exit(2);
}

const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const samples = {};
const newest = {};
for (const runId of runIds) {
  const { jobs } = JSON.parse(await gh(["run", "view", runId, "--json", "jobs"]));
  for (const [adapter, table] of Object.entries(await readRun(runId, jobs))) {
    samples[adapter] ??= {};
    newest[adapter] ??= new Set(Object.keys(table));
    for (const [file, ms] of Object.entries(table)) (samples[adapter][file] ??= []).push(ms);
  }
}
const out = {};
for (const adapter of Object.keys(LANES)) {
  const table = Object.fromEntries(
    Object.entries(samples[adapter])
      .filter(([file]) => newest[adapter].has(file))
      .map(([file, times]) => {
        const timed = times.filter((ms) => ms > 0);
        return [file, timed.length > 0 ? median(timed) : 0];
      }),
  );
  out[adapter] = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : 1)));
  console.log(`${adapter}: ${Object.keys(table).length} files from ${runIds.length} runs`);
}

async function readRun(runId, jobs) {
  const tables = {};
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
    tables[adapter] = table;
  }
  return tables;
}

// One line per adapter: the table is data, and a line per file would be
// thousands of diff lines on every refresh.
const body = Object.entries(out)
  .map(([adapter, table]) => `  ${JSON.stringify(adapter)}: ${JSON.stringify(table)}`)
  .join(",\n");
await writeFile(OUT, `{\n${body}\n}\n`);
