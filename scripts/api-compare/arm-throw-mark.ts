/**
 * The missing-`throw` arm high-water mark (RFC 0113).
 *
 * `report-arms.ts` measures every name-matched pair's control-token
 * projections; this is the only-shrink ratchet over ONE stratum of that
 * measurement — the rows whose multiset difference drops a `throw` — on the
 * same contract as the RFC 0126 parameter-name mark, the RFC 0117
 * extra-surface mark and the RFC 0047/0084/0095 call baselines: a committed
 * mark per gated package, CI failing on ANY increase, and `--tighten` — never a
 * reseed — narrowing a mark left above the measurement.
 *
 * Why this stratum and no other. `remeasure-arm-noise-floor-per-token` re-drew
 * the noise-floor sample per token (`report-arms.ts --sample=N --token=…`) and
 * hand-audited every row. The whole population cannot gate (75.0% non-real,
 * n=80) and neither can `if` (70.0% non-real, n=80) — and `if` IS the
 * population, at 1,891 of 2,141 rows. The missing-`throw` stratum is the
 * opposite: all 69 rows read in full, 61 real and 8 lowering artefact, a
 * non-real rate of 11.6% whose 95% interval (4.1%–19.1%) sits entirely under
 * this RFC's pre-committed ⅓ tripwire. A dropped raise is a real divergence
 * nine times in ten. RFC 0095 is the precedent for gating one stratum and
 * leaving the rest report-only.
 *
 * The two artefact classes the audit named are suppressed AT THE SOURCE rather
 * than budgeted here: `throw(:abort)` / `throw(:exception, …)` ported through
 * the settled halt helper folds onto the `throw` construct
 * (compare.ts:TS_CONSTRUCT_SKELETON_NAMES).
 *
 * The other class — Ruby-only guards with no JS counterpart — is a PERMANENT
 * FLOOR, not debt, and the audit proposes no action on it (its Gap 5). Those
 * four rows sit in the seeded marks and will never converge, so a file whose
 * mark is held up by one is not a burndown target; do not go hunting them.
 *
 * `if`, `loop`, `try` and `rescue` stay report-only;
 * `parity:api:arms:report` is unchanged.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SCRIPT_DIR } from "./config.js";
import { serializeBaseline } from "./baseline-json.js";

export const MARK_PATH = path.join(SCRIPT_DIR, "arm-throw-mark.json");

/** The arm token this gate reads. The other four stay report-only. */
export const GATED_TOKEN = "throw";

/**
 * The packages this gate covers — every package the skeleton artifact compares,
 * including the ones already at zero. The stratum's yield was measured over the
 * whole population, not per package, so there is no package this evidence
 * covers less well than another; a package seeded at 0 starts armed.
 */
export const GATED_PACKAGES = [
  "abstractcontroller",
  "actioncontroller",
  "actiondispatch",
  "actionpackversion",
  "actionview",
  "activemodel",
  "activerecord",
  "activerecord-test-support",
  "activesupport",
  "arel",
  "did-you-mean",
  "globalid",
  "i18n",
  "rack",
  "rack-session",
  "rack-test",
  "sqlite3",
  "trailties",
] as const;

export interface PackageMark {
  /** Rows in the package that drop at least one `throw`. */
  total: number;
  /** Rows per TS file, so a dropped raise cannot move between files unnoticed. */
  byFile: Record<string, number>;
}

export type ArmThrowMarks = Record<string, PackageMark>;

/** One flagged pair, as {@link measure} reads it off the arm report. */
export interface MeasuredRow {
  package: string;
  tsFile: string;
  missing: readonly string[];
}

export function measure(rows: readonly MeasuredRow[]): ArmThrowMarks {
  const marks: ArmThrowMarks = {};
  for (const name of GATED_PACKAGES) marks[name] = { total: 0, byFile: {} };
  for (const row of rows) {
    if (!row.missing.includes(GATED_TOKEN)) continue;
    const mark = marks[row.package];
    if (!mark) continue;
    mark.total++;
    mark.byFile[row.tsFile] = (mark.byFile[row.tsFile] ?? 0) + 1;
  }
  return marks;
}

export interface MarkViolation {
  package: string;
  /** `"total"`, or the TS file whose own count moved. */
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
export function exceedances(marks: ArmThrowMarks, current: ArmThrowMarks): MarkViolation[] {
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

/** Marks sitting ABOVE a clean measurement. Not a failure — the gate only
 *  forbids growth — but reported so a converged PR narrows its own mark
 *  instead of leaving slack for the next one to spend. */
export function staleMarks(marks: ArmThrowMarks, current: ArmThrowMarks): MarkViolation[] {
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
export function unmarkedPackages(marks: ArmThrowMarks): string[] {
  return GATED_PACKAGES.filter((name) => marks[name] === undefined);
}

export async function loadMarks(): Promise<ArmThrowMarks> {
  return JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as ArmThrowMarks;
}

/** Write the mark down to `current`. Only-shrink by construction: a dimension
 *  that grew keeps its committed value, so `--tighten` can never launder a
 *  regression into the mark the way a reseed would. */
export function tightened(marks: ArmThrowMarks, current: ArmThrowMarks): ArmThrowMarks {
  const next: ArmThrowMarks = { ...marks };
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

export async function writeMarks(marks: ArmThrowMarks): Promise<void> {
  const sorted: ArmThrowMarks = {};
  for (const name of Object.keys(marks).sort()) sorted[name] = marks[name]!;
  await fs.writeFile(MARK_PATH, serializeBaseline(sorted));
}
