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
 *   - a committed mark per gated package — `novel` and `total`;
 *   - CI fails on ANY increase in either number;
 *   - converging surface makes the mark stale-HIGH, which `--tighten` narrows
 *     to the current measurement — never a reseed, and never a widening.
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
 * activemodel remains ungated. The same reasoning would apply, but it has no
 * burndown behind it yet, and widening GATED_PACKAGES without one is exactly
 * the not-mechanical step this comment has always warned about.
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
 * The packages this gate covers. Everything else is measured by
 * `parity:api:extra` and left ungated — see the module comment.
 */
export const GATED_PACKAGES = ["arel", "activerecord"] as const;

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
  for (const name of GATED_PACKAGES) {
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
  for (const name of GATED_PACKAGES) {
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
  for (const name of GATED_PACKAGES) {
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
