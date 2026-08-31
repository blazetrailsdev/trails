/**
 * The extra-surface high-water mark (RFC 0117).
 *
 * `parity:api:extra` has always printed a table and exited 0, so nothing
 * stopped the population from growing: arel's extra surface rose on every
 * measured day between 2026-08-05 and 2026-08-22. This module is the
 * only-shrink ratchet that keeps a burned-down population burned down, built
 * on the same contract as the RFC 0047/0084 call-set mark and its RFC 0095
 * call-argument twin:
 *
 *   - a committed mark per COUNTED package — `novel` and `total`;
 *   - CI fails on ANY increase in either number;
 *   - converging surface makes the mark stale-HIGH, which `--tighten` narrows
 *     to the current measurement — never a reseed, and never a widening.
 *
 * A package that reaches zero untagged novel surface leaves that contract for
 * TAGGED-ONLY MODE below, and carries no mark at all.
 *
 * The mark is per-PACKAGE, not per-file. The call-set baseline is sharded per
 * source file because its unit of work is one reviewed row per call site; here
 * the unit is a count, and a per-file mark would let surface move between files
 * inside a flat total without the gate noticing, which is the opposite of what
 * a ratchet is for.
 *
 * Scope was arel-only at RFC 0117. activerecord joined it under RFC 0119
 * (connection-adapter fidelity): its adapter tree carries 100+ cited, verified
 * divergences that no gate could see, because the call-set ratchet only detects
 * a Rails call the TS body OMITS — it is blind to an invented extra branch, a
 * JS-shaped public API, or an async/sync shape divergence, which is what most
 * of that population is. Gating the package freezes the surface those stories
 * burn down. The mark is seeded at the measured 399 novel / 1424 total: a
 * high-water mark to shrink, NOT a budget to spend.
 *
 * ruby-compat joined under RFC 0129, at the moment its mark was still 0/0. Its
 * defining rule — no member exists without a real call site in this repo — has
 * no `SKIP_GROUPS` discipline behind it, because there is no Ruby-Rails file to
 * be measured against: every public name in the package lands in the
 * `rubyFile === null` slice and scores novel, so this counter IS the rule. A
 * speculative member — an MRI method ported because its siblings are here —
 * raises `novel` and turns the gate red, and there is no reseed. A later need
 * is a later story against RFC 0129 carrying its motivating call site, and the
 * mark moves up only as a reviewed line of that story's diff.
 *
 * activemodel remains ungated. The same reasoning would apply, but it has no
 * burndown behind it yet, and widening GATED_PACKAGES without one is exactly
 * the not-mechanical step this comment has always warned about.
 *
 * TAGGED-ONLY MODE is where a gated package ends up once its untagged novel
 * surface is burnt down. `extra-surface.ts` already subtracts a declaration
 * carrying a `@noRailsEquivalent` receipt from both dimensions, so `novel`
 * never counted KNOWN extra surface — only the residue nobody has written a
 * receipt for. A package whose residue is zero therefore needs no number at
 * all: its rule is the constant `novel === 0`, and it carries no row in the
 * JSON.
 *
 * That is not merely tidier. A single shared integer per package is a
 * merge-conflict generator — every PR anywhere in the package that deletes one
 * novel name rewrites the same line, and two parallel branches collide on a
 * value neither can resolve without a full re-measurement. A receipt lives in
 * the file the PR is already editing, so it conflicts with nothing.
 *
 * The mode drops the `total` dimension, deliberately. A moved-not-novel extra
 * is a name Rails DOES define, just in another `.rb`; that is a file-placement
 * deviation, which `blazetrails/rails-file-structure-method-order` already
 * polices for the packages enrolled here, and it is not what a receipt is for.
 * Trading it away is the price of retiring the package's row, and it is only
 * paid by a package that has already reached zero invented surface.
 *
 * arel enrolls first, being the only package measured at `novel: 0`.
 * activerecord's 342 and ruby-compat's 4 stay on counts until their own
 * burndowns (the `activerecord-extra-surface-receipt-burndown` RFC and RFC
 * 0129 respectively) retire them, one receipt or one deletion at a time.
 * Enrollment is only-grow, exactly like RFC 0121's: a package joins when it
 * reaches zero and is never moved back out to turn a red run green.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception), async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { SCRIPT_DIR } from "./config.js";
import { serializeBaseline } from "./baseline-json.js";

export const MARK_PATH = path.join(SCRIPT_DIR, "extra-surface-mark.json");

/**
 * Gated packages that still carry a committed `novel`/`total` mark, because
 * they still have untagged novel surface to burn down.
 */
export const COUNTED_PACKAGES = ["activerecord", "ruby-compat"] as const;

/**
 * Gated packages held at `novel === 0` with NO row in the mark file — see
 * TAGGED-ONLY MODE in the module comment. Only-grow: a package joins on
 * reaching zero and never leaves.
 */
export const TAGGED_ONLY_PACKAGES = ["arel"] as const;

/**
 * The packages this gate covers, in either mode. Everything else is measured
 * by `parity:api:extra` and left ungated — see the module comment.
 */
export type GatedPackage =
  | (typeof COUNTED_PACKAGES)[number]
  | (typeof TAGGED_ONLY_PACKAGES)[number];

export const GATED_PACKAGES: readonly GatedPackage[] = [
  ...COUNTED_PACKAGES,
  ...TAGGED_ONLY_PACKAGES,
].sort();

export interface SurfaceMark {
  /**
   * Extras that appear NOWHERE in the Rails source — invented surface, the
   * number the burndown is actually about.
   */
  novel: number;
  /** All extras, novel plus moved-not-novel. */
  total: number;
}

export type SurfaceMarks = Record<string, SurfaceMark>;

/** The shape `extra-surface.ts` reports per package, narrowed to what we gate. */
export interface MeasuredTotals {
  package: string;
  totalNovel: number;
  totalExtras: number;
}

export function measure(packages: readonly MeasuredTotals[]): SurfaceMarks {
  const marks: SurfaceMarks = {};
  for (const name of GATED_PACKAGES) {
    const measured = packages.find((p) => p.package === name);
    if (!measured) continue;
    marks[name] = { novel: measured.totalNovel, total: measured.totalExtras };
  }
  return marks;
}

export interface MarkViolation {
  package: string;
  dimension: "novel" | "total";
  mark: number;
  current: number;
}

/**
 * Every dimension that grew past its mark. Empty means the gate passes —
 * a shrunk dimension is reported by {@link staleMarks}, not here.
 */
export function exceedances(marks: SurfaceMarks, current: SurfaceMarks): MarkViolation[] {
  const violations: MarkViolation[] = [];
  for (const name of COUNTED_PACKAGES) {
    const mark = marks[name];
    const now = current[name];
    if (!mark || !now) continue;
    for (const dimension of ["novel", "total"] as const) {
      if (now[dimension] > mark[dimension]) {
        violations.push({
          package: name,
          dimension,
          mark: mark[dimension],
          current: now[dimension],
        });
      }
    }
  }
  return violations;
}

/**
 * Marks sitting ABOVE what a clean measurement would write. Not a failure —
 * the gate only forbids growth — but reported so a converged PR narrows its
 * mark in the same commit instead of leaving slack for the next one to spend.
 */
export function staleMarks(marks: SurfaceMarks, current: SurfaceMarks): MarkViolation[] {
  const stale: MarkViolation[] = [];
  for (const name of COUNTED_PACKAGES) {
    const mark = marks[name];
    const now = current[name];
    if (!mark || !now) continue;
    for (const dimension of ["novel", "total"] as const) {
      if (now[dimension] < mark[dimension]) {
        stale.push({ package: name, dimension, mark: mark[dimension], current: now[dimension] });
      }
    }
  }
  return stale;
}

/**
 * A package the gate covers but the measurement never reported. Silently
 * passing on it would disarm the gate the first time a filter or an exclusion
 * hid the package from the run.
 */
export function unmeasuredPackages(current: SurfaceMarks): string[] {
  return GATED_PACKAGES.filter((name) => current[name] === undefined);
}

/**
 * A package the gate covers but the mark file never committed. {@link exceedances},
 * {@link staleMarks} and {@link tightened} all skip a package with no mark, so
 * adding a name to {@link GATED_PACKAGES} without seeding its numbers disarms
 * the gate for that package instead of half-enabling it. The mark-side twin of
 * {@link unmeasuredPackages}.
 */
export function unmarkedPackages(marks: SurfaceMarks): string[] {
  return COUNTED_PACKAGES.filter((name) => marks[name] === undefined);
}

/**
 * Every tagged-only package measured with novel surface left. Non-empty means
 * a public TS name with no Ruby counterpart was added without a
 * `@noRailsEquivalent` receipt — the fix is the receipt or the deletion, and
 * there is no number to raise. The twin of {@link exceedances} for the mode
 * that has no mark.
 */
export function taggedOnlyViolations(current: SurfaceMarks): MarkViolation[] {
  const violations: MarkViolation[] = [];
  for (const name of TAGGED_ONLY_PACKAGES) {
    const now = current[name];
    if (!now) continue;
    if (now.novel > 0) {
      violations.push({ package: name, dimension: "novel", mark: 0, current: now.novel });
    }
  }
  return violations;
}

/**
 * A tagged-only package that still carries a row in the mark file. The row is
 * dead weight no comparison here reads, and leaving one there invites a later
 * `--tighten` to resurrect a number the package no longer has. This is the
 * single enforcement point: {@link writeMarks} does not filter such a row out,
 * so the gate must refuse before one can ever reach it.
 */
export function strandedMarks(marks: SurfaceMarks): string[] {
  return TAGGED_ONLY_PACKAGES.filter((name) => marks[name] !== undefined);
}

export async function loadMarks(): Promise<SurfaceMarks> {
  return JSON.parse(await fs.readFile(MARK_PATH, "utf-8")) as SurfaceMarks;
}

/**
 * Write the mark down to `current`. Only-shrink by construction: a dimension
 * that grew keeps its committed value, so `--tighten` can never launder a
 * regression into the mark the way a reseed would.
 */
export function tightened(marks: SurfaceMarks, current: SurfaceMarks): SurfaceMarks {
  const next: SurfaceMarks = { ...marks };
  for (const name of COUNTED_PACKAGES) {
    const mark = marks[name];
    const now = current[name];
    if (!mark || !now) continue;
    next[name] = {
      novel: Math.min(mark.novel, now.novel),
      total: Math.min(mark.total, now.total),
    };
  }
  return next;
}

export async function writeMarks(marks: SurfaceMarks): Promise<void> {
  const sorted: SurfaceMarks = {};
  for (const name of Object.keys(marks).sort()) sorted[name] = marks[name]!;
  await fs.writeFile(MARK_PATH, serializeBaseline(sorted));
}
