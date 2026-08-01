/**
 * Only-shrink ratchet for the ASSERTION-LEVEL fidelity counters (RFC 0025).
 *
 * `pnpm test:compare` measures three divergences inside name-MATCHED tests and
 * writes them to output/convention-comparison.json as per-package totals:
 * `totalAssertionMismatch` (different NUMBER of assertions), `totalKindMismatch`
 * (same count, divergent KINDS), `totalValueMismatch` (same kinds, divergent
 * literal EXPECTED VALUES). They were advisory, so a newly ported test could
 * assert less than its Rails counterpart and still count as matched.
 *
 * This pins them the way the wide call-mismatch ratchet pins its unreviewed
 * count (RFC 0083): a committed high-water mark per package per counter, which
 * `--write` lowers and never raises. The arm is AGGREGATE — the guarantee is
 * "assertion-level debt never grows", not "every remaining mismatch was
 * reviewed". See CONTRIBUTING.md "Measuring progress" for the full contract and
 * the stale-artifact trap.
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
import * as fs from "fs/promises";

/** The three assertion-level counters, in report order. */
export const COUNTERS = ["assertionCount", "kind", "value"] as const;

export type Counter = (typeof COUNTERS)[number];

/** Human label per counter, matching the `test:compare` summary tokens. */
export const COUNTER_LABELS: Record<Counter, string> = {
  assertionCount: "assertion-count-mismatch",
  kind: "assertion-kind-mismatch",
  value: "assertion-value-mismatch",
};

export type Counts = Record<Counter, number>;

/** The committed high-water mark: per package, one number per counter. */
export interface AssertionMark {
  packages: Record<string, Counts>;
}

/** The slice of convention-comparison.json this gate reads. */
export interface ComparisonArtifact {
  results?: {
    package: string;
    totalAssertionMismatch?: number;
    totalKindMismatch?: number;
    totalValueMismatch?: number;
  }[];
}

/**
 * Per-package current counts, read from the test-compare artifact.
 *
 * Packages whose three counters are all zero are kept: dropping them would make
 * a converged package look "new" on the next run and re-admit its debt.
 */
export function countsFromArtifact(artifact: ComparisonArtifact): Record<string, Counts> {
  const out: Record<string, Counts> = {};
  for (const r of artifact.results ?? []) {
    out[r.package] = {
      assertionCount: r.totalAssertionMismatch ?? 0,
      kind: r.totalKindMismatch ?? 0,
      value: r.totalValueMismatch ?? 0,
    };
  }
  return out;
}

function parseCounts(pkg: string, raw: unknown): Counts {
  const counts = {} as Counts;
  for (const counter of COUNTERS) {
    const value = (raw as Partial<Record<Counter, unknown>> | null)?.[counter];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(
        `assertion high-water mark: ${pkg}.${counter} must be a non-negative integer, got ` +
          `${JSON.stringify(value)}`,
      );
    }
    counts[counter] = value;
  }
  return counts;
}

export function parseMark(text: string): AssertionMark {
  const parsed = JSON.parse(text) as { packages?: unknown } | null;
  const packages = parsed?.packages;
  if (typeof packages !== "object" || packages === null || Array.isArray(packages)) {
    throw new Error(
      `assertion high-water mark: expected {"packages": {<pkg>: {…}}}, got ${text.trim()}`,
    );
  }
  const out: Record<string, Counts> = {};
  for (const [pkg, raw] of Object.entries(packages as Record<string, unknown>)) {
    out[pkg] = parseCounts(pkg, raw);
  }
  return { packages: out };
}

/**
 * Read the committed mark. A missing file is reported as the disarmed ratchet
 * it is — deleting it is how the gate would be silently switched off — rather
 * than as a bare ENOENT.
 */
export async function loadMark(file: string): Promise<AssertionMark> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    throw new Error(
      `assertion high-water mark: ${file} is missing. It is a committed ratchet file; ` +
        "restore it from git rather than regenerating, or the mark is lost.",
      { cause: e },
    );
  }
  return parseMark(text);
}

export async function writeMark(file: string, mark: AssertionMark): Promise<void> {
  const packages: Record<string, Counts> = {};
  for (const pkg of Object.keys(mark.packages).sort()) packages[pkg] = mark.packages[pkg];
  await fs.writeFile(file, `${JSON.stringify({ packages }, null, 2)}\n`);
}

/** Only-shrink: each counter takes the lower of current and mark. */
export function nextMark(current: Record<string, Counts>, mark: AssertionMark): AssertionMark {
  const packages: Record<string, Counts> = {};
  for (const [pkg, counts] of Object.entries(current)) {
    const prior = mark.packages[pkg];
    const next = {} as Counts;
    for (const counter of COUNTERS) {
      next[counter] = prior ? Math.min(counts[counter], prior[counter]) : counts[counter];
    }
    packages[pkg] = next;
  }
  return { packages };
}

export interface Violation {
  package: string;
  counter: Counter;
  current: number;
  mark: number;
}

/** Counters that exceed their mark, plus packages the mark does not cover. */
export function violations(
  current: Record<string, Counts>,
  mark: AssertionMark,
): { exceeded: Violation[]; unmarked: string[] } {
  const exceeded: Violation[] = [];
  const unmarked: string[] = [];
  for (const pkg of Object.keys(current).sort()) {
    const prior = mark.packages[pkg];
    if (!prior) {
      unmarked.push(pkg);
      continue;
    }
    for (const counter of COUNTERS) {
      if (current[pkg][counter] > prior[counter]) {
        exceeded.push({
          package: pkg,
          counter,
          current: current[pkg][counter],
          mark: prior[counter],
        });
      }
    }
  }
  return { exceeded, unmarked };
}

/** Marked packages that vanished from the artifact — a stale or misscoped run. */
export function missingFromArtifact(
  current: Record<string, Counts>,
  mark: AssertionMark,
): string[] {
  return Object.keys(mark.packages)
    .filter((pkg) => !(pkg in current))
    .sort();
}

export function renderExceeded(exceeded: Violation[], markPath: string): string {
  return [
    "",
    "assertion-mismatch ratchet: assertion-level debt GREW inside name-matched tests.",
    "",
    ...exceeded.map(
      (v) =>
        `  ${v.package}  ${COUNTER_LABELS[v.counter]}: ${v.current} (mark ${v.mark}, ` +
        `+${v.current - v.mark})`,
    ),
    "",
    "A matched test now asserts a different number of things, different kinds of things, or",
    "different literal values than its Rails counterpart. Read the Rails test and converge the",
    "port's assertions — `pnpm test:compare --assertions` has the per-test breakdown.",
    `The mark in ${markPath} only shrinks; it is never raised to admit new debt.`,
  ].join("\n");
}

export function renderUnmarked(unmarked: string[], markPath: string): string {
  return [
    "",
    `assertion-mismatch ratchet: ${unmarked.length} package(s) are absent from ${markPath}:`,
    ...unmarked.map((p) => `  ${p}`),
    "An unmarked package would let its whole assertion debt in unmeasured. Seed it with",
    "`pnpm test:assertions:ratchet:reseed`.",
  ].join("\n");
}

export function renderMissing(missing: string[], markPath: string): string {
  return [
    "",
    `assertion-mismatch ratchet: ${missing.length} marked package(s) are absent from the artifact:`,
    ...missing.map((p) => `  ${p}`),
    "That is a partial-scope run (a `--package` filter, an unfetched vendor source), not",
    `convergence. Re-run the full comparison before trusting ${markPath}.`,
  ].join("\n");
}

export function renderWriteSummary(mark: AssertionMark, markPath: string): string {
  return [
    `Wrote ${markPath}:`,
    ...Object.keys(mark.packages)
      .sort()
      .map(
        (pkg) =>
          `  ${pkg}  ` +
          COUNTERS.map((c) => `${COUNTER_LABELS[c]}=${mark.packages[pkg][c]}`).join("  "),
      ),
  ].join("\n");
}
