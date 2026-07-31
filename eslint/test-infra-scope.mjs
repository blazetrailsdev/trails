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
 * Repo-relative roots the `no-internal-canonical-loaders` guard test walks when
 * hunting for modules that export a banned loader.
 *
 * `isCanonicalSchemaModule` matches on module basename with no package
 * anchoring, so a loader relocated into ANY workspace package — or into a
 * top-level `scripts/` helper — is invisible to the rule's pinned module list
 * and reopens the ban silently. Scanning only `packages/activerecord/src` left
 * exactly that hole one level up, so the scan spans the whole workspace.
 */
export const canonicalLoaderScanRoots = ["packages", "scripts"];

/**
 * `files` globs the `no-internal-canonical-loaders` rule is wired to.
 *
 * Discovery and enforcement are two surfaces: the scan above keeps the rule's
 * pinned module list honest, but the rule only ever runs against files matching
 * these globs, so a test file outside them could import a banned loader and
 * never be linted at all. Both are derived from the same roots so widening one
 * widens the other; the pin in `no-internal-canonical-loaders.test.mjs` fails if
 * `eslint.config.mjs` drifts from this list.
 */
export const canonicalLoaderEnforcedGlobs = ["packages/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];

/**
 * Scan roots ESLint cannot enforce in, because `eslint.config.mjs` puts them in
 * its top-level `ignores` — no rule runs there at all, so a glob for them would
 * be a lie. They stay in the discovery scan: a loader *module* relocated into
 * one is still caught and forced into `canonicalLoaderModules`. The pin in
 * `no-internal-canonical-loaders.test.mjs` re-derives this from the config's
 * real ignore list, so un-ignoring `scripts/` fails until enforcement widens
 * with it.
 */
export const canonicalLoaderUnenforceableRoots = ["scripts"];

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
  `${activerecordSrcRoot}/support/load-schema-helper-uuid-default.trails.test.ts`,
  // …and a third: the cover for `loadSchema`'s own arm-probe guard, which has
  // to call `loadSchema` to assert it refuses a stubbed `createTable`.
  `${activerecordSrcRoot}/support/load-schema-helper-arm-guard.trails.test.ts`,
  // …and the pin on `STUBBED_DDL_METHODS`, which drives `loadCanonicalSchema`
  // through a recording proxy to assert the guarded set still covers every
  // adapter member the lay path touches.
  `${activerecordSrcRoot}/support/stubbed-ddl-methods.test.ts`,
];
