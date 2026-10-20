/**
 * The literal-name send ratchet (CLAUDE.md § "A dispatch by name is spelled
 * directly").
 *
 * Counts, per non-test `.ts` file under each package's `src`, the lines matching
 * {@link SEND_PATTERN} — an `rbFSend` / `rbFPublicSend` whose name argument is
 * a string literal, with `grep -cE` semantics (matching LINES, not matches) —
 * and fails when any file's count is above its count at the merge-base with
 * `origin/main`. A literal name is one the author knew where the call was
 * written, so the ported shape is the direct member call (or, for a Ruby core
 * method a JS primitive lacks, ruby-compat's named helper); the gate exists to
 * stop the count growing while the standing ones are spelled out.
 *
 * Deliberately NOT a call-gate crediting change: dropping the literal-name
 * credit in `extract-ts-api.ts` makes `parity:api:calls` demand the direct
 * call, but it surfaces ten standing sites at once and each would need a
 * `call-mismatches-exclude` row. The owner ruled against committed receipts
 * for this (trails#9143), on the reasoning of trails#9129: the base tree is
 * the mark, so there is no mark file to conflict between parallel branches, to
 * seed, or to tighten.
 *
 * Line-based, like the cast ratchet: a send whose name argument sits on its own
 * continuation line is not counted. Such a site is still governed by the
 * section; the gate is a floor, not the rule.
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
export const SRC = "packages";

/**
 * An `rbFSend` / `rbFPublicSend` whose second argument opens with a double
 * quote: the receiver may hold anything but a comma or a quote, which keeps a
 * nested call (`rbFSend(File.extname(f), "delete", ".")`) in and a computed
 * name (`rbFSend(recv, name)`) out.
 */
export const SEND_PATTERN = String.raw`rbF(Public)?Send\([^,"]*, *"`;
export const SEND_RE = new RegExp(SEND_PATTERN);

/** Matching lines per file with a non-zero count, keyed by path relative to the source root. */
export type SendCounts = Record<string, number>;

export function countLines(text: string): number {
  let n = 0;
  for (const line of text.split("\n")) if (SEND_RE.test(line)) n++;
  return n;
}

async function listSources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "node_modules" || d.name === "dist") continue;
      out.push(...(await listSources(full)));
    } else if (d.isFile() && d.name.endsWith(".ts") && !d.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/** The working tree's counts. */
export async function measure(dir = path.join(ROOT_DIR, SRC)): Promise<SendCounts> {
  const counts: SendCounts = {};
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
export async function measureAt(ref: string, cwd = ROOT_DIR, src = SRC): Promise<SendCounts> {
  let stdout: string;
  try {
    stdout = await git(
      [
        "grep",
        "-c",
        "-E",
        SEND_PATTERN,
        ref,
        "--",
        `${src}/*/src/*.ts`,
        ":!*.test.ts",
        ":!*/dist/*",
      ],
      cwd,
    );
  } catch (e) {
    if ((e as { code?: number }).code === 1) return {};
    throw e;
  }
  const counts: SendCounts = {};
  for (const line of stdout.split("\n")) {
    if (line === "") continue;
    const sep = line.lastIndexOf(":");
    counts[line.slice(ref.length + 1 + src.length + 1, sep)] = Number(line.slice(sep + 1));
  }
  return counts;
}

export function total(counts: SendCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface Exceedance {
  file: string;
  base: number;
  current: number;
}

/** Files whose count grew past the base; a file absent at the base counts 0 there. */
export function exceedances(base: SendCounts, current: SendCounts): Exceedance[] {
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
      `send-count gate: ${grew.length} file(s) above their count at ${baseBranch} ` +
        `(${ref.slice(0, 10)}). Spell the member call, or ruby-compat's named helper ` +
        `where a JS primitive has no such member (CLAUDE.md § "A dispatch by name is ` +
        `spelled directly"):\n` +
        grew.map((v) => `  ${v.file}: ${v.base} → ${v.current}`).join("\n") +
        "\nA file moved, renamed or split on this branch counts 0 at the base, " +
        "so its existing sends count as new: spell them in the same PR.",
    );
  }
  return `send-count gate: OK (${total(current)}, ${total(base)} at ${ref.slice(0, 10)})`;
}
