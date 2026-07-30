/**
 * Single source of truth for the activerecord test-infra lint scope.
 *
 * `require-table-teardown` and `require-canonical-rebuild` both exempt the same
 * set of test-infra paths (those files exercise createTable/dropTable and the
 * canonical loaders as the subject under test), and
 * `no-internal-canonical-loaders` allowlists the canonical loaders' own unit
 * tests. Those lists used to be spelled out separately in each config block and
 * inside the rule, so any RFC-0064 test-infra file move had to touch several of
 * them — and a miss stayed silent until CI lint ran (that is what bit PR #5395).
 * They now all derive from the declarations below: move a test-infra file, edit
 * exactly this file.
 *
 * `no-raw-sql`'s own scope lives in eslint/no-raw-sql-scope.mjs and shares the
 * root constant from here.
 */

/** Root every scope list below is anchored to (repo-relative). */
export const activerecordSrcRoot = "packages/activerecord/src";

/**
 * Test-infra paths exempt from the table-lifecycle rules, relative to
 * `activerecordSrcRoot`. `fixtures.ts` / `test-fixtures.ts` are anchored as
 * exact ported files rather than by basename — see no-raw-sql-scope.mjs.
 */
const testInfraExemptGlobs = [
  "test-helpers/**",
  "support/**",
  "fixtures.test.ts",
  "naked-fixtures.test.ts",
  "test-fixtures.test.ts",
  "test-fixtures/**",
];

/** The same list as repo-relative globs, for flat-config `ignores`. */
export const testInfraExemptIgnores = testInfraExemptGlobs.map(
  (glob) => `${activerecordSrcRoot}/${glob}`,
);

/**
 * Internal canonical-schema loader modules, by basename (they live in
 * `support/`, which the exemption list above already scopes out wholesale).
 * `no-internal-canonical-loaders` matches imports against these and allowlists
 * their own unit tests.
 */
export const canonicalLoaderModules = [
  "canonical-schema",
  "canonical-table-rebuild",
  "load-schema-helper",
];

/** Each loader module's own unit test (repo-relative), allowed to import it. */
export const canonicalLoaderSelfTests = [
  ...canonicalLoaderModules.map((name) => `${activerecordSrcRoot}/support/${name}.test.ts`),
  // `load-schema-helper` has a second self-test: the trails-only guard on the
  // boot-laid table snapshot the adapter-specific arm feeds.
  `${activerecordSrcRoot}/support/load-schema-helper.trails.test.ts`,
  // ...and a third: the cover on the PG arm's non-pgcrypto `uuid_default`
  // branch, which drives the adapter-specific half against a probe adapter.
  `${activerecordSrcRoot}/support/load-schema-helper-uuid-default.trails.test.ts`,
];
