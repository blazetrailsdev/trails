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
export const activerecordSrcRoot = "packages/activerecord/lib";

/** Root of the activerecord test tree, which the test-infra lists below are anchored to. */
export const activerecordTestRoot = "packages/activerecord/test";

/**
 * Repo-relative roots the `no-internal-canonical-loaders` guard test walks when
 * hunting for modules that export a banned loader.
 *
 * `isCanonicalSchemaModule` matches on module basename with no package
 * anchoring, so a loader relocated into ANY workspace package — or into a
 * top-level `scripts/` helper — is invisible to the rule's pinned module list
 * and reopens the ban silently. Scanning only `packages/activerecord/lib` left
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
export const canonicalLoaderEnforcedGlobs = [
  "packages/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
  "scripts/**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
];

/**
 * Scan roots ESLint cannot enforce in, because `eslint.config.mjs` puts them in
 * its top-level `ignores` — no rule runs there at all, so a glob for them would
 * be a lie. They stay in the discovery scan: a loader *module* relocated into
 * one is still caught and forced into `canonicalLoaderModules`. The pin in
 * `no-internal-canonical-loaders.test.mjs` re-derives this from the config's
 * real ignore list, so re-ignoring a scan root fails until enforcement narrows
 * with it. Empty since `scripts/` came out of the global ignores.
 */
/** @type {string[]} */
export const canonicalLoaderUnenforceableRoots = [];

/**
 * Test-infra paths exempt from the table-lifecycle rules, relative to
 * `activerecordTestRoot`. `fixtures.ts` / `test-fixtures.ts` are anchored as
 * exact ported files rather than by basename — see no-raw-sql-scope.mjs.
 */
const testInfraExemptGlobs = [
  "models/**",
  "fixtures/**",
  "migrations/**",
  "support/**",
  "cases/support/**",
  "cases/fixtures.test.ts",
  "cases/naked-fixtures.trails.test.ts",
  "cases/test-fixtures.test.ts",
  "cases/test-fixtures/**",
];

/** The test-infra that stays under `activerecordSrcRoot`, because library
 *  files import it, relative to that root. */
const libTestInfraExemptGlobs = ["test-helpers/**", "test-fixtures/**"];

/** The same list as repo-relative globs, for flat-config `ignores`. */
export const testInfraExemptIgnores = [
  ...testInfraExemptGlobs.map((glob) => `${activerecordTestRoot}/${glob}`),
  ...libTestInfraExemptGlobs.map((glob) => `${activerecordSrcRoot}/${glob}`),
];

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
  // `canonical-schema` / `canonical-table-rebuild` are trails inventions, so
  // their self-tests carry the `.trails.` marker (RFC 0078). Rails' own
  // `test/support/load_schema_helper.rb` has no test file, so
  // `load-schema-helper`'s self-tests are trails inventions too — the two
  // former siblings (the `loadSchema` table-set assertion and the trails-only
  // guard on the boot-laid table snapshot) now live in one `.trails.` file.
  `${activerecordTestRoot}/cases/support/canonical-schema.trails.test.ts`,
  `${activerecordTestRoot}/cases/support/canonical-table-rebuild.trails.test.ts`,
  `${activerecordTestRoot}/cases/support/load-schema-helper.trails.test.ts`,
  `${activerecordTestRoot}/cases/support/load-schema-helper-uuid-default.trails.test.ts`,
  // …and a third: the cover for `loadSchema`'s own arm-probe guard, which has
  // to call `loadSchema` to assert it refuses a stubbed `createTable`.
  `${activerecordTestRoot}/cases/support/load-schema-helper-arm-guard.trails.test.ts`,
  // …and the pin on `STUBBED_DDL_METHODS`, which drives `loadCanonicalSchema`
  // through a recording proxy to assert the guarded set still covers every
  // adapter member the lay path touches.
  `${activerecordTestRoot}/cases/support/stubbed-ddl-methods.trails.test.ts`,
];
