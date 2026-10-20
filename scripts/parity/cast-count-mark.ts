/**
 * The activerecord cast-count mark (RFC 0198, § "The ratchet").
 *
 * Counts, per non-test `.ts` file under `packages/activerecord/src`, the lines
 * matching {@link CAST_RE} — the RFC's exact regex, with `grep -cE` semantics
 * (matching LINES, not matches) — and holds each file at or below its
 * committed mark. RFC 0037's `no-explicit-any-src-exclude.json` is a binary
 * per-file allowlist that cannot see `as unknown as`; this is the count it
 * lacks.
 *
 * Only-shrink, on the contract of the param-name and extra-surface marks: a
 * file above its mark, or a rowless file with a non-zero count, fails; a mark
 * left above its file's count is STALE and fails too, narrowed by `tighten`,
 * which writes marks down and drops zero rows. `seed` runs once and refuses
 * when the mark file exists, so there is no reseed or write-up path.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps. The entry points throw on failure, which is the exit status.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
export const SRC_DIR = path.join(ROOT_DIR, "packages/activerecord/src");
export const MARK_PATH = path.join(SCRIPT_DIR, "cast-count-mark.json");

/** The RFC's `grep -rcE` pattern, verbatim. */
export const CAST_RE = /this: any\b|\(this as (any|unknown)|\bas any\b|as unknown as/;

/** Matching lines per file, keyed by path relative to {@link SRC_DIR}. */
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

/** Every file with a non-zero count. */
export async function measure(dir = SRC_DIR): Promise<CastCounts> {
  const counts: CastCounts = {};
  for (const file of (await listSources(dir)).sort()) {
    const n = countLines(await fs.readFile(file, "utf-8"));
    if (n > 0) counts[path.relative(dir, file).split(path.sep).join("/")] = n;
  }
  return counts;
}

export function total(counts: CastCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export interface MarkViolation {
  file: string;
  mark: number;
  current: number;
}

function compare(marks: CastCounts, current: CastCounts, pick: (m: number, c: number) => boolean) {
  const files = [...new Set([...Object.keys(marks), ...Object.keys(current)])].sort();
  const out: MarkViolation[] = [];
  for (const file of files) {
    const mark = marks[file] ?? 0;
    const now = current[file] ?? 0;
    if (pick(mark, now)) out.push({ file, mark, current: now });
  }
  return out;
}

/** Files above their mark; a rowless file's mark is 0. */
export function exceedances(marks: CastCounts, current: CastCounts): MarkViolation[] {
  return compare(marks, current, (m, c) => c > m);
}

/** Marks above their file's count. */
export function staleMarks(marks: CastCounts, current: CastCounts): MarkViolation[] {
  return compare(marks, current, (m, c) => c < m);
}

/** Each mark narrowed to its count, never raised; zero rows are dropped. */
export function tightened(marks: CastCounts, current: CastCounts): CastCounts {
  const next: CastCounts = {};
  for (const file of Object.keys(marks).sort()) {
    const n = Math.min(marks[file], current[file] ?? 0);
    if (n > 0) next[file] = n;
  }
  return next;
}

async function writeMarks(marks: CastCounts, file: string): Promise<void> {
  await fs.writeFile(file, JSON.stringify(marks, null, 2) + "\n");
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const render = (vs: MarkViolation[]) =>
  vs.map((v) => `  ${v.file}: mark ${v.mark} → current ${v.current}`).join("\n");

export type Mode = "check" | "tighten" | "seed";

export async function main(mode: Mode, markPath = MARK_PATH, dir = SRC_DIR): Promise<string> {
  const current = await measure(dir);

  if (mode === "seed") {
    if (await exists(markPath)) {
      throw new Error(`cast-count gate: ${markPath} already exists; there is no reseed.`);
    }
    await writeMarks(current, markPath);
    return `cast-count gate: seeded ${Object.keys(current).length} file(s), total ${total(current)}.`;
  }

  const marks = JSON.parse(await fs.readFile(markPath, "utf-8")) as CastCounts;
  const grew = exceedances(marks, current);
  if (grew.length > 0) {
    throw new Error(
      `cast-count gate: ${grew.length} file(s) above the committed mark. ` +
        `Type the receiver instead of casting (RFC 0198):\n${render(grew)}`,
    );
  }

  const stale = staleMarks(marks, current);
  if (mode === "tighten") {
    await writeMarks(tightened(marks, current), markPath);
    return `cast-count gate: narrowed ${stale.length} file(s), total ${total(current)}.`;
  }
  if (stale.length > 0) {
    throw new Error(
      `cast-count gate: ${stale.length} STALE mark(s) above the current count. ` +
        `Narrow them:\n  pnpm parity:types:casts:tighten\n${render(stale)}`,
    );
  }
  return `cast-count gate: OK (${total(current)}/${total(marks)})`;
}
