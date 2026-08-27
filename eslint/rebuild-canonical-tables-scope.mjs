/**
 * Shared scope + baseline reader for the RFC 0079 `rebuildCanonicalTables`
 * ratchet (`no-new-rebuild-canonical-tables`).
 *
 * Kept beside the rule rather than inside it so the rule's own test and the
 * manifest-completeness test read the baseline through exactly the path
 * resolution the rule uses — a mismatch there is how a ratchet silently stops
 * guarding.
 */

import { readFileSync } from "fs";

/**
 * The frozen caller baseline: repo-relative path -> allowed call-site count.
 * The `"//"` key carries the file's own contract note and is not a path.
 */
export const REBUILD_CALLERS = Object.fromEntries(
  Object.entries(
    JSON.parse(
      readFileSync(new URL("./rebuild-canonical-tables-callers.json", import.meta.url), "utf8"),
    ),
  ).filter(([key]) => key !== "//"),
);

/**
 * The helper's own module and its self-coverage tests, exempt from the ratchet:
 * they are deleted along with the helper by RFC 0079's final story, so a path
 * allowance for them would be debt that exists only to be deleted.
 */
export const HELPER_MODULES = [
  "packages/activerecord/src/support/canonical-table-rebuild.ts",
  "packages/activerecord/src/support/canonical-table-rebuild.trails.test.ts",
  "packages/activerecord/src/support/canonical-table-rebuild-bulk-inbound-fk.trails.test.ts",
];

/**
 * Repo-relative path under `packages/` or `scripts/`; null when the filename
 * sits outside both. Mirrors `repoRel` in no-internal-canonical-loaders.mjs —
 * RuleTester passes bare repo-relative filenames while a real run passes
 * absolute ones, and both have to key the baseline identically.
 */
export function repoRel(filename) {
  const norm = String(filename).replace(/\\/g, "/");
  const m = norm.match(/(?:^|\/)((?:packages|scripts)\/.+)$/);
  return m ? m[1] : null;
}

/** True when `filename` is the helper's own module or one of its self-coverage tests. */
export function isRebuildHelperModule(filename) {
  const rel = repoRel(filename);
  return rel !== null && HELPER_MODULES.includes(rel);
}

/**
 * Allowed call-site count for `filename`, or null when the file is not in the
 * baseline at all (which means: may not call the helper).
 *
 * A path outside `packages/`/`scripts/` also yields null, and deliberately so:
 * it has no key the baseline could ever hold, which makes it an unlisted caller
 * rather than an exempt one. The rule's `files` globs already keep it off those
 * trees today; folding the two cases together means widening the globs later
 * catches a stray caller instead of silently exempting a whole directory.
 */
export function rebuildCallerAllowance(filename) {
  const rel = repoRel(filename);
  if (rel === null) return null;
  return Object.prototype.hasOwnProperty.call(REBUILD_CALLERS, rel) ? REBUILD_CALLERS[rel] : null;
}
