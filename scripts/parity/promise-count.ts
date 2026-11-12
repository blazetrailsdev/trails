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
 * `--changed <ref>` first fails any mark raised above the mark committed at
 * `<ref>`, then lints the packages holding a file that differs from `<ref>`,
 * or every package when the rules, the config or a tsconfig changed. With no
 * packages named every package is linted. `--only a,b` and `--except a,b`
 * narrow the set, so CI can split the run across jobs: the mark is per
 * package, so each job checks exactly its own packages.
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

/** A change to one of these can move any package's count, so it re-measures every package. */
export function changesEveryPackage(file: string): boolean {
  return (
    file.startsWith("eslint/") ||
    file === "eslint.config.mjs" ||
    file === "package.json" ||
    file === "pnpm-lock.yaml" ||
    file.startsWith("scripts/parity/promise-count") ||
    /(?:^|\/)tsconfig[^/]*\.json$/.test(file)
  );
}

async function changedPackages(ref: string): Promise<string[]> {
  const files = (await git(["diff", "--name-only", ref])).split("\n").filter((f) => f !== "");
  if (files.some(changesEveryPackage)) return allPackages();
  return [...new Set(files.map(packageOf).filter((p): p is string => p !== null))].sort();
}

/** `rule::package` rows whose mark is above the mark committed at `base`; an unmarked base package is 0. */
export function raisedMarks(base: Counts, mark: Counts): string[] {
  const rows: string[] = [];
  for (const rule of RULES) {
    for (const [pkg, n] of Object.entries(mark[rule] ?? {}).sort()) {
      const was = base[rule]?.[pkg] ?? 0;
      if (n > was) rows.push(`${rule}::${pkg}: mark ${was} → ${n}`);
    }
  }
  return rows;
}

/** The mark committed at `ref`, or null where `ref` has no mark file; any other git failure throws. */
async function markAt(ref: string): Promise<Counts | null> {
  const file = "scripts/parity/promise-count-mark.json";
  const listed = await git(["ls-tree", "--name-only", ref, "--", file]);
  if (listed.trim() === "") return null;
  return JSON.parse(await git(["show", `${ref}:${file}`])) as Counts;
}

/**
 * One ESLint instance per package: a single instance over every package holds
 * every package's TypeScript program at once and exhausts the 10 GB heap.
 */
export async function measure(packages: string[]): Promise<Counts> {
  const results: { file: string; ruleIds: (string | null)[] }[] = [];
  for (const pkg of packages) {
    const eslint = new ESLint({
      cwd: ROOT_DIR,
      errorOnUnmatchedPattern: false,
      ruleFilter: ({ ruleId }) => (RULES as readonly string[]).includes(ruleId),
    });
    for (const r of await eslint.lintFiles([pkg === "scripts" ? "scripts" : `packages/${pkg}`])) {
      results.push({
        file: path.relative(ROOT_DIR, r.filePath),
        ruleIds: r.messages.map((m) => m.ruleId),
      });
    }
  }
  return tally(results);
}

export async function main(args: string[] = []): Promise<string> {
  const mark = JSON.parse(await fs.readFile(MARK_PATH, "utf8")) as Counts;
  const changed = args.indexOf("--changed");
  const ref = changed >= 0 ? args[changed + 1] : undefined;
  const listAfter = (flag: string) => {
    const at = args.indexOf(flag);
    return at < 0 ? null : args[at + 1].split(",").filter((p) => p !== "");
  };
  const only = listAfter("--only");
  const except = listAfter("--except");
  const valued = new Set(["--changed", "--only", "--except"].map((f) => args.indexOf(f) + 1));
  const named = args.filter((a, i) => !a.startsWith("--") && !valued.has(i));
  const packages = (
    ref !== undefined ? await changedPackages(ref) : named.length > 0 ? named : await allPackages()
  ).filter((p) => (only === null || only.includes(p)) && (except === null || !except.includes(p)));
  const base = ref === undefined ? null : await markAt(ref);
  const raised = base === null ? [] : raisedMarks(base, mark);
  if (raised.length > 0) {
    throw new Error(
      `promise-count gate: ${raised.length} mark(s) raised above ${ref}. The mark is ` +
        "ONLY-SHRINK; converge the finding instead:\n" +
        raised.map((row) => `  ${row}`).join("\n"),
    );
  }
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
