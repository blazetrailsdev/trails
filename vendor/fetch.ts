#!/usr/bin/env -S npx tsx
// Unified Ruby source fetcher.
//
// CLI:
//   tsx vendor/fetch.ts [--source <name>] [--refresh]
//   tsx vendor/fetch.ts --print-paths [<name>]
//
//   --source <name>:      limit to one source.
//   --refresh:            rm -rf <dest> and re-clone (hard reset).
//   --print-paths:        no fetch; print absolute path of every source,
//                         one per line. With <name>: print just that one.
//   --print-test-paths:   no fetch; print JSON map {package: absolute_test_dir}
//                         for every package with a testPath and
//                         compareTests !== false. Used by extract-ruby-tests.rb
//                         via the TEST_PATHS_JSON env var.
//   --print-lib-paths:    no fetch; print JSON map {package: absolute_lib_dir}
//                         for every package with compareApi !== false. Used by
//                         extract-ruby-api.rb via the LIB_PATHS_JSON env var.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { libPathsManifest, SOURCES, testPathsManifest, type UpstreamSource } from "./sources.js";
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

function loadLockfile(): Lockfile {
  if (!existsSync(LOCKFILE_PATH)) return { sources: {} };
  return JSON.parse(readFileSync(LOCKFILE_PATH, "utf8")) as Lockfile;
}

function writeLockfile(lock: Lockfile): void {
  const sorted: Lockfile = { sources: {} };
  for (const name of Object.keys(lock.sources).sort()) {
    sorted.sources[name] = lock.sources[name];
  }
  const next = JSON.stringify(sorted, null, 2) + "\n";
  // Only write when content actually changed. Otherwise every no-op fetch
  // would bump the lockfile mtime and defeat extract-ruby-api.rb's cache
  // gate (which compares output_path mtime to LOCKFILE_PATH mtime).
  if (existsSync(LOCKFILE_PATH) && readFileSync(LOCKFILE_PATH, "utf8") === next) return;
  writeFileSync(LOCKFILE_PATH, next);
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

function destFor(source: UpstreamSource): string {
  return join(VENDOR_DIR, source.name);
}

/**
 * Fetch one source. Returns the resolved LockEntry; the caller serializes
 * lockfile writes after all parallel fetches resolve (writing inside this
 * function would race when called via Promise.all).
 */
async function fetchSource(
  source: UpstreamSource,
  opts: { refresh: boolean; lockEntry?: LockEntry },
): Promise<LockEntry> {
  const dest = destFor(source);
  const lockEntry = opts.lockEntry;

  if (opts.refresh && existsSync(dest)) {
    console.log(`[${source.name}] --refresh: removing ${dest}`);
    rmSync(dest, { recursive: true, force: true });
  }

  if (existsSync(join(dest, ".git"))) {
    const headSha = await git(["rev-parse", "HEAD"], dest);
    if (lockEntry && lockEntry.sha !== headSha) {
      throw new Error(
        `[${source.name}] HEAD ${headSha} does not match lockfile ${lockEntry.sha}. ` +
          `Re-run with --refresh to discard the local clone and re-fetch.`,
      );
    }
    console.log(`[${source.name}] up to date at ${headSha.slice(0, 12)}`);
    verifyPackages(source);
    return { ref: source.origin.ref, sha: headSha };
  }

  console.log(`[${source.name}] cloning ${source.origin.url}@${source.origin.ref}...`);
  mkdirSync(VENDOR_DIR, { recursive: true });
  await execFileAsync("git", [
    "clone",
    "--depth=1",
    "--branch",
    source.origin.ref,
    source.origin.url,
    dest,
  ]);
  const sha = await git(["rev-parse", "HEAD"], dest);

  if (lockEntry && lockEntry.sha !== sha) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(
      `[${source.name}] clone resolved ${sha} but lockfile pins ${lockEntry.sha}. ` +
        `Upstream may have re-tagged ${source.origin.ref}; investigate before --refresh. ` +
        `Partial clone removed.`,
    );
  }
  console.log(`[${source.name}] cloned at ${sha.slice(0, 12)}`);
  verifyPackages(source);
  return { ref: source.origin.ref, sha };
}

/**
 * Assert every declared lib/test path exists under the source's vendored root.
 * Catches incomplete/sparse/corrupt clones before downstream extractors silently
 * skip missing directories and produce undercounted output. Runs after every
 * fetch, including when an existing clone is reused.
 */
function verifyPackages(source: UpstreamSource): void {
  const root = destFor(source);
  const missing: string[] = [];
  for (const pkg of source.packages) {
    if (!existsSync(join(root, pkg.libPath))) missing.push(`${pkg.name}: ${pkg.libPath}`);
    if (pkg.testPath && !existsSync(join(root, pkg.testPath))) {
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

export interface ParsedArgs {
  sourceFilter?: string;
  refresh: boolean;
  printPaths: { active: boolean; name?: string };
  printTestPaths: boolean;
  printLibPaths: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    refresh: false,
    printPaths: { active: false },
    printTestPaths: false,
    printLibPaths: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") out.sourceFilter = argv[++i];
    else if (a === "--refresh") out.refresh = true;
    else if (a === "--print-test-paths") out.printTestPaths = true;
    else if (a === "--print-lib-paths") out.printLibPaths = true;
    else if (a === "--print-paths") {
      const next = argv[i + 1];
      out.printPaths = {
        active: true,
        name: next && !next.startsWith("--") ? argv[++i] : undefined,
      };
    } else throw new Error(`unknown flag: ${a}`);
  }
  return out;
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
  if (args.printLibPaths) {
    printLibPaths();
    return;
  }

  const targets = args.sourceFilter ? SOURCES.filter((s) => s.name === args.sourceFilter) : SOURCES;
  if (args.sourceFilter && targets.length === 0) {
    const names = SOURCES.map((s) => s.name);
    const suggestions = new SpellChecker({ dictionary: names }).correct(args.sourceFilter);
    const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
    throw new Error(`--source: no entry named "${args.sourceFilter}" in vendor/sources.ts.${hint}`);
  }

  // Fetch in parallel: cold runs are sum(clone times) sequentially → max(...)
  // here. Lockfile entries are returned, not written in fetchSource, so there's
  // no write race. The pre-load is the single read; we merge results below.
  const lock = loadLockfile();
  const results = await Promise.all(
    targets.map((source) =>
      fetchSource(source, {
        refresh: args.refresh,
        lockEntry: lock.sources[source.name],
      }).then((entry) => ({ name: source.name, entry })),
    ),
  );
  for (const { name, entry } of results) lock.sources[name] = entry;
  writeLockfile(lock);
}

// Only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
