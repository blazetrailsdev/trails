#!/usr/bin/env -S npx tsx
// Unified Ruby source fetcher.
//
// CLI:
//   tsx vendor/fetch.ts [--source <name>] [--refresh]
//   tsx vendor/fetch.ts --source <name> --ref <ref> [--refresh]
//   tsx vendor/fetch.ts [--source <name>] --prune
//   tsx vendor/fetch.ts --print-paths [<name>]
//
//   --source <name>:      limit to one source.
//   --ref <ref>:          clone <ref> as a candidate into its own version
//                         directory beside the active one. Needs --source.
//                         Never reads or writes the lockfile, and no
//                         --print-* manifest ever answers it (RFC 0159).
//   --refresh:            rm -rf the version directory being fetched and
//                         re-clone (hard reset). Never the whole vendor/<name>/.
//   --prune:              remove every inactive version directory.
//   --print-paths:        no fetch; print absolute path of every source,
//                         one per line. With <name>: print just that one.
//   --print-test-paths:   no fetch; print JSON map {package: absolute_test_dir}
//                         for every package with a testPath and
//                         compareTests !== false. Used by extract-ruby-tests.rb
//                         via the TEST_PATHS_JSON env var.
//   --print-lib-paths:    no fetch; print JSON map {package: absolute_lib_dir}
//   --print-lib-entry-files: no fetch; print JSON map {package: absolute_entry_file}
//                         for every package with compareApi !== false. Used by
//                         extract-ruby-api.rb via the LIB_PATHS_JSON env var.

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import {
  activeVersion,
  libEntryFilesManifest,
  libPathsManifest,
  SOURCES,
  testPathsManifest,
  type UpstreamSource,
  vendoredRoot,
  versionDir,
} from "./sources.js";
import { SpellChecker } from "../packages/did-you-mean/src/spell-checker.js";

const VENDOR_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(VENDOR_DIR, "..");
const LOCKFILE_PATH = join(VENDOR_DIR, "sources.lock.json");

interface LockEntry {
  ref: string;
  sha: string;
}
interface Lockfile {
  sources: Record<string, LockEntry>;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function loadLockfile(): Promise<Lockfile> {
  if (!(await exists(LOCKFILE_PATH))) return { sources: {} };
  return JSON.parse(await readFile(LOCKFILE_PATH, "utf8")) as Lockfile;
}

async function writeLockfile(lock: Lockfile): Promise<void> {
  const sorted: Lockfile = { sources: {} };
  for (const name of Object.keys(lock.sources).sort()) {
    sorted.sources[name] = lock.sources[name];
  }
  const next = JSON.stringify(sorted, null, 2) + "\n";
  // Only write when content actually changed. Otherwise every no-op fetch
  // would bump the lockfile mtime and defeat extract-ruby-api.rb's cache
  // gate (which compares output_path mtime to LOCKFILE_PATH mtime).
  if ((await exists(LOCKFILE_PATH)) && (await readFile(LOCKFILE_PATH, "utf8")) === next) return;
  await writeFile(LOCKFILE_PATH, next);
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** `vendor/<name>/`, the directory every version of a source sits in. */
function versionsDirFor(source: UpstreamSource): string {
  return dirname(vendoredRoot(source.name));
}

function destFor(source: UpstreamSource): string {
  return vendoredRoot(source.name);
}

/**
 * Fetch one source. Returns the resolved LockEntry; the caller serializes
 * lockfile writes after all parallel fetches resolve (writing inside this
 * function would race when called via Promise.all).
 */
export async function fetchSource(
  source: UpstreamSource,
  opts: { refresh: boolean; offline?: boolean; lockEntry?: LockEntry; dest?: string },
): Promise<LockEntry> {
  const dest = opts.dest ?? destFor(source);
  const lockEntry = opts.lockEntry;

  if (opts.refresh && (await exists(dest))) {
    console.log(`[${source.name}] --refresh: removing ${dest}`);
    await rm(dest, { recursive: true, force: true });
  }

  // Offline fast-path: when the clone exists and the lockfile already pins a
  // sha for it, trust the pin and skip the `git rev-parse HEAD` subprocess.
  // The HEAD-vs-lock consistency check below only catches a clone that drifted
  // out from under us (manual checkout, interrupted --refresh); the common
  // warm case is steady-state, so we still verify the declared paths exist but
  // avoid spawning git per source. `--refresh`/FORCE take the full path.
  if (opts.offline && lockEntry && (await exists(join(dest, ".git")))) {
    console.log(`[${source.name}] offline: pinned at ${lockEntry.sha.slice(0, 12)}`);
    await verifyPackages(source, dest);
    return lockEntry;
  }

  if (await exists(join(dest, ".git"))) {
    const headSha = await git(["rev-parse", "HEAD"], dest);
    if (lockEntry && lockEntry.sha !== headSha) {
      throw new Error(
        `[${source.name}] HEAD ${headSha} does not match lockfile ${lockEntry.sha}. ` +
          `Re-run with --refresh to discard the local clone and re-fetch.`,
      );
    }
    console.log(`[${source.name}] up to date at ${headSha.slice(0, 12)}`);
    await verifyPackages(source, dest);
    return { ref: source.origin.ref, sha: headSha };
  }

  const sha = await cloneRef(source, source.origin.ref, dest);

  if (lockEntry && lockEntry.sha !== sha) {
    await rm(dest, { recursive: true, force: true });
    throw new Error(
      `[${source.name}] clone resolved ${sha} but lockfile pins ${lockEntry.sha}. ` +
        `Upstream may have re-tagged ${source.origin.ref}; investigate before --refresh. ` +
        `Partial clone removed.`,
    );
  }
  console.log(`[${source.name}] cloned at ${sha.slice(0, 12)}`);
  await verifyPackages(source, dest);
  return { ref: source.origin.ref, sha };
}

async function cloneRef(source: UpstreamSource, ref: string, dest: string): Promise<string> {
  console.log(`[${source.name}] cloning ${source.origin.url}@${ref}...`);
  await mkdir(dirname(dest), { recursive: true });
  await execFileAsync("git", ["clone", "--depth=1", "--branch", ref, source.origin.url, dest]);
  return git(["rev-parse", "HEAD"], dest);
}

/**
 * Fetch `ref` as a candidate into `vendor/<name>/<versionDir(ref)>/`, beside
 * the active version. There is no lockfile entry to check a candidate against
 * and none is written, so the lockfile keeps naming the active version only.
 * Its declared paths are not verified: a candidate's layout is exactly what an
 * upgrade is there to diff.
 */
export async function fetchCandidate(
  source: UpstreamSource,
  ref: string,
  opts: { refresh: boolean; versionsDir?: string },
): Promise<string> {
  const dest = join(opts.versionsDir ?? versionsDirFor(source), versionDir(ref));

  if (opts.refresh && (await exists(dest))) {
    console.log(`[${source.name}] --refresh: removing ${dest}`);
    await rm(dest, { recursive: true, force: true });
  }

  if (await exists(join(dest, ".git"))) {
    const headSha = await git(["rev-parse", "HEAD"], dest);
    console.log(`[${source.name}] candidate ${ref} present at ${headSha.slice(0, 12)}`);
    return dest;
  }

  const sha = await cloneRef(source, ref, dest);
  console.log(`[${source.name}] candidate ${ref} cloned at ${sha.slice(0, 12)} into ${dest}`);
  return dest;
}

/**
 * Remove every version directory of `source` other than the active one, and
 * return the paths removed. Pruning is only ever explicit (RFC 0159, Open
 * question 5): a candidate is the tree an upgrade is diffing against.
 */
export async function pruneSource(
  source: UpstreamSource,
  versionsDir: string = versionsDirFor(source),
): Promise<string[]> {
  if (!(await exists(versionsDir))) return [];
  const active = activeVersion(source);
  const removed: string[] = [];
  for (const entry of await readdir(versionsDir, { withFileTypes: true })) {
    if (entry.name === active || !(entry.isDirectory() || entry.isSymbolicLink())) continue;
    const path = join(versionsDir, entry.name);
    await rm(path, { recursive: true, force: true });
    removed.push(path);
  }
  return removed;
}

/**
 * Assert every declared lib/test path exists under the source's vendored root.
 * Catches incomplete/sparse/corrupt clones before downstream extractors silently
 * skip missing directories and produce undercounted output. Runs after every
 * fetch, including when an existing clone is reused.
 */
async function verifyPackages(source: UpstreamSource, root: string): Promise<void> {
  const missing: string[] = [];
  for (const pkg of source.packages) {
    if (!(await exists(join(root, pkg.libPath)))) missing.push(`${pkg.name}: ${pkg.libPath}`);
    if (pkg.testPath && !(await exists(join(root, pkg.testPath)))) {
      missing.push(`${pkg.name}: ${pkg.testPath}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[${source.name}] vendored tree is missing declared paths:\n  ` +
        missing.join("\n  ") +
        `\nRe-run with --refresh to discard the clone and re-fetch.`,
    );
  }
}

function printPaths(filter: string | undefined): void {
  if (filter && !SOURCES.some((s) => s.name === filter)) {
    const names = SOURCES.map((s) => s.name);
    const suggestions = new SpellChecker({ dictionary: names }).correct(filter);
    const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
    throw new Error(`--print-paths: no entry named "${filter}" in vendor/sources.ts.${hint}`);
  }
  for (const source of SOURCES) {
    if (filter && source.name !== filter) continue;
    process.stdout.write(destFor(source) + "\n");
  }
}

function printTestPaths(): void {
  process.stdout.write(JSON.stringify(testPathsManifest()) + "\n");
}

function printLibPaths(): void {
  process.stdout.write(JSON.stringify(libPathsManifest()) + "\n");
}

function printLibEntryFiles(): void {
  process.stdout.write(JSON.stringify(libEntryFilesManifest()) + "\n");
}

export interface ParsedArgs {
  sourceFilter?: string;
  ref?: string;
  refresh: boolean;
  prune: boolean;
  printPaths: { active: boolean; name?: string };
  printTestPaths: boolean;
  printLibPaths: boolean;
  printLibEntryFiles: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    refresh: false,
    prune: false,
    printPaths: { active: false },
    printTestPaths: false,
    printLibPaths: false,
    printLibEntryFiles: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") out.sourceFilter = argv[++i];
    else if (a === "--ref") out.ref = argv[++i];
    else if (a === "--refresh") out.refresh = true;
    else if (a === "--prune") out.prune = true;
    else if (a === "--print-test-paths") out.printTestPaths = true;
    else if (a === "--print-lib-paths") out.printLibPaths = true;
    else if (a === "--print-lib-entry-files") out.printLibEntryFiles = true;
    else if (a === "--print-paths") {
      const next = argv[i + 1];
      out.printPaths = {
        active: true,
        name: next && !next.startsWith("--") ? argv[++i] : undefined,
      };
    } else throw new Error(`unknown flag: ${a}`);
  }
  if (out.ref !== undefined && out.sourceFilter === undefined) {
    throw new Error("--ref needs --source: a candidate is fetched for one source at a time");
  }
  if (out.ref !== undefined && out.prune) {
    throw new Error("--ref and --prune cannot be combined: --prune removes every candidate");
  }
  return out;
}

/**
 * Fetch every (or one) source and reconcile the lockfile. Exported so the
 * parity:api orchestrator can run the fetch phase in-process instead of
 * paying a separate `pnpm tsx` cold start (~1.7s) for it.
 *
 * `offline` enables the per-source fast-path in fetchSource (skip `git
 * rev-parse`); the orchestrator passes it on warm runs and drops it for
 * `--refresh` / `API_COMPARE_FORCE=1`.
 */
export async function runFetch(
  opts: {
    sourceFilter?: string;
    ref?: string;
    refresh?: boolean;
    prune?: boolean;
    offline?: boolean;
  } = {},
): Promise<void> {
  const targets = opts.sourceFilter ? SOURCES.filter((s) => s.name === opts.sourceFilter) : SOURCES;
  if (opts.sourceFilter && targets.length === 0) {
    const names = SOURCES.map((s) => s.name);
    const suggestions = new SpellChecker({ dictionary: names }).correct(opts.sourceFilter);
    const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
    throw new Error(`--source: no entry named "${opts.sourceFilter}" in vendor/sources.ts.${hint}`);
  }

  if (opts.prune) {
    const removed = (await Promise.all(targets.map((source) => pruneSource(source)))).flat();
    for (const path of removed) console.log(`--prune: removed ${path}`);
    if (removed.length === 0) console.log("--prune: no inactive version directories");
    return;
  }

  if (opts.ref !== undefined) {
    const [source] = targets;
    if (versionDir(opts.ref) !== activeVersion(source)) {
      await fetchCandidate(source, opts.ref, { refresh: opts.refresh ?? false });
      return;
    }
    if (opts.ref !== source.origin.ref) {
      throw new Error(
        `[${source.name}] --ref ${opts.ref} lands in the active version directory ` +
          `${activeVersion(source)} but is not the active ref ${source.origin.ref}.`,
      );
    }
  }

  // Fetch in parallel: cold runs are sum(clone times) sequentially → max(...)
  // here. Lockfile entries are returned, not written in fetchSource, so there's
  // no write race. The pre-load is the single read; we merge results below.
  const lock = await loadLockfile();
  const results = await Promise.all(
    targets.map((source) =>
      fetchSource(source, {
        refresh: opts.refresh ?? false,
        offline: opts.offline ?? false,
        lockEntry: lock.sources[source.name],
      }).then((entry) => ({ name: source.name, entry })),
    ),
  );
  for (const { name, entry } of results) lock.sources[name] = entry;
  await writeLockfile(lock);
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.printPaths.active) {
    printPaths(args.printPaths.name);
    return;
  }
  if (args.printTestPaths) {
    printTestPaths();
    return;
  }
  if (args.printLibEntryFiles) {
    printLibEntryFiles();
    return;
  }
  if (args.printLibPaths) {
    printLibPaths();
    return;
  }

  await runFetch({
    sourceFilter: args.sourceFilter,
    ref: args.ref,
    refresh: args.refresh,
    prune: args.prune,
  });
}

// Only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
