#!/usr/bin/env -S npx tsx
/**
 * In-process orchestrator for `pnpm api:compare` (driver: run.sh).
 *
 * The pipeline is a small dependency DAG:
 *
 *   fetch ──┬─> ruby-extract ─┬─> compare            (needs both extracts)
 *           └─> ts-extract  ──┘
 *                            └─> privates-manifest   (needs ruby-api.json)
 *                            └─> file-structure-manifest
 *
 * Historically each node ran as its own `pnpm tsx <script>` process, so the
 * pipeline paid the ~1.7s tsx/Node cold start SEVEN times (fetch ran twice:
 * once to clone, once for `--print-lib-paths`). Startup dwarfed the actual
 * work. This entrypoint pays it ONCE: every TypeScript phase runs in-process,
 * and only the Ruby extractor stays a subprocess (it's a `.rb`). The phases
 * are ordered to respect the DAG:
 *
 *   A. fetch (in-process)            — produces the vendored sources + lockfile
 *   B. ruby-extract (subprocess) ∥ ts-extract (in-process worker threads)
 *   C. compare ; privates ; file-structure  — all in-process, sequential
 *
 * Phase C steps are independent of each other but CPU-bound and synchronous,
 * so running them sequentially in one process (zero per-step startup) beats
 * spawning three parallel processes that each re-pay the cold start.
 *
 * Args ("$@" forwarded by run.sh — `--package`, `--public-only`, `--files`,
 * etc.) live on process.argv and are read directly by compare's main().
 *
 * `API_COMPARE_FORCE=1` forces full regeneration end-to-end (ts-extract and
 * ruby-extract honor it via their own gates; fetch drops its offline
 * fast-path). `API_COMPARE_REFRESH=1` re-clones sources via fetch --refresh.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runFetch } from "../../vendor/fetch.js";
import { libPathsManifest } from "../../vendor/sources.js";
import { main as extractTsApi } from "./extract-ts-api.js";
import { main as runCompare } from "./compare.js";
import { sharedCacheDir, hashParts, fileHash, readShared, writeShared } from "./shared-cache.js";

const execFileAsync = promisify(execFile);

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, "../..");

const force = process.env.API_COMPARE_FORCE === "1";
const refresh = process.env.API_COMPARE_REFRESH === "1";

async function runRubyExtract(): Promise<void> {
  const { stdout, stderr } = await execFileAsync("ruby", [join(DIR, "extract-ruby-api.rb")], {
    env: {
      ...process.env,
      LIB_PATHS_JSON: JSON.stringify(libPathsManifest()),
      LOCKFILE_PATH: join(ROOT, "vendor/sources.lock.json"),
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

const OUTPUT_DIR = join(DIR, "output");

/**
 * Content key for the Ruby manifest: the same three inputs the extractor's own
 * mtime gate watches — the lockfile (re-fetch), sources.ts (registry edits),
 * and the extractor script (output-shape changes) — but hashed by CONTENT so
 * the key matches across worktrees. Returns null if any input is missing.
 */
async function railsCacheKey(): Promise<string | null> {
  const inputs = await Promise.all([
    fileHash(join(ROOT, "vendor/sources.lock.json")),
    fileHash(join(ROOT, "vendor/sources.ts")),
    fileHash(join(DIR, "extract-ruby-api.rb")),
  ]);
  if (inputs.some((h) => h === null)) return null;
  return hashParts(inputs as string[]);
}

/**
 * Run the Ruby extractor, but first consult the cross-worktree shared cache.
 * A hit writes `output/rails-api.json` directly (the fresh mtime keeps the Ruby
 * extractor's own mtime gate satisfied) and skips the subprocess; a miss runs
 * Ruby and publishes the result for sibling worktrees.
 */
async function runRubyExtractShared(): Promise<void> {
  const railsOut = join(OUTPUT_DIR, "rails-api.json");
  const sharedDir = force ? null : await sharedCacheDir(ROOT);
  const key = sharedDir ? await railsCacheKey() : null;

  if (sharedDir && key) {
    const cached = await readShared(sharedDir, "rails-api", key);
    if (cached !== null) {
      await writeFile(railsOut, cached);
      process.stdout.write("Rails manifest served from shared cross-worktree cache\n");
      return;
    }
  }

  await runRubyExtract();

  if (sharedDir && key) {
    const produced = await readFile(railsOut, "utf-8").catch(() => null);
    if (produced !== null) await writeShared(sharedDir, "rails-api", key, produced, basename(ROOT));
  }
}

async function main(): Promise<void> {
  // Phase A — fetch. On warm runs use the offline fast-path (trust the
  // lockfile pins, skip per-source `git rev-parse`); FORCE/REFRESH take the
  // full verifying path. The offline path never rewrites the lockfile, so the
  // ruby extractor's mtime cache gate stays valid.
  await runFetch({ refresh, offline: !force && !refresh });

  // Phase B — ruby (subprocess) and ts (in-process worker threads) in parallel.
  // Both only need fetch's vendored sources, which Phase A just produced.
  await Promise.all([runRubyExtractShared(), extractTsApi()]);

  // Phase C — compare needs both extracts; the two manifests need only
  // ruby-api.json. All in-process and synchronous. The manifest scripts run
  // their work at module load, so importing them executes them.
  runCompare();
  await import("../build-rails-privates-manifest.js");
  await import("../build-rails-file-structure-manifest.js");
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
