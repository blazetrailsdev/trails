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
 * `API_COMPARE_FORCE`: it overrides `--cached`, drops fetch's offline
 * fast-path, and bypasses the shared Rails-manifest cache.
 *
 * The Ruby extract is the dominant cost of a full run (~25s of ~31s), and every
 * worktree extracts the same vendored Rails, so it goes through the same
 * content-keyed cross-worktree cache api-compare uses
 * (`scripts/api-compare/shared-cache.ts`): the first worktree to extract a
 * given `vendor/` + extractor pays for all of them.
 */
import { execFile } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { runFetch } from "../../vendor/fetch.js";
import { testPathsManifest } from "../../vendor/sources.js";
import { main as extractTsTests } from "./extract-ts-tests.js";
import { main as runCompare } from "./compare.js";
import {
  sharedCacheDir,
  hashParts,
  fileHash,
  readShared,
  writeShared,
  pruneSharedCache,
} from "@blazetrails/parity/shared-cache";

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
 * The test-compare analogue of api-compare's `RAILS_INPUTS`: the lockfile
 * (re-fetch), sources.ts (registry edits, whence `testPathsManifest()`), and
 * the extractor script (output-shape changes). The shared cache keys on their
 * CONTENT, so a key computed in one worktree matches another's.
 */
const RAILS_INPUTS = [
  join(ROOT, "vendor/sources.lock.json"),
  join(ROOT, "vendor/sources.ts"),
  join(DIR, "extract-ruby-tests.rb"),
];

/** Content key for the Rails test manifest, or null if any input is missing. */
async function railsCacheKey(): Promise<string | null> {
  const inputs = await Promise.all(RAILS_INPUTS.map(fileHash));
  if (inputs.some((h) => h === null)) return null;
  return hashParts(inputs as string[]);
}

/**
 * True when `output/rails-tests.json` is already newer than every input — this
 * worktree is warm, so re-running Ruby would reproduce it byte for byte. Cheap
 * stats, checked before the shared cache so the common warm path never pays a
 * multi-MB read+rewrite. Unlike api-compare's extractor the Ruby side has no
 * mtime gate of its own, so this is the only thing standing between a warm run
 * and the ~25s subprocess.
 */
async function railsOutputFresh(railsOut: string): Promise<boolean> {
  try {
    const outMtime = (await stat(railsOut)).mtimeMs;
    const inMtimes = await Promise.all(RAILS_INPUTS.map((p) => stat(p).then((s) => s.mtimeMs)));
    return inMtimes.every((m) => outMtime >= m);
  } catch {
    return false;
  }
}

/**
 * Run the Ruby extractor, but first consult the cross-worktree shared cache.
 * A hit writes `output/rails-tests.json` directly and skips the subprocess; a
 * miss runs Ruby and publishes the result for sibling worktrees.
 * `TEST_COMPARE_FORCE=1` bypasses both layers, as `API_COMPARE_FORCE` does.
 */
async function runRubyExtractShared(): Promise<void> {
  const railsOut = join(OUTPUT_DIR, "rails-tests.json");
  if (!force && (await railsOutputFresh(railsOut))) {
    process.stdout.write("Rails test manifest is current; skipping Ruby extract\n");
    return;
  }

  const sharedDir = force ? null : await sharedCacheDir(ROOT);
  const key = sharedDir ? await railsCacheKey() : null;

  if (sharedDir && key) {
    const cached = await readShared(sharedDir, "rails-tests", key);
    if (cached !== null) {
      await writeFile(railsOut, cached);
      process.stdout.write("Rails test manifest served from shared cross-worktree cache\n");
      return;
    }
  }

  await runRubyExtract();

  if (sharedDir && key) {
    const produced = await readFile(railsOut, "utf-8").catch(() => null);
    if (produced !== null) {
      await writeShared(sharedDir, "rails-tests", key, produced, basename(ROOT));
    }
  }
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
    await Promise.all([runRubyExtractShared(), extractTsTests()]);
  }

  await prune();

  runCompare(forwardArgs);
}

/**
 * Prune the shared cache, api-compare's Phase D. The `rails-tests` entries this
 * orchestrator publishes are content-keyed and therefore append-only — every
 * `vendor/sources.lock.json` bump mints a new key and orphans the old multi-MB
 * manifest — so a checkout that runs `test:compare` but never `api:compare`
 * would otherwise grow the shared directory without bound.
 *
 * Unlike api-compare's, this runs *before* the comparison rather than after:
 * `compare.ts`'s `main()` exits the process on a gate failure, so housekeeping
 * placed after it would be skipped on exactly the runs that keep happening.
 * It stays best-effort either way — every failure is swallowed, so it can
 * change neither the comparison result nor the exit code. `TEST_COMPARE_FORCE=1`
 * skips it, mirroring `API_COMPARE_FORCE`.
 */
async function prune(): Promise<void> {
  if (force) return;
  try {
    const pruned = await pruneSharedCache(ROOT);
    if (
      pruned.removedEntries ||
      pruned.removedFragments ||
      pruned.removedVersionDirs ||
      pruned.removedLegacyDir
    ) {
      process.stdout.write(
        `Pruned shared cache: ${pruned.removedEntries} stale entr${pruned.removedEntries === 1 ? "y" : "ies"}, ` +
          `${pruned.removedFragments} tmp fragment${pruned.removedFragments === 1 ? "" : "s"}, ` +
          `${pruned.removedVersionDirs} superseded version dir${pruned.removedVersionDirs === 1 ? "" : "s"}` +
          `${pruned.removedLegacyDir ? ", plus the pre-rename api-compare-cache tree" : ""}\n`,
      );
    }
  } catch {
    // best-effort housekeeping
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
