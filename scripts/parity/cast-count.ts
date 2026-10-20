/**
 * The activerecord cast-count ratchet (RFC 0198, § "The ratchet").
 *
 * Counts, per non-test `.ts` file under `packages/activerecord/src`, the lines
 * matching {@link CAST_RE} — the RFC's exact regex, with `grep -cE` semantics
 * (matching LINES, not matches) — and fails when any file's count is above
 * its count at the merge-base with `origin/main`. RFC 0037's
 * `no-explicit-any-src-exclude.json` is a binary per-file allowlist that
 * cannot see `as unknown as`; this is the count it lacks.
 *
 * The mark is the base tree itself, so nothing is committed: no mark file to
 * conflict between parallel branches, to seed, or to tighten. A file new on
 * the branch has a base count of 0, and a converged cast lowers the bar for
 * every branch the moment it merges.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps. The entry point throws on failure, which is the exit status.
 */

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SRC = "packages/activerecord/src";

/** The RFC's `grep -rcE` pattern, verbatim. */
export const CAST_PATTERN = String.raw`this: any\b|\(this as (any|unknown)|\bas any\b|as unknown as`;
export const CAST_RE = new RegExp(CAST_PATTERN);

/** Matching lines per file with a non-zero count, keyed by path relative to the source root. */
export type CastCounts = Record<string, number>;

export function countLines(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) if (CAST_RE.test(line)) n++;
  return n;
}

async function listSources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listSources(full)));
    else if (d.isFile() && d.name.endsWith(".ts") && !d.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** The working tree's counts. */
export async function measure(dir = path.join(ROOT_DIR, SRC)): Promise<CastCounts> {
  const counts: CastCounts = {};
  for (const file of (await listSources(dir)).sort()) {
    const n = countLines(await fs.readFile(file, "utf-8"));
    if (n > 0) counts[path.relative(dir, file).split(path.sep).join("/")] = n;
  }
  return counts;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await promisify(execFile)("git", args, { cwd, maxBuffer: 1 << 26 });
  return stdout;
}

/** The counts at `ref`, read with `git grep -cE` over the same files. */
export async function measureAt(ref: string, cwd = ROOT_DIR, src = SRC): Promise<CastCounts> {
  let stdout: string;
  try {
    stdout = await git(
      ["grep", "-c", "-E", CAST_PATTERN, ref, "--", `${src}/*.ts`, ":!*.test.ts"],
      cwd,
    );
  } catch (e) {
    if ((e as { code?: number }).code === 1) return {};
    throw e;
  }
  const counts: CastCounts = {};
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const sep = line.lastIndexOf(":");
    counts[line.slice(ref.length + 1 + src.length + 1, sep)] = Number(line.slice(sep + 1));
  }
  return counts;
}

export function total(counts: CastCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface Exceedance {
  file: string;
  base: number;
  current: number;
}

/** Files whose count grew past the base; a file absent at the base counts 0 there. */
export function exceedances(base: CastCounts, current: CastCounts): Exceedance[] {
  return Object.keys(current)
    .sort()
    .filter((file) => current[file] > (base[file] ?? 0))
    .map((file) => ({ file, base: base[file] ?? 0, current: current[file] }));
}

export async function main(baseBranch = "origin/main", cwd = ROOT_DIR): Promise<string> {
  const ref = (await git(["merge-base", baseBranch, "HEAD"], cwd)).trim();
  const base = await measureAt(ref, cwd);
  const current = await measure(path.join(cwd, SRC));
  const grew = exceedances(base, current);
  if (grew.length > 0) {
    throw new Error(
      `cast-count gate: ${grew.length} file(s) above their count at ${baseBranch} ` +
        `(${ref.slice(0, 10)}). Type the receiver instead of casting (RFC 0198):\n` +
        grew.map((v) => `  ${v.file}: ${v.base} → ${v.current}`).join("\n"),
    );
  }
  return `cast-count gate: OK (${total(current)}, ${total(base)} at ${ref.slice(0, 10)})`;
}
