#!/usr/bin/env -S npx tsx
// Unified Ruby source fetcher. Designed in docs/ruby-source-fetcher-plan.md.
//
// CLI:
//   tsx vendor/fetch.ts [--source <name>] [--refresh] [--migrate]
//   tsx vendor/fetch.ts --print-paths [<name>]
//
//   --source <name>:      limit to one source.
//   --refresh:            rm -rf <dest> and re-clone (hard reset).
//   --migrate:            wave-2 helper. For any source whose old
//                         pre-vendor path exists (e.g. scripts/api-compare/
//                         .rails-source) and whose new vendor/<name>/ does
//                         not, fs-mv the old dir into place. Falls back to
//                         a normal fetch if the old dir is absent.
//   --print-paths:        no fetch; print absolute path of every source,
//                         one per line. With <name>: print just that one.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { SOURCES, type UpstreamSource } from "./sources.js";

const VENDOR_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(VENDOR_DIR, "..");
const LOCKFILE_PATH = join(VENDOR_DIR, "sources.lock.json");

// Pre-vendor paths that wave 2's --migrate flag moves into vendor/<name>/.
// Keyed by source name → repo-relative old path.
const LEGACY_PATHS: Record<string, string> = {
  rails: "scripts/api-compare/.rails-source",
  rack: "scripts/api-compare/.rack-source",
};

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
  writeFileSync(LOCKFILE_PATH, JSON.stringify(sorted, null, 2) + "\n");
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
  opts: { refresh: boolean; migrate: boolean; lockEntry?: LockEntry },
): Promise<LockEntry> {
  const dest = destFor(source);
  const lockEntry = opts.lockEntry;

  if (opts.migrate && !existsSync(join(dest, ".git"))) {
    const legacyRel = LEGACY_PATHS[source.name];
    if (legacyRel) {
      const legacyAbs = join(REPO_ROOT, legacyRel);
      if (existsSync(join(legacyAbs, ".git"))) {
        console.log(`[${source.name}] migrating ${legacyRel} → vendor/${source.name}/`);
        mkdirSync(VENDOR_DIR, { recursive: true });
        renameSync(legacyAbs, dest);
        disableSparseCheckout(dest);
      } else {
        console.log(`[${source.name}] --migrate: no legacy clone at ${legacyRel}; will clone`);
      }
    }
  }

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

/**
 * Defensive: pre-PR-#1483 mirrors of rails were created with sparse-checkout
 * enabled. The old fetch-rails.sh auto-disabled it on first run; --migrate
 * inherits that contract so a sparse legacy clone doesn't get moved into
 * vendor/ with paths silently absent.
 */
function disableSparseCheckout(dest: string): void {
  try {
    const isSparse = execFileSync("git", ["config", "--bool", "core.sparseCheckout"], {
      cwd: dest,
      encoding: "utf8",
    }).trim();
    if (isSparse === "true") {
      console.log(`  disabling sparse-checkout in ${dest}`);
      execFileSync("git", ["-C", dest, "sparse-checkout", "disable"], { stdio: "inherit" });
    }
  } catch {
    // `git config --bool core.sparseCheckout` exits non-zero when the key is
    // unset (the modern default). That's the happy path — nothing to do.
  }
}

function printPaths(filter: string | undefined): void {
  for (const source of SOURCES) {
    if (filter && source.name !== filter) continue;
    process.stdout.write(destFor(source) + "\n");
  }
}

export interface ParsedArgs {
  sourceFilter?: string;
  refresh: boolean;
  migrate: boolean;
  printPaths: { active: boolean; name?: string };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { refresh: false, migrate: false, printPaths: { active: false } };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source") out.sourceFilter = argv[++i];
    else if (a === "--refresh") out.refresh = true;
    else if (a === "--migrate") out.migrate = true;
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

  const targets = args.sourceFilter ? SOURCES.filter((s) => s.name === args.sourceFilter) : SOURCES;
  if (args.sourceFilter && targets.length === 0) {
    throw new Error(`--source: no entry named "${args.sourceFilter}" in vendor/sources.ts`);
  }

  // Fetch in parallel: cold runs are sum(clone times) sequentially → max(...)
  // here. Lockfile entries are returned, not written in fetchSource, so there's
  // no write race. The pre-load is the single read; we merge results below.
  const lock = loadLockfile();
  const results = await Promise.all(
    targets.map((source) =>
      fetchSource(source, {
        refresh: args.refresh,
        migrate: args.migrate,
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
