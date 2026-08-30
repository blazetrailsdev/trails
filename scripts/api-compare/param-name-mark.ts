/**
 * The parameter-name high-water mark (RFC 0126).
 *
 * `param-names.ts` measures every matched pair; this is the only-shrink ratchet
 * over that measurement, on the same contract as the RFC 0117 extra-surface
 * mark and the RFC 0047/0084/0095 call baselines: a committed mark per gated
 * package, CI failing on ANY increase, and `--tighten` — never a reseed —
 * narrowing a mark left above the measurement.
 *
 * The mark carries a per-FILE count beside the total, which is what the flat
 * total cannot see: a rename converged in one file and introduced in another
 * leaves the total unmoved.
 *
 * arel is enrolled first because it is already at zero (PRs #7123 and #7148
 * between them fixed all 16 of its renames), so the gate starts armed rather
 * than budgeted. Every other package is measured and reported and joins by its
 * own burndown story — widening GATED_PACKAGES without one is the same
 * not-mechanical step the extra-surface mark warns about.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SCRIPT_DIR } from "./config.js";
import { serializeBaseline } from "./baseline-json.js";

export const MARK_PATH = path.join(SCRIPT_DIR, "param-name-mark.json");

/** The packages this gate covers — see the module comment. */
export const GATED_PACKAGES = [
  "abstractcontroller",
  "actioncontroller",
  "actiondispatch",
  "actionview",
  "activemodel",
  "activesupport",
  "arel",
  "did-you-mean",
  "globalid",
  "rack",
  "trailties",
] as const;

export interface PackageMark {
  /** Every param-name row in the package. */
  total: number;
  /** Rows per Ruby file, so surface can't move between files unnoticed. */
  byFile: Record<string, number>;
}

export type ParamNameMarks = Record<string, PackageMark>;

/** One flagged position, as the artifact carries it. */
export interface MeasuredRow {
  package: string;
  rubyFile: string;
}

export function measure(rows: readonly MeasuredRow[]): ParamNameMarks {
  const marks: ParamNameMarks = {};
  for (const name of GATED_PACKAGES) marks[name] = { total: 0, byFile: {} };
  for (const row of rows) {
    const mark = marks[row.package];
    if (!mark) continue;
    mark.total++;
    mark.byFile[row.rubyFile] = (mark.byFile[row.rubyFile] ?? 0) + 1;
  }
  return marks;
}

export interface MarkViolation {
  package: string;
  /** `"total"`, or the Ruby file whose own count moved. */
  dimension: string;
  mark: number;
  current: number;
}

function dimensions(mark: PackageMark, now: PackageMark): [string, number, number][] {
  const files = new Set([...Object.keys(mark.byFile), ...Object.keys(now.byFile)]);
  return [
    ["total", mark.total, now.total],
    ...[...files]
      .sort()
      .map((f): [string, number, number] => [f, mark.byFile[f] ?? 0, now.byFile[f] ?? 0]),
  ];
}

/** Every dimension that grew past its mark. Empty means the gate passes. */
export function exceedances(marks: ParamNameMarks, current: ParamNameMarks): MarkViolation[] {
  const violations: MarkViolation[] = [];
  for (const name of GATED_PACKAGES) {
    const mark = marks[name];
    const now = current[name];
    if (!mark || !now) continue;
    for (const [dimension, m, c] of dimensions(mark, now)) {
      if (c > m) violations.push({ package: name, dimension, mark: m, current: c });
    }
  }
  return violations;
}

/** Marks sitting ABOVE what a clean measurement would write. Not a failure —
 *  the gate only forbids growth — but reported so a converged PR narrows its
 *  mark instead of leaving slack for the next one to spend. */
export function staleMarks(marks: ParamNameMarks, current: ParamNameMarks): MarkViolation[] {
  const stale: MarkViolation[] = [];
  for (const name of GATED_PACKAGES) {
    const mark = marks[name];
    const now = current[name];
    if (!mark || !now) continue;
    for (const [dimension, m, c] of dimensions(mark, now)) {
      if (c < m) stale.push({ package: name, dimension, mark: m, current: c });
    }
  }
  return stale;
}

/** A package the gate covers but the measurement never reported — silently
 *  passing would disarm the gate the first time a `--package` filter hid it. */
export function unmeasuredPackages(measuredPackages: readonly string[]): string[] {
  return GATED_PACKAGES.filter((name) => !measuredPackages.includes(name));
}

/** A package the gate covers but the mark file never committed — every
 *  comparison skips it, so gating without seeding disarms rather than
 *  half-enables. The mark-side twin of {@link unmeasuredPackages}. */
export function unmarkedPackages(marks: ParamNameMarks): string[] {
  return GATED_PACKAGES.filter((name) => marks[name] === undefined);
}

export async function loadMarks(): Promise<ParamNameMarks> {
  return JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as ParamNameMarks;
}

/** Write the mark down to `current`. Only-shrink by construction: a dimension
 *  that grew keeps its committed value, so `--tighten` can never launder a
 *  regression into the mark the way a reseed would. A file that converged to
 *  zero leaves the mark rather than lingering as a `0` row. */
export function tightened(marks: ParamNameMarks, current: ParamNameMarks): ParamNameMarks {
  const next: ParamNameMarks = { ...marks };
  for (const name of GATED_PACKAGES) {
    const mark = marks[name];
    const now = current[name];
    if (!mark || !now) continue;
    const byFile: Record<string, number> = {};
    for (const file of Object.keys(mark.byFile).sort()) {
      const narrowed = Math.min(mark.byFile[file], now.byFile[file] ?? 0);
      if (narrowed > 0) byFile[file] = narrowed;
    }
    next[name] = { total: Math.min(mark.total, now.total), byFile };
  }
  return next;
}

export async function writeMarks(marks: ParamNameMarks): Promise<void> {
  const sorted: ParamNameMarks = {};
  for (const name of Object.keys(marks).sort()) sorted[name] = marks[name]!;
  await fs.writeFile(MARK_PATH, serializeBaseline(sorted));
}
