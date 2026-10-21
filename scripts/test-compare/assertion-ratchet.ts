/**
 * Only-shrink ratchet for the ASSERTION-LEVEL fidelity counters (RFC 0025).
 *
 * `pnpm parity:test` measures three divergences inside name-MATCHED tests and
 * writes them to output/convention-comparison.json as per-package totals:
 * `totalAssertionMismatch` (different NUMBER of assertions), `totalKindMismatch`
 * (same count, divergent KINDS), `totalValueMismatch` (same kinds, divergent
 * literal EXPECTED VALUES). They were advisory, so a newly ported test could
 * assert less than its Rails counterpart and still count as matched.
 *
 * This pins them per package per counter against the same artifact as main's
 * CI wrote it for the base commit (RFC 0127): nothing is committed, so there is
 * no mark to reseed or tighten and no merge conflict on one. The arm is
 * AGGREGATE — the guarantee is "assertion-level debt never grows", not "every
 * remaining mismatch was reviewed". See CONTRIBUTING.md "Measuring progress".
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
/** The three assertion-level counters, in report order. */
export const COUNTERS = ["assertionCount", "kind", "value"] as const;

export type Counter = (typeof COUNTERS)[number];

/** Human label per counter, matching the `parity:test` summary tokens. */
export const COUNTER_LABELS: Record<Counter, string> = {
  assertionCount: "assertion-count-mismatch",
  kind: "assertion-kind-mismatch",
  value: "assertion-value-mismatch",
};

export type Counts = Record<Counter, number>;

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

export interface Violation {
  package: string;
  counter: Counter;
  current: number;
  base: number;
}

/**
 * Counters above their base count, plus packages the base never measured that
 * carry debt. A newly enrolled package with every counter at zero brings no
 * debt in, so it is admitted and becomes its own base once main measures it.
 */
export function violations(
  current: Record<string, Counts>,
  base: Record<string, Counts>,
): { exceeded: Violation[]; unmarked: string[] } {
  const exceeded: Violation[] = [];
  const unmarked: string[] = [];
  for (const pkg of Object.keys(current).sort()) {
    const prior = base[pkg];
    if (!prior) {
      if (COUNTERS.some((counter) => current[pkg][counter] > 0)) unmarked.push(pkg);
      continue;
    }
    for (const counter of COUNTERS) {
      if (current[pkg][counter] > prior[counter]) {
        exceeded.push({
          package: pkg,
          counter,
          current: current[pkg][counter],
          base: prior[counter],
        });
      }
    }
  }
  return { exceeded, unmarked };
}

/** Base packages that vanished from the artifact — a stale or misscoped run. */
export function missingFromArtifact(
  current: Record<string, Counts>,
  base: Record<string, Counts>,
): string[] {
  return Object.keys(base)
    .filter((pkg) => !(pkg in current))
    .sort();
}

export function renderExceeded(exceeded: Violation[], basePath: string): string {
  return [
    "",
    "assertion-mismatch ratchet: assertion-level debt GREW inside name-matched tests.",
    "",
    ...exceeded.map(
      (v) =>
        `  ${v.package}  ${COUNTER_LABELS[v.counter]}: ${v.current} (base ${v.base}, ` +
        `+${v.current - v.base})`,
    ),
    "",
    "A matched test now asserts a different number of things, different kinds of things, or",
    "different literal values than its Rails counterpart. Read the Rails test and converge the",
    "port's assertions — `pnpm parity:test --assertions` has the per-test breakdown.",
    `Each counter only shrinks against ${basePath}.`,
  ].join("\n");
}

export function renderUnmarked(unmarked: string[], basePath: string): string {
  return [
    "",
    `assertion-mismatch ratchet: ${unmarked.length} package(s) are absent from ${basePath}:`,
    ...unmarked.map((p) => `  ${p}`),
    "A package the base never measured would let its whole assertion debt in unmeasured.",
    "Converge its matched-test assertion debt to zero before enrolling it.",
  ].join("\n");
}

export function renderMissing(missing: string[], basePath: string): string {
  return [
    "",
    `assertion-mismatch ratchet: ${missing.length} base package(s) are absent from the artifact:`,
    ...missing.map((p) => `  ${p}`),
    "That is a partial-scope run (a `--package` filter, an unfetched vendor source), not",
    `convergence. Re-run the full comparison before gating against ${basePath}.`,
  ].join("\n");
}
