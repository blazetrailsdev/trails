// Declarations for the `expected-fixtures` rule module, which is authored as
// `.mjs` so ESLint's flat config can load it without a build step. Only
// `scripts/test-deps/build-fixture-baseline.ts` imports it from TypeScript;
// the rule itself and eslint.config.mjs consume the `.mjs` directly. Keep this
// in step with the module's exports — a signature that drifts here is not
// caught anywhere else.

/** Trails test path (any separator) → Rails cases-relative path, or null. */
export function trailsToRailsRel(absOrRelPath: string): string | null;

/** Inverse of `trailsToRailsRel`. */
export function railsToTrailsRel(railsRel: string): string;

/**
 * The camelized subset of `entry.fixtures` that at least one Rails test in
 * `entry.tests` actually dereferences. Structurally typed rather than tied to
 * `FileDeps` so the rule module keeps no dependency on the scripts tree.
 */
export function requiredFixtureSets(entry: {
  fixtures?: string[];
  tests?: Record<string, { fixtures?: Record<string, unknown> }>;
}): string[];

/** Walk an already-parsed ESTree program collecting all `useFixtures` keys. */
export function collectUseFixturesKeys(programNode: unknown): {
  found: boolean;
  keys: Set<string>;
};

/** The ESLint rule itself, typed opaquely: no consumer in the TS program uses it. */
declare const rule: unknown;
export default rule;
