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

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function destFor(source: UpstreamSource): string {
  return join(VENDOR_DIR, source.name);
}

function fetchSource(source: UpstreamSource, opts: { refresh: boolean; migrate: boolean }): void {
  const dest = destFor(source);
  const lock = loadLockfile();
  const lockEntry = lock.sources[source.name];

  if (opts.migrate && !existsSync(join(dest, ".git"))) {
    const legacyRel = LEGACY_PATHS[source.name];
    if (legacyRel) {
      const legacyAbs = join(REPO_ROOT, legacyRel);
      if (existsSync(join(legacyAbs, ".git"))) {
        console.log(`[${source.name}] migrating ${legacyRel} → vendor/${source.name}/`);
        mkdirSync(VENDOR_DIR, { recursive: true });
        renameSync(legacyAbs, dest);
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
    const headSha = git(["rev-parse", "HEAD"], dest);
    if (lockEntry && lockEntry.sha !== headSha) {
      throw new Error(
        `[${source.name}] HEAD ${headSha} does not match lockfile ${lockEntry.sha}. ` +
          `Re-run with --refresh to discard the local clone and re-fetch.`,
      );
    }
    if (!lockEntry) {
      lock.sources[source.name] = { ref: source.origin.ref, sha: headSha };
      writeLockfile(lock);
    }
    console.log(`[${source.name}] up to date at ${headSha.slice(0, 12)}`);
    return;
  }

  console.log(`[${source.name}] cloning ${source.origin.url}@${source.origin.ref}...`);
  mkdirSync(VENDOR_DIR, { recursive: true });
  execFileSync(
    "git",
    ["clone", "--depth=1", "--branch", source.origin.ref, source.origin.url, dest],
    { stdio: "inherit" },
  );
  const sha = git(["rev-parse", "HEAD"], dest);

  if (lockEntry && lockEntry.sha !== sha) {
    rmSync(dest, { recursive: true, force: true });
    throw new Error(
      `[${source.name}] clone resolved ${sha} but lockfile pins ${lockEntry.sha}. ` +
        `Upstream may have re-tagged ${source.origin.ref}; investigate before --refresh. ` +
        `Partial clone removed.`,
    );
  }
  lock.sources[source.name] = { ref: source.origin.ref, sha };
  writeLockfile(lock);
  console.log(`[${source.name}] cloned at ${sha.slice(0, 12)}`);
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

function main(argv: string[]): void {
  const args = parseArgs(argv);

  if (args.printPaths.active) {
    printPaths(args.printPaths.name);
    return;
  }

  const targets = args.sourceFilter ? SOURCES.filter((s) => s.name === args.sourceFilter) : SOURCES;
  if (args.sourceFilter && targets.length === 0) {
    throw new Error(`--source: no entry named "${args.sourceFilter}" in vendor/sources.ts`);
  }
  for (const source of targets) {
    fetchSource(source, { refresh: args.refresh, migrate: args.migrate });
  }
}

// Only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
