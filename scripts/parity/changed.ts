/**
 * `pnpm parity:changed`: run the Rails API/Test Comparison gate stack locally,
 * scoped to each `packages/*` the branch changed against `origin/main`.
 *
 * Each enrolled package (one with a vendored lib path) runs
 * `scripts/ci/scoped-comparison.sh <pkg>` in turn; the others are skipped
 * with a note. `--full` also runs the unscoped `pnpm parity:api` compare, so a
 * change to a shared package is compared against its callers in every
 * package; the scoped gate stack still runs only for the changed packages.
 * CI's full job stays the backstop.
 */
import { execFileSync, spawnSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const SHARED_PACKAGES = ["ruby-compat", "activesupport"];

export interface Plan {
  run: string[];
  skipped: string[];
  shared: string[];
}

export function changedPackages(files: string[]): string[] {
  const pkgs = new Set<string>();
  for (const f of files) {
    const m = /^packages\/([^/]+)\//.exec(f);
    if (m) pkgs.add(m[1]);
  }
  return [...pkgs].sort();
}

export function plan(files: string[], enrolled: Set<string>): Plan {
  const pkgs = changedPackages(files);
  return {
    run: pkgs.filter((p) => enrolled.has(p)),
    skipped: pkgs.filter((p) => !enrolled.has(p)),
    shared: pkgs.filter((p) => SHARED_PACKAGES.includes(p)),
  };
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT_DIR, encoding: "utf8" });
}

function changedFiles(): string[] {
  const base = git("merge-base", "origin/main", "HEAD").trim();
  const tracked = git("diff", "--name-only", base).split("\n");
  const untracked = git("ls-files", "--others", "--exclude-standard").split("\n");
  return [...tracked, ...untracked].filter(Boolean);
}

function enrolledPackages(): Set<string> {
  const out = execFileSync("pnpm", ["--silent", "vendor:fetch", "--print-lib-paths"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return new Set(Object.keys(JSON.parse(out) as Record<string, string>));
}

function sh(cmd: string, args: string[]): number {
  return spawnSync(cmd, args, { cwd: ROOT_DIR, stdio: "inherit" }).status ?? 1;
}

export function main(argv: string[]): number {
  const full = argv.includes("--full");
  const p = plan(changedFiles(), enrolledPackages());
  if (p.run.length === 0 && p.skipped.length === 0 && !full) {
    console.log("parity:changed: no packages/* changed against origin/main; nothing to compare");
    return 0;
  }
  for (const pkg of p.skipped) {
    console.log(`parity:changed: skip ${pkg} (no vendored lib path, not enrolled)`);
  }
  if (p.shared.length > 0 && !full) {
    console.error(
      `parity:changed: ${p.shared.join(", ")} changed. Other packages call into it, and a ` +
        "scoped run cannot see them. Run `pnpm parity:changed --full` to add the unscoped " +
        "pnpm parity:api compare.",
    );
    if (p.run.length === 0) return 1;
  }

  const failed: string[] = [];
  for (const pkg of p.run) {
    console.log(`\nparity:changed: scoped comparison for ${pkg}`);
    if (sh("bash", ["scripts/ci/scoped-comparison.sh", pkg]) !== 0) failed.push(pkg);
  }

  if (full) {
    console.log("\nparity:changed --full: unscoped pnpm parity:api");
    if (sh("pnpm", ["parity:api"]) !== 0) failed.push("parity:api (unscoped)");
  }

  console.log("");
  if (failed.length > 0) {
    console.error(`parity:changed: FAILED for ${failed.join(", ")}`);
    return 1;
  }
  console.log(`parity:changed: OK (${[...p.run, ...(full ? ["parity:api"] : [])].join(", ")})`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
