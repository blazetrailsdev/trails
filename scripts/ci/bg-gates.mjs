#!/usr/bin/env node
// Runs a CI job's independent gates concurrently in the background while the
// job's foreground steps keep going, and lets a later step collect each one.
//
// GitHub Actions runs a job's steps strictly in order, so a job made of many
// single-threaded gates leaves most of a 4-vCPU runner idle. More jobs would buy
// the parallelism at the price of a whole runner (and its ~35s of checkout /
// install / build) each, and runners are the scarce resource. This keeps one
// runner and fills its cores instead.
//
//   bg-gates.mjs start   reads a task spec on stdin, launches a detached
//                        scheduler, and returns at once
//   bg-gates.mjs wait ID... prints each task's output once it has finished,
//                        in order, and exits with the first failing status
//   bg-gates.mjs summary prints every task's queued / run time
//
// A spec line is `ID [after DEP,DEP]: COMMAND`, blank lines and `#` comments
// ignored. COMMAND runs under `bash -eo pipefail -c` from the start step's cwd
// and env. A task starts once every DEP has exited 0; a failed DEP marks it
// skipped, which `wait` reports as a failure. Ready tasks start in spec order,
// so list the longest dependency chains first. Background processes survive
// the start step; the runner reaps them only when the job ends.
//
// Concurrency is CI_BG_JOBS, else one less than the available cores, which
// leaves a core for the foreground steps running beside the scheduler.
import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.env.CI_BG_DIR ?? path.join(process.env.RUNNER_TEMP ?? tmpdir(), "ci-bg-gates");
const SPEC_LINE = /^([\w.-]+)(?:\s+after\s+([\w.,-]+))?:\s+(.+)$/;

const statusPath = (id) => path.join(DIR, `${id}.status`);
const logPath = (id) => path.join(DIR, `${id}.log`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseSpec(text) {
  const tasks = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(SPEC_LINE);
    if (!match) throw new Error(`bg-gates: unparseable spec line: ${line}`);
    const [, id, deps, command] = match;
    tasks.push({ id, after: deps ? deps.split(",") : [], command });
  }
  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`bg-gates: duplicate task id ${task.id}`);
    for (const dep of task.after) {
      if (!ids.has(dep))
        throw new Error(`bg-gates: ${task.id} is after ${dep}, which is not listed before it`);
    }
    ids.add(task.id);
  }
  return tasks;
}

function writeStatus(id, status) {
  const tmp = `${statusPath(id)}.tmp`;
  writeFileSync(tmp, JSON.stringify(status));
  renameSync(tmp, statusPath(id));
}

function readStatus(id) {
  try {
    return JSON.parse(readFileSync(statusPath(id), "utf8"));
  } catch {
    return null;
  }
}

async function schedule() {
  const tasks = JSON.parse(readFileSync(path.join(DIR, "spec.json"), "utf8"));
  const jobs = Number(process.env.CI_BG_JOBS) || Math.max(1, availableParallelism() - 1);
  const t0 = Date.now();
  const outcome = new Map();
  const pending = [...tasks];
  let running = 0;
  let wake = () => {};

  const run = (task) => {
    running++;
    const started = Date.now();
    const fd = openSync(logPath(task.id), "w");
    const child = spawn("bash", ["-eo", "pipefail", "-c", task.command], {
      stdio: ["ignore", fd, fd],
    });
    const finish = (code) => {
      closeSync(fd);
      outcome.set(task.id, code === 0);
      writeStatus(task.id, {
        code,
        queued: (started - t0) / 1000,
        seconds: (Date.now() - started) / 1000,
      });
      running--;
      wake();
    };
    child.on("error", () => finish(127));
    child.on("exit", (code, signal) => finish(code ?? (signal ? 128 : 1)));
  };

  while (pending.length > 0) {
    for (let i = 0; i < pending.length && running < jobs; ) {
      const task = pending[i];
      const failed = task.after.find((dep) => outcome.get(dep) === false);
      if (failed) {
        pending.splice(i, 1);
        outcome.set(task.id, false);
        writeFileSync(logPath(task.id), "");
        writeStatus(task.id, { code: 1, skipped: failed, queued: 0, seconds: 0 });
        i = 0;
        continue;
      }
      if (task.after.every((dep) => outcome.get(dep) === true)) {
        pending.splice(i, 1);
        run(task);
        continue;
      }
      i++;
    }
    if (pending.length > 0) await new Promise((resolve) => (wake = resolve));
  }
}

function start(specText) {
  const tasks = parseSpec(specText);
  mkdirSync(DIR, { recursive: true });
  for (const name of readdirSync(DIR)) {
    if (name.endsWith(".status") || name.endsWith(".log"))
      throw new Error(`bg-gates: ${DIR} already holds a run`);
  }
  writeFileSync(path.join(DIR, "spec.json"), JSON.stringify(tasks));
  const out = openSync(path.join(DIR, "scheduler.log"), "w");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "schedule"], {
    detached: true,
    stdio: ["ignore", out, out],
  });
  writeFileSync(path.join(DIR, "scheduler.pid"), String(child.pid));
  child.unref();
  for (const task of tasks) {
    console.log(
      `${task.id}${task.after.length ? ` (after ${task.after.join(", ")})` : ""}: ${task.command}`,
    );
  }
}

function schedulerAlive() {
  try {
    process.kill(Number(readFileSync(path.join(DIR, "scheduler.pid"), "utf8")), 0);
    return true;
  } catch {
    return false;
  }
}

async function wait(id) {
  const tasks = JSON.parse(readFileSync(path.join(DIR, "spec.json"), "utf8"));
  if (!tasks.some((task) => task.id === id)) throw new Error(`bg-gates: no task ${id} in the spec`);
  const waited = Date.now();
  let status;
  while ((status = readStatus(id)) === null) {
    if (!schedulerAlive() && readStatus(id) === null) {
      process.stdout.write(readFileSync(path.join(DIR, "scheduler.log"), "utf8"));
      console.log(`::error title=bg-gates::the scheduler exited before ${id} finished`);
      return 1;
    }
    await sleep(250);
  }
  if (status.skipped) {
    console.log(`::error title=${id} skipped::${id} did not run because ${status.skipped} failed`);
    return 1;
  }
  process.stdout.write(readFileSync(logPath(id), "utf8"));
  console.log(
    `\n[bg-gates] ${id}: exit ${status.code}, ran ${status.seconds.toFixed(1)}s ` +
      `(started ${status.queued.toFixed(1)}s after launch; this step waited ${((Date.now() - waited) / 1000).toFixed(1)}s)`,
  );
  return status.code;
}

function summary() {
  if (!existsSync(path.join(DIR, "spec.json"))) return 0;
  const tasks = JSON.parse(readFileSync(path.join(DIR, "spec.json"), "utf8"));
  console.log("task                          start      ran  exit");
  for (const task of tasks) {
    const status = readStatus(task.id);
    const cell = (n) => (status ? `${n.toFixed(1)}s` : "-").padStart(8);
    const exit = !status
      ? "unfinished"
      : status.skipped
        ? `skipped (${status.skipped})`
        : String(status.code);
    console.log(`${task.id.padEnd(28)}${cell(status?.queued)} ${cell(status?.seconds)}  ${exit}`);
  }
  return 0;
}

async function waitAll(ids) {
  for (const id of ids) {
    const code = await wait(id);
    if (code !== 0) return code;
  }
  return 0;
}

const [command, ...args] = process.argv.slice(2);
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (command === "start") start(readFileSync(0, "utf8"));
  else if (command === "schedule") await schedule();
  else if (command === "wait" && args.length > 0) process.exit(await waitAll(args));
  else if (command === "summary") process.exit(summary());
  else {
    console.error("usage: bg-gates.mjs start < spec | wait ID... | summary");
    process.exit(2);
  }
}
