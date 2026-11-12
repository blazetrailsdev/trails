/**
 * The no-void-promises count gate (RFC 0234 § 1, § 2).
 *
 * Counts, per package and per rule in {@link RULES}, the ESLint findings, and
 * fails when a package is above its committed mark in
 * `promise-count-mark.json`. `eslint.config.mjs` holds both rules at `warn`
 * repo-wide, so a package with findings lints clean; this gate is what makes a
 * new finding red.
 *
 * The mark is ONLY-SHRINK and there is no reseed: `--tighten` writes each
 * linted package's mark DOWN to its measurement and never up, and a package
 * absent from the mark is held at 0. A finding converges by awaiting,
 * returning or `Thread`-owning the promise, never by raising a mark.
 *
 * `--changed <ref>` lints only the packages holding a file that differs from
 * `<ref>`; with no packages named every package is linted.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps. The entry point throws on failure, which is the exit status.
 */

import { execFile } from "child_process";
import { ESLint } from "eslint";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MARK_PATH = path.join(ROOT_DIR, "scripts/parity/promise-count-mark.json");

export const RULES = [
  "@typescript-eslint/no-floating-promises",
  "blazetrails/constructor-creates-no-promise",
] as const;

/** Findings per rule, per package (`packages/<name>` is `<name>`; `scripts` is `scripts`). */
export type Counts = Record<string, Record<string, number>>;

/** The package a repo-relative path belongs to, or null outside the gate's scope. */
export function packageOf(file: string): string | null {
  const parts = file.split("/");
  if (parts[0] === "packages" && parts.length > 2) return parts[1];
  if (parts[0] === "scripts") return "scripts";
  return null;
}

export function tally(results: { file: string; ruleIds: (string | null)[] }[]): Counts {
  const counts: Counts = Object.fromEntries(RULES.map((rule) => [rule, {}]));
  for (const { file, ruleIds } of results) {
    const pkg = packageOf(file);
    if (pkg === null) continue;
    for (const ruleId of ruleIds) {
      if (ruleId === null || !(ruleId in counts)) continue;
      counts[ruleId][pkg] = (counts[ruleId][pkg] ?? 0) + 1;
    }
  }
  return counts;
}

/** `rule::package` rows whose measurement is above the mark; an unmarked package's mark is 0. */
export function exceedances(mark: Counts, current: Counts): string[] {
  const rows: string[] = [];
  for (const rule of RULES) {
    for (const [pkg, n] of Object.entries(current[rule] ?? {}).sort()) {
      const allowed = mark[rule]?.[pkg] ?? 0;
      if (n > allowed) rows.push(`${rule}::${pkg}: mark ${allowed}, measured ${n}`);
    }
  }
  return rows;
}

/** The mark with every linted package written DOWN to its measurement; never up. */
export function tightened(mark: Counts, current: Counts, linted: string[]): Counts {
  const next: Counts = {};
  for (const rule of RULES) {
    const row: Record<string, number> = {};
    for (const [pkg, n] of Object.entries(mark[rule] ?? {})) {
      const measured = linted.includes(pkg) ? (current[rule]?.[pkg] ?? 0) : n;
      const kept = Math.min(n, measured);
      if (kept > 0) row[pkg] = kept;
    }
    next[rule] = Object.fromEntries(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return next;
}

async function git(args: string[]): Promise<string> {
  const { stdout } = await promisify(execFile)("git", args, {
    cwd: ROOT_DIR,
    maxBuffer: 1 << 26,
  });
  return stdout;
}

async function allPackages(): Promise<string[]> {
  const entries = await fs.readdir(path.join(ROOT_DIR, "packages"), { withFileTypes: true });
  return [...entries.filter((e) => e.isDirectory()).map((e) => e.name), "scripts"].sort();
}

async function changedPackages(ref: string): Promise<string[]> {
  const files = (await git(["diff", "--name-only", ref, "--", "packages", "scripts"])).split("\n");
  return [...new Set(files.map(packageOf).filter((p): p is string => p !== null))].sort();
}

export async function measure(packages: string[]): Promise<Counts> {
  if (packages.length === 0) return tally([]);
  const eslint = new ESLint({
    cwd: ROOT_DIR,
    errorOnUnmatchedPattern: false,
    ruleFilter: ({ ruleId }) => (RULES as readonly string[]).includes(ruleId),
  });
  const targets = packages.map((p) => (p === "scripts" ? "scripts" : `packages/${p}`));
  const results = await eslint.lintFiles(targets);
  return tally(
    results.map((r) => ({
      file: path.relative(ROOT_DIR, r.filePath),
      ruleIds: r.messages.map((m) => m.ruleId),
    })),
  );
}

export async function main(args: string[] = []): Promise<string> {
  const mark = JSON.parse(await fs.readFile(MARK_PATH, "utf8")) as Counts;
  const changed = args.indexOf("--changed");
  const ref = changed >= 0 ? args[changed + 1] : undefined;
  const named = args.filter((a, i) => !a.startsWith("--") && i !== changed + 1);
  const packages =
    ref !== undefined ? await changedPackages(ref) : named.length > 0 ? named : await allPackages();
  const current = await measure(packages);
  if (args.includes("--tighten")) {
    await fs.writeFile(
      MARK_PATH,
      `${JSON.stringify(tightened(mark, current, packages), null, 2)}\n`,
    );
    return `promise-count: mark tightened over ${packages.length} package(s)`;
  }
  const grew = exceedances(mark, current);
  if (grew.length > 0) {
    throw new Error(
      `promise-count gate: ${grew.length} rule/package pair(s) above the mark. ` +
        "Await, return or Thread-own the promise; never raise the mark:\n" +
        grew.map((row) => `  ${row}`).join("\n"),
    );
  }
  return `promise-count gate: OK (${packages.length} package(s))`;
}
