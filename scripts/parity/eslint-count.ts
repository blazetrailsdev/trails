/**
 * The ESLint burndown count gate (RFC 0127).
 *
 * Counts, per file and per rule in {@link RULES}, the ESLint violations, and
 * fails when any file's count is above its count at the base ref, or a file
 * absent there has a non-zero count. It replaces the per-file exclude lists
 * those rules carried, which recorded only which files may break a rule,
 * never how many times. `eslint.config.mjs` holds the rules at `warn`, so a
 * grandfathered file lints clean; this gate is what makes a new violation red.
 *
 * The base is the tree itself (in CI the merge commit's first parent, i.e.
 * current `origin/main`), so nothing is committed: no list to seed, tighten
 * or conflict on, and a stale branch cannot undo a sibling's convergence.
 * Only files whose content differs from the base are linted, on both sides,
 * with the current config and rules: an identical file counts the same at
 * both, so it can never exceed.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps. The entry point throws on failure, which is the exit status.
 */

import { execFile } from "child_process";
import { ESLint } from "eslint";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const RULES = [
  "@typescript-eslint/no-explicit-any",
  "blazetrails/rails-error-parity",
  "blazetrails/no-standalone-associations",
];

/**
 * Arms held at zero whatever the base says: `rails-error-parity`'s
 * `inventedMessage` was never grandfathered, so its base count is always 0.
 */
export const ZERO_BASELINE = new Set(["blazetrails/rails-error-parity::inventedMessage"]);

/** Violations per `<file>::<rule>` with a non-zero count. */
export type RuleCounts = Record<string, number>;

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await promisify(execFile)("git", args, { cwd, maxBuffer: 1 << 26 });
  return stdout;
}

function tally(
  counts: RuleCounts,
  file: string,
  messages: ESLint.LintResult["messages"],
  atBase = false,
): void {
  for (const m of messages) {
    if (!m.ruleId || !RULES.includes(m.ruleId)) continue;
    if (atBase && ZERO_BASELINE.has(`${m.ruleId}::${m.messageId}`)) continue;
    const key = `${file}::${m.ruleId}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
}

/** Source files whose working-tree content differs from `ref`, deletions excluded. */
export async function changedFiles(ref: string, cwd = ROOT_DIR): Promise<string[]> {
  const spec = ["--", "packages/*/src/*.ts"];
  const diffed = await git(["diff", "--name-only", "--diff-filter=d", ref, ...spec], cwd);
  const untracked = await git(["ls-files", "--others", "--exclude-standard", ...spec], cwd);
  return [...new Set(`${diffed}${untracked}`.split("\n").filter((f) => f !== ""))].sort();
}

function linter(cwd: string): ESLint {
  return new ESLint({ cwd, ruleFilter: ({ ruleId }) => RULES.includes(ruleId) });
}

/** The working tree's counts over `files`. */
export async function measure(files: string[], cwd = ROOT_DIR): Promise<RuleCounts> {
  const counts: RuleCounts = {};
  if (files.length === 0) return counts;
  const results = await linter(cwd).lintFiles(files);
  for (const r of results) tally(counts, path.relative(cwd, r.filePath), r.messages);
  return counts;
}

/** The counts of `files` as they stand at `ref`, linted under their current paths. */
export async function measureAt(ref: string, files: string[], cwd = ROOT_DIR): Promise<RuleCounts> {
  const eslint = linter(cwd);
  const present = new Set(
    (await git(["ls-tree", "-r", "--name-only", ref, "--", "packages"], cwd)).split("\n"),
  );
  const counts: RuleCounts = {};
  for (const file of files) {
    if (!present.has(file)) continue;
    const text = await git(["show", `${ref}:${file}`], cwd);
    const filePath = path.join(cwd, file);
    if (await eslint.isPathIgnored(filePath)) continue;
    for (const r of await eslint.lintText(text, { filePath }))
      tally(counts, file, r.messages, true);
  }
  return counts;
}

export function total(counts: RuleCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface Exceedance {
  key: string;
  base: number;
  current: number;
}

/** Keys whose count grew past the base; a key absent at the base counts 0 there. */
export function exceedances(base: RuleCounts, current: RuleCounts): Exceedance[] {
  return Object.keys(current)
    .sort()
    .filter((key) => current[key] > (base[key] ?? 0))
    .map((key) => ({ key, base: base[key] ?? 0, current: current[key] }));
}

export async function main(baseRef = "origin/main", cwd = ROOT_DIR): Promise<string> {
  const ref = (await git(["rev-parse", baseRef], cwd)).trim();
  const files = await changedFiles(ref, cwd);
  const base = await measureAt(ref, files, cwd);
  const current = await measure(files, cwd);
  const grew = exceedances(base, current);
  if (grew.length > 0) {
    throw new Error(
      `eslint-count gate: ${grew.length} file/rule pair(s) above their count at ${baseRef} ` +
        `(${ref.slice(0, 10)}). Fix the new violations:\n` +
        grew.map((v) => `  ${v.key}: ${v.base} → ${v.current}`).join("\n") +
        "\nA file moved, renamed or split on this branch counts 0 at the base, " +
        "so its existing violations count as new: fix them in the same PR.",
    );
  }
  return (
    `eslint-count gate: OK (${files.length} changed file(s), ` +
    `${total(current)}, ${total(base)} at ${ref.slice(0, 10)})`
  );
}
