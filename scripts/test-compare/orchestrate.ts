#!/usr/bin/env -S npx tsx
/**
 * In-process orchestrator for `pnpm test:compare` (driver: run.sh).
 *
 * The pipeline is a small dependency DAG:
 *
 *   fetch ──┬─> ruby-extract ─┬─> compare   (needs both extracts)
 *           └─> ts-extract  ──┘
 *
 * Historically each node ran as its own process — `pnpm -s vendor:fetch`,
 * a second `pnpm -s vendor:fetch --print-test-paths` for the TEST_PATHS_JSON
 * handoff, `pnpm tsx extract-ts-tests.ts`, `pnpm tsx compare.ts` — so the
 * pipeline paid the ~1.7s tsx/Node cold start four times over. This entrypoint
 * pays it ONCE: every TypeScript phase runs in-process, and only the Ruby
 * extractor stays a subprocess (it's a `.rb`). The test-paths manifest that
 * used to come from a whole extra fetch process is now just a
 * `testPathsManifest()` call.
 *
 * Args ("$@" forwarded by run.sh — `--package`, `--missing`, `--json`,
 * `--incomplete`, `--gates`, `--check`, …) are passed straight through to
 * test-compare's main(); only `--cached` is consumed here.
 *
 * `TEST_COMPARE_FORCE=1` forces a full run end-to-end, mirroring
 * `API_COMPARE_FORCE`: it overrides `--cached` and drops fetch's offline
 * fast-path.
 */
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runFetch } from "../../vendor/fetch.js";
import { testPathsManifest } from "../../vendor/sources.js";
import { main as extractTsTests } from "./extract-ts-tests.js";
import { main as runCompare } from "./compare.js";

const execFileAsync = promisify(execFile);

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, "../..");
const OUTPUT_DIR = join(DIR, "output");

const force = process.env.TEST_COMPARE_FORCE === "1";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runRubyExtract(): Promise<void> {
  const { stdout, stderr } = await execFileAsync("ruby", [join(DIR, "extract-ruby-tests.rb")], {
    cwd: ROOT,
    env: {
      ...process.env,
      TEST_PATHS_JSON: JSON.stringify(testPathsManifest()),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

/**
 * Whether extraction can be skipped: `--cached` asked for it AND both
 * manifests are already on disk. A missing manifest falls back to a full run,
 * with the same two messages run.sh's bash version printed.
 */
async function cacheHit(cached: boolean): Promise<boolean> {
  if (!cached) return false;
  const present =
    (await exists(join(OUTPUT_DIR, "rails-tests.json"))) &&
    (await exists(join(OUTPUT_DIR, "ts-tests.json")));
  if (present) {
    process.stdout.write("==> Using cached rails-tests.json + ts-tests.json (--cached)\n");
    return true;
  }
  process.stderr.write("==> --cached requested but cache missing; running full extract\n");
  return false;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cached = argv.includes("--cached") && !force;
  const forwardArgs = argv.filter((a) => a !== "--cached");

  if (!(await cacheHit(cached))) {
    // Warm runs take fetch's offline fast-path (trust the lockfile pins, skip
    // per-source `git rev-parse`); FORCE takes the full verifying path.
    await runFetch({ offline: !force });

    // Both extracts need only fetch's vendored sources, so they run in
    // parallel: ruby as a subprocess, ts in-process.
    await Promise.all([runRubyExtract(), extractTsTests()]);
  }

  runCompare(forwardArgs);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
