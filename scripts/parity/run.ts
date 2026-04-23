/**
 * Usage: tsx scripts/parity/run.ts [--side=rails|trails|diff|all]
 *
 * Orchestrates the schema parity pipeline:
 *   rails  — run ruby dump.rb over every fixture → .out/rails/
 *   trails — run node dump.ts over every fixture → .out/trails/
 *   diff   — run diff.ts over .out/rails/ vs .out/trails/
 *   all    — rails + trails in parallel, then diff (default)
 *
 * Must be run from the repo root.
 */

import { readdirSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const FIXTURES_DIR = "scripts/parity/fixtures";
const OUT_RAILS = "scripts/parity/.out/rails";
const OUT_TRAILS = "scripts/parity/.out/trails";
const GEMFILE = "scripts/parity/schema/ruby/Gemfile";
const RUBY_DUMP = "scripts/parity/schema/ruby/dump.rb";
const NODE_DUMP = "scripts/parity/schema/node/dump.ts";
const DIFF_SCRIPT = "scripts/parity/schema/diff.ts";

function assertRepoRoot(): void {
  if (!existsSync(FIXTURES_DIR)) {
    process.stderr.write(`parity run: must be run from repo root (${FIXTURES_DIR} not found)\n`);
    process.exit(1);
  }
}

type Side = "rails" | "trails" | "diff" | "all";

function parseSide(): Side {
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--side=(.+)$/);
    if (m) {
      const s = m[1];
      if (s === "rails" || s === "trails" || s === "diff" || s === "all") return s;
      process.stderr.write(`parity run: unknown --side value: ${s}\n`);
      process.exit(1);
    }
  }
  return "all";
}

function fixtures(): string[] {
  return readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function run(cmd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      env: env ? { ...process.env, ...env } : process.env,
    });
    proc.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const command = [cmd, ...args].join(" ");
      const status = code === null ? `signal ${signal}` : `${code}`;
      reject(new Error(`${command} exited ${status}`));
    });
    proc.on("error", reject);
  });
}

async function runRails(): Promise<void> {
  rmSync(OUT_RAILS, { recursive: true, force: true });
  mkdirSync(OUT_RAILS, { recursive: true });
  // BUNDLE_GEMFILE tells bundler which Gemfile to use when invoked from repo root.
  // BUNDLE_PATH is not forced here — bundler reads it from the .bundle/config
  // written by `bundle install --path vendor/bundle` in the ruby dir (CI) or
  // from the default gem path (local dev with a standard bundle install).
  const bundleEnv = {
    BUNDLE_GEMFILE: GEMFILE,
  };
  for (const fixture of fixtures()) {
    const fixtureDir = join(FIXTURES_DIR, fixture);
    const outFile = join(OUT_RAILS, `${fixture}.json`);
    await run("bundle", ["exec", "ruby", RUBY_DUMP, fixtureDir, outFile], bundleEnv);
  }
}

async function runTrails(): Promise<void> {
  rmSync(OUT_TRAILS, { recursive: true, force: true });
  mkdirSync(OUT_TRAILS, { recursive: true });
  for (const fixture of fixtures()) {
    const fixtureDir = join(FIXTURES_DIR, fixture);
    const outFile = join(OUT_TRAILS, `${fixture}.json`);
    await run("pnpm", ["exec", "tsx", NODE_DUMP, fixtureDir, outFile]);
  }
}

async function runDiff(): Promise<void> {
  for (const dir of [OUT_RAILS, OUT_TRAILS]) {
    if (!existsSync(dir)) {
      process.stderr.write(
        `parity run: ${dir} does not exist — run --side=rails and --side=trails first\n`,
      );
      process.exit(1);
    }
  }
  await run("pnpm", [
    "exec",
    "tsx",
    DIFF_SCRIPT,
    "--rails-dir",
    OUT_RAILS,
    "--trails-dir",
    OUT_TRAILS,
  ]);
}

async function main(): Promise<void> {
  assertRepoRoot();
  const side = parseSide();

  if (side === "rails") {
    await runRails();
  } else if (side === "trails") {
    await runTrails();
  } else if (side === "diff") {
    await runDiff();
  } else {
    // all: rails + trails in parallel — allSettled ensures the other side finishes even if one fails.
    // Within each side, fixtures run serially; a failure in one fixture stops that side.
    const results = await Promise.allSettled([runRails(), runTrails()]);
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    if (errors.length > 0) throw new Error(errors.join("\n"));
    await runDiff();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`parity run: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
