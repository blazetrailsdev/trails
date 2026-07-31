// @ts-check

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import vitest from "@vitest/eslint-plugin";
import noNodeBuiltins from "./eslint/no-node-builtins.mjs";
import noProcessBypass from "./eslint/no-process-bypass.mjs";
import railsPrivateJsdoc from "./eslint/rails-private-jsdoc.mjs";
import railsErrorParity from "./eslint/rails-error-parity.mjs";
import railsCallbackInvocations from "./eslint/rails-callback-invocations.mjs";
import railsArelTosql from "./eslint/rails-arel-tosql.mjs";
import railsDeprecatedJsdoc from "./eslint/rails-deprecated-jsdoc.mjs";
import nieRequiresAnnotation from "./eslint/nie-requires-annotation.mjs";
import noNativeDate from "./eslint/no-native-date.mjs";
import noGetterCalledAsMethod from "./eslint/no-getter-called-as-method.mjs";
import sqliteDriverAwait from "./eslint/sqlite-driver-await.mjs";
import preferAwaitRelation from "./eslint/prefer-await-relation.mjs";
import railsFileStructureMethodOrder, {
  isManifestAvailable as railsFileStructureManifestAvailable,
} from "./eslint/rails-file-structure-method-order.mjs";
import expectedFixtures from "./eslint/expected-fixtures.mjs";
import manifestComplete from "./eslint/manifest-complete.mjs";
import testFixtureParity from "./eslint/test-fixture-parity.mjs";
import requireTableTeardown from "./eslint/require-table-teardown.mjs";
import requireCanonicalRebuild from "./eslint/require-canonical-rebuild.mjs";
import noRawSql from "./eslint/no-raw-sql.mjs";
import { noRawSqlFiles, noRawSqlIgnores } from "./eslint/no-raw-sql-scope.mjs";
import {
  canonicalLoaderEnforcedGlobs,
  testInfraExemptIgnores,
} from "./eslint/test-infra-scope.mjs";
import noStandaloneAssociations from "./eslint/no-standalone-associations.mjs";
import noInternalCanonicalLoaders from "./eslint/no-internal-canonical-loaders.mjs";
import noLoadSchemaWithStubbedDdl from "./eslint/no-load-schema-with-stubbed-ddl.mjs";
import noExplicitAnyDisable from "./eslint/no-explicit-any-disable.mjs";
import noRawControlBytes from "./eslint/no-raw-control-bytes.mjs";
import { readFileSync } from "node:fs";

// See the rails-file-structure-method-order block below: without real order
// data the rule passes every file, so we register it only when the manifest
// has data, and announce the skip instead of pretending to enforce.
const railsFileStructureManifestReady = railsFileStructureManifestAvailable();
if (!railsFileStructureManifestReady) {
  console.warn(
    "[eslint.config] rails-file-structure-method-order NOT registered: " +
      "eslint/rails-file-structure-method-order.json has no order data " +
      "(run `pnpm api:compare` to build it). Method order is enforced by the " +
      "Rails API/Test Comparison CI job, not this run.",
  );
}

/** @type {string[]} */
const noExplicitAnySrcExclude = JSON.parse(
  readFileSync(new URL("./eslint/no-explicit-any-src-exclude.json", import.meta.url), "utf8"),
);
/** @type {string[]} */
const noExplicitAnyTestExclude = JSON.parse(
  readFileSync(new URL("./eslint/no-explicit-any-test-exclude.json", import.meta.url), "utf8"),
);
// AR test files with a backlog of un-torn-down raw `CREATE TABLE` SQL strings.
// They keep the createTable/dropTable helper check but opt out of the raw-SQL
// balance (`rawSql: false`) until ported. Ratchet this to zero — see
// eslint/require-table-teardown.mjs.
/** @type {string[]} */
const requireTableTeardownRawSqlExclude = JSON.parse(
  readFileSync(
    new URL("./eslint/require-table-teardown-raw-sql-exclude.json", import.meta.url),
    "utf8",
  ),
);
// AR test files exempt from require-canonical-rebuild, in two permanent groups.
// `privateAdapter` files own an adapter of their own — a `:memory:` database or
// a throwaway file under a per-test tmpdir — so a canonical table they drop
// cannot drift the shared per-worker database. `nonExecuting` files name a
// canonical table in a drop that never reaches a database at all: SQL captured
// for assertion, or a hand-rolled fake adapter. Neither group is backlog; a
// file that really does leave a canonical table dropped belongs in neither and
// must be fixed. See eslint/require-canonical-rebuild.mjs.
/** @type {{ privateAdapter: string[], nonExecuting: string[] }} */
const requireCanonicalRebuildExclude = JSON.parse(
  readFileSync(new URL("./eslint/require-canonical-rebuild-exclude.json", import.meta.url), "utf8"),
);

/**
 * The canonical table names — the top-level keys of `TEST_SCHEMA` in
 * test-helpers/test-schema.ts, which the lint rule needs but cannot import
 * (it is TypeScript). Read from the source so the list can never drift: the
 * object's table keys are the only ones at two-space indent, column keys
 * nesting one level deeper. A parse that comes back near-empty would silently
 * disable the rule, so it fails loudly instead.
 */
function canonicalTableNames() {
  const source = readFileSync(
    new URL("./packages/activerecord/src/test-helpers/test-schema.ts", import.meta.url),
    "utf8",
  );
  const declaration = source.slice(source.indexOf("export const TEST_SCHEMA"));
  const body = declaration.slice(0, declaration.indexOf("\n};"));
  const names = [...body.matchAll(/^ {2}"?([\w.]+)"?: [{[]/gm)].map((m) => m[1]);
  if (names.length < 100) {
    throw new Error(
      `canonicalTableNames(): parsed only ${names.length} tables from test-schema.ts — the TEST_SCHEMA layout changed and require-canonical-rebuild would silently stop guarding.`,
    );
  }
  return names;
}
/** @type {string[]} */
const canonicalTables = canonicalTableNames();

export default defineConfig(
  {
    ignores: [
      "vendor/**",
      "**/dist/**",
      "packages/website/static/**",
      "packages/website/build/**",
      // Vite/Vitest config files outside any tsconfig program — the typed
      // parser's project service cannot resolve them when linted by path.
      "packages/website/vite.sw.config.ts",
      "packages/website/vitest.config.ts",
      "packages/activerecord/src/type-virtualization/fixtures/**",
      // Input samples for the codemods that read them — `strip-asany`'s fixture
      // is a file full of `as any` by construction, and the parity fixtures are
      // snapshots of generated output. Linting either would be linting data.
      "scripts/__fixtures__/**",
      "scripts/parity/fixtures/**",
      "packages/activerecord-cli/src/tsc-wrapper/__fixtures__/**",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // The rule tests run under vitest, where RuleTester picks up the injected
    // describe/it globals; the hooks around them are equally global.
    files: ["eslint/*.test.mjs"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    languageOptions: {
      globals: {
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        process: "readonly",
        console: "readonly",
        performance: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        btoa: "readonly",
        atob: "readonly",
        Blob: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // ── no-node-builtins (browser compat) ──
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      // Adapter implementations — these ARE the abstraction layer
      "packages/activesupport/src/fs-adapter.ts",
      "packages/activesupport/src/crypto-adapter.ts",
      "packages/activesupport/src/async-context-adapter.ts",
      "packages/activesupport/src/child-process-adapter.ts",
      "packages/activesupport/src/os-adapter.ts",
      // Node-only modules exposed via subpath imports (no browser equivalent)
      "packages/activerecord-cli/src/tsc-wrapper/**",
      "packages/activerecord/src/sqlite/node-sqlite.ts",
      "packages/activerecord/src/sqlite/expo-sqlite.ts",
      "packages/activesupport/src/gzip.ts",
      "packages/rack/src/deflater.ts",
      "packages/activerecord/src/encryption/config.ts",
      "packages/activerecord/src/encryption/context.ts",
      "packages/activerecord/src/connection-handling.ts",
      // MigrationProxy uses createRequire for synchronous file loading — Node-only
      "packages/activerecord/src/deprecator.ts",
      // Migrator.fromDir scans filesystem and uses pathToFileURL for ESM import — Node-only
      "packages/activerecord/src/migration.ts",
    ],
    rules: {
      "blazetrails/no-node-builtins": "error",
    },
  },

  // ── blazetrails plugin (no-node-builtins + no-process-bypass + rails-private-jsdoc + no-native-date + sqlite-driver-await) ──
  // Registered without a `files` restriction so any block below can
  // reference its rules without re-declaring the plugin.
  {
    plugins: {
      blazetrails: {
        rules: {
          "no-node-builtins": noNodeBuiltins,
          "no-process-bypass": noProcessBypass,
          "rails-private-jsdoc": railsPrivateJsdoc,
          "rails-error-parity": railsErrorParity,
          "rails-callback-invocations": railsCallbackInvocations,
          "rails-arel-tosql": railsArelTosql,
          "rails-deprecated-jsdoc": railsDeprecatedJsdoc,
          "no-native-date": noNativeDate,
          "no-getter-called-as-method": noGetterCalledAsMethod,
          "sqlite-driver-await": sqliteDriverAwait,
          "prefer-await-relation": preferAwaitRelation,
          "nie-requires-annotation": nieRequiresAnnotation,
          "rails-file-structure-method-order": railsFileStructureMethodOrder,
          "expected-fixtures": expectedFixtures,
          "test-fixture-parity": testFixtureParity,
          "require-table-teardown": requireTableTeardown,
          "require-canonical-rebuild": requireCanonicalRebuild,
          "no-raw-sql": noRawSql,
          "no-standalone-associations": noStandaloneAssociations,
          "no-internal-canonical-loaders": noInternalCanonicalLoaders,
          "no-load-schema-with-stubbed-ddl": noLoadSchemaWithStubbedDdl,
          "no-explicit-any-disable": noExplicitAnyDisable,
          "no-raw-control-bytes": noRawControlBytes,
          // Off by default — opt in per project (see eslint/manifest-complete.mjs).
          "manifest-complete": manifestComplete,
        },
      },
    },
  },

  // ── no-process-bypass: forbid direct process.* in browser-target src ──
  // process.* must go through @blazetrails/activesupport/process-adapter
  // so these packages can run on browser/non-Node hosts. Test files are
  // always exempt (legit mocking/inspection of the host process).
  // Per-package exemptions noted inline.
  {
    files: [
      "packages/trailties/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/arel/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      // trailties: app-generator.ts contains template strings emitting
      // user-app code (which legitimately uses process.* at runtime in
      // the user's app).
      "packages/trailties/src/generators/app-generator.ts",
    ],
    rules: {
      "blazetrails/no-process-bypass": "error",
    },
  },

  // ── no-native-date (Temporal migration safety net) ──
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/rack/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/trailties/src/**/*.ts",
      "packages/website/src/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      "**/*.test-d.ts",
      // Temporal bridge — the canonical Date↔Instant adapter.
      "packages/activesupport/src/temporal.ts",
      // Test infrastructure: travelTo, fixture helpers, etc.
      "packages/activesupport/src/testing/**",
      "packages/activesupport/src/testing-helpers.ts",
    ],
    rules: {
      "blazetrails/no-native-date": "error",
    },
  },

  // ── no-getter-called-as-method ──
  // `hasChangesToSave` is a getter on Model.prototype, but Ruby's
  // uniform-access principle means a port transcribed from Rails'
  // `record.has_changes_to_save?` naturally comes out as a call. `tsc` cannot
  // catch it behind an `as any`, which is how six association call sites drifted
  // (four dead `typeof … === "function"` gates, two raising `?.()`).
  {
    files: ["packages/*/src/**/*.ts"],
    rules: {
      "blazetrails/no-getter-called-as-method": "error",
    },
  },

  // ── rails-private-jsdoc (per-package rollout; widen as packages adopt) ──
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-private-jsdoc": "error",
    },
  },

  // ── rails-error-parity: every in-scope file must mirror Rails' error-class
  //    hierarchy (name + parent) for the manifest classes mapped to it — not
  //    just errors.ts, since ActiveSupport scatters error classes across many
  //    files — and Rails-mirroring source must throw
  //    ported error classes rather than the bare global `Error`. Manifest:
  //    eslint/rails-error-classes.json (built by
  //    `pnpm tsx scripts/build-rails-error-manifest.ts`). Pre-existing
  //    violators are grandfathered in eslint/rails-error-parity-exclude.json
  //    and ratcheted down. ──
  {
    files: [
      "packages/activerecord/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-error-parity": "error",
    },
  },

  // ── rails-callback-invocations: a ported ActiveRecord method whose Rails
  //    counterpart fires lifecycle callbacks (`_run_<event>_callbacks` /
  //    `run_callbacks(:event)`) must keep firing them via
  //    `runCallbacks("<event>")` / `runAllCallbacks`. Manifest:
  //    eslint/rails-callback-invocations.json (built by
  //    `pnpm tsx scripts/build-rails-privates-manifest.ts`, refreshed on
  //    `pnpm api:compare`). Pre-existing violators are grandfathered in
  //    eslint/rails-callback-invocations-exclude.json and ratcheted down. ──
  {
    files: ["packages/activerecord/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-callback-invocations": "error",
    },
  },

  // ── rails-arel-tosql: a class may define `toSql`/`toSqlAndBinds` only if
  //    its Rails counterpart defines `to_sql`/`to_sql_and_binds`. Enforces
  //    Arel fidelity — build SQL through real Arel AST nodes + visitors, not
  //    hand-mashed strings. Allow-set: eslint/rails-tosql-classes.json (built
  //    by `pnpm tsx scripts/build-rails-tosql-manifest.ts` from the api-compare
  //    manifest). ──
  {
    files: [
      "packages/activerecord/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/arel/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-arel-tosql": "error",
    },
  },

  // ── rails-deprecated-jsdoc (deprecation parity) ──
  // Requires `@deprecated` JSDoc where Rails deprecates the same method.
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/rails-deprecated-jsdoc": "error",
    },
  },

  // ── rails-file-structure-method-order (per-package rollout) ──
  // Method-order slice of the rails-file-structure rule family
  // (docs/rails-file-structure-mirror-plan.md). Enforces that class
  // members + top-level functions match the Rails source order
  // documented in `eslint/rails-file-structure-method-order.json` (built
  // by `pnpm tsx scripts/build-rails-file-structure-manifest.ts`,
  // invoked by `pnpm api:compare`). Autofixable.
  //
  // Enforcement lives in the Rails API/Test Comparison job, the only job that
  // builds rails-api.json. Everywhere else (the Lint job, a local `pnpm lint`
  // without a compare run) the manifest is the builder's empty fallback, under
  // which the rule passes every file. Registering it there would advertise
  // enforcement that cannot happen, so we skip the block and say so out loud.
  ...(railsFileStructureManifestReady
    ? [
        {
          files: ["packages/arel/src/**/*.ts", "packages/activemodel/src/**/*.ts"],
          ignores: ["**/*.test.ts"],
          rules: {
            "blazetrails/rails-file-structure-method-order": "error",
          },
        },
      ]
    : []),

  // ── nie-requires-annotation: every `throw new NotImplementedError` must
  // carry a `// @nie disposition=…` comment. Tracks the elimination
  // initiative (tracked as stories in the tasks repo; see `pnpm tasks`).
  {
    files: [
      "packages/activerecord/src/**/*.ts",
      "packages/actionpack/src/**/*.ts",
      "packages/actionview/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
      "packages/arel/src/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/nie-requires-annotation": "error",
    },
  },

  // ── expected-fixtures: activerecord test files must load Rails-declared
  //    fixture sets via useFixtures({...}). Files currently lacking it are
  //    tracked in eslint/expected-fixtures-exclude.json and ratcheted down
  //    as porters migrate. See eslint/expected-fixtures.mjs. ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    rules: {
      "blazetrails/expected-fixtures": "error",
    },
  },

  // ── test-fixture-parity: hard-gate active tests whose Rails counterpart
  //    uses fixtures but which call no fixture accessor in their it() body.
  //    Skipped tests (it.skip/.todo, describe.skip) are exempt — they are the
  //    migration backlog. Files not yet ported off inline models are listed in
  //    eslint/test-fixture-parity-exclude.json and ratcheted down as porters
  //    adopt useFixtures. Mapping: eslint/test-fixture-parity.json (committed). ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    rules: {
      "blazetrails/test-fixture-parity": "error",
    },
  },
  // ── require-table-teardown: every createTable("foo") in an AR test must be
  //    balanced by an explicit dropTable("foo") in the same file, and the
  //    carpet-bomb dropAllTables() is forbidden. Leaked tables collide with
  //    sibling files under parallel forks. test-helpers/** is exempt — those
  //    tests exercise createTable/dropTable/dropAllTables as the subject under
  //    test. Each drop must also sit where a failed assertion still reaches it
  //    — an afterEach/afterAll or a finally (`failureSafe`, on by default), as
  //    Rails' `teardown` does. See eslint/require-table-teardown.mjs. ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    ignores: testInfraExemptIgnores,
    rules: {
      "blazetrails/require-table-teardown": ["error", { rawSql: true }],
    },
  },
  // Grandfathered: files with an un-torn-down raw `CREATE TABLE` backlog keep
  // the helper check but opt out of raw-SQL balancing. Ratchet to zero. Spread
  // conditionally — flat config rejects an empty `files` array once the list is
  // burned down.
  ...(requireTableTeardownRawSqlExclude.length
    ? [
        {
          files: requireTableTeardownRawSqlExclude,
          rules: {
            "blazetrails/require-table-teardown": ["error", { rawSql: false }],
          },
        },
      ]
    : []),

  // ── require-canonical-rebuild: a test file that drops a canonical table
  //    (a TEST_SCHEMA key) must restore it in the same file, via
  //    rebuildCanonicalTables() (support/canonical-table-rebuild.ts) or
  //    loadCanonicalSchema() (support/canonical-schema.ts). A canonical table left
  //    dropped drifts the shared per-worker database for the next file.
  //    test-helpers/** is exempt — the canonical loaders are its subject under
  //    test. See eslint/require-canonical-rebuild.mjs. ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    ignores: [
      ...testInfraExemptIgnores,
      ...requireCanonicalRebuildExclude.privateAdapter,
      ...requireCanonicalRebuildExclude.nonExecuting,
    ],
    rules: {
      "blazetrails/require-canonical-rebuild": ["error", { canonicalTables }],
    },
  },

  // ── no-raw-sql: ban raw SQL strings passed to execution sinks (and the
  //    RFC-0022 `sql.replace`/`sql.concat` string-surgery pattern) outside the
  //    adapter/DDL layer. Build queries with @blazetrails/arel. The adapter
  //    layer, migrations, and schema dumpers legitimately render SQL and are
  //    excluded. The scope globs are the single source of truth shared with the
  //    rule's own filename check — see eslint/no-raw-sql-scope.mjs. ──
  {
    files: noRawSqlFiles,
    ignores: noRawSqlIgnores,
    rules: {
      "blazetrails/no-raw-sql": "error",
    },
  },

  // ── no-standalone-associations: associations must be declared in-class via
  //    `this.<macro>(…)` in a `static {}` block, not bolted on after the class
  //    with the standalone `Associations.<macro>.call(Model, …)` form. The
  //    in-class form lets materialize-model-declares.ts generate the `declare`
  //    accessors so `parent.children` reads naturally. Autofixable when the
  //    target class is same-file with a static block (else report-only).
  //    ~1.9k pre-existing sites are grandfathered in
  //    eslint/no-standalone-associations-exclude.json (a generated data file,
  //    refreshed by scripts/generate-standalone-associations-exclude.ts) and
  //    ratcheted down as sites convert; only NEW standalone usages fail.
  //    See eslint/no-standalone-associations.mjs. ──
  {
    files: ["packages/*/src/**/*.ts"],
    rules: {
      "blazetrails/no-standalone-associations": "error",
    },
  },

  // ── no-internal-canonical-loaders: a *.test.ts must not import the internal
  //    canonical loaders (loadCanonicalSchema in support/canonical-schema.ts,
  //    ensureCanonicalTables in support/canonical-table-rebuild.ts)
  //    directly — wire the canonical schema + fixtures through `fixtures({ ... })`.
  //    rebuildCanonicalTables is intentionally allowed (documented shared shield).
  //    Only canonical-schema.test.ts / canonical-table-rebuild.test.ts may
  //    import them, to test them directly (allowlisted in the rule).
  //    Enforced across every workspace package, not just activerecord: the
  //    loaders are matched by module basename, so a test file in another
  //    package reaching for one would otherwise never be linted at all.
  //    scripts/ is covered too: its tests are as able to reach for a loader as
  //    a package's, and nothing in the tree is globally ignored any more.
  //    See eslint/no-internal-canonical-loaders.mjs. ──
  {
    files: canonicalLoaderEnforcedGlobs,
    rules: {
      "blazetrails/no-internal-canonical-loaders": "error",
    },
  },

  // ── no-load-schema-with-stubbed-ddl: a test that stubs any DDL emitter the
  //    canonical half goes through (see
  //    packages/activerecord/src/support/stubbed-ddl-methods.ts) lays
  //    nothing on the database, so `loadSchema`'s canonical half would query
  //    tables that were never created (PR #5676). Those arm-content covers must
  //    call `loadAdapterSpecificSchema` directly. The self-test allowlist in
  //    no-internal-canonical-loaders lets `loadSchema` into exactly these
  //    files, so this rule is what closes the hole.
  //    See eslint/no-load-schema-with-stubbed-ddl.mjs. ──
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    // The guard cover is the one file that must do exactly what the rule
    // forbids: it stubs those emitters to assert `loadSchema` *refuses* such an
    // adapter (support/load-schema-helper.ts, assertNotArmProbe) instead of
    // running its canonical half.
    ignores: ["packages/activerecord/src/support/load-schema-helper-arm-guard.trails.test.ts"],
    rules: {
      "blazetrails/no-load-schema-with-stubbed-ddl": "error",
    },
  },

  // ── sqlite-driver-await: driver call sites must be awaited ──
  {
    files: [
      "packages/activerecord/src/connection-adapters/sqlite3/**/*.ts",
      "packages/activerecord/src/connection-adapters/sqlite3-adapter.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "blazetrails/sqlite-driver-await": "error",
    },
  },

  // ── prefer-await-relation: await relations directly, don't call .toArray() ──
  // Applies to both app code and test files across the ported packages.
  {
    files: [
      "packages/arel/src/**/*.ts",
      "packages/activemodel/src/**/*.ts",
      "packages/activerecord/src/**/*.ts",
      "packages/activesupport/src/**/*.ts",
    ],
    rules: {
      // `warn`, not `error`: `.toArray()` is the established relation
      // materializer across ~1700 call sites. Surfacing it advisory-only
      // (autofixable via `--fix`) lets the codebase converge to direct awaits
      // without breaking lint or forcing a mass rewrite in one PR.
      "blazetrails/prefer-await-relation": "error",
    },
  },

  // ── activemodel ──
  {
    files: ["packages/activemodel/src/**/*.ts"],
    rules: {
      "unused-imports/no-unused-vars": "off",
    },
  },
  {
    files: ["packages/activemodel/src/**/*.test.ts"],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      "vitest/no-disabled-tests": "off",
      "vitest/no-identical-title": "off",
      "vitest/expect-expect": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ── activerecord ──
  // Package-wide rule relaxations (src + tests). no-explicit-any is handled
  // separately below so it can ratchet per-area.
  {
    files: ["packages/activerecord/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-this-alias": "off",
      "unused-imports/no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-assignment": "off",
    },
  },
  // no-explicit-any is "error", ratcheted via a shrinking allowlist (RFC 0037).
  // src and tests get their own block so each area burns down independently.
  // The grandfathered violators live in
  // eslint/no-explicit-any-{src,test}-exclude.json (generated by
  // `pnpm lint:no-explicit-any:allowlist`) and are turned `off` by the trailing
  // override block below. Clean files are enforced now and cannot regress; a
  // burndown PR fixes files and drops their entries from the JSON. NEVER
  // hand-add an entry to silence a new violation — fix the `any`.
  {
    files: ["packages/activerecord/src/**/*.ts"],
    ignores: ["packages/activerecord/src/**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: ["packages/activerecord/src/**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  // Grandfathered no-explicit-any violators — turned off until burned down.
  // Must stay LAST of the activerecord blocks so it overrides the two above.
  {
    files: [...noExplicitAnySrcExclude, ...noExplicitAnyTestExclude],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // ── no-explicit-any-disable: forbid silencing `no-explicit-any` inline.
  //    With the rule at `error`, the workaround shifts from `as any` to an
  //    inline `eslint-disable`. Disabling the rule must itself be an error —
  //    fix the `any`. No allowlist; applies to src and tests. ──
  {
    files: ["packages/activerecord/src/**/*.ts"],
    rules: {
      "blazetrails/no-explicit-any-disable": "error",
    },
  },

  // ── no-raw-control-bytes: keep every source greppable. A raw NUL makes
  //    grep/ripgrep classify the file as binary and skip it silently, so an
  //    audit for a symbol gets a wrong answer (this happened to
  //    canonical-table-rebuild.ts). Write control characters as escapes. ──
  {
    files: ["**/*.ts", "**/*.mts", "**/*.mjs", "**/*.js"],
    rules: {
      "blazetrails/no-raw-control-bytes": "error",
    },
  },

  // ── no conditionals in tests (all packages except activerecord) ──
  {
    files: [
      "packages/*/src/**/*.test.ts",
      "packages/*/dx-tests/**/*.test.ts",
      "packages/*/virtualized-dx-tests/**/*.test.ts",
    ],
    ignores: ["packages/activerecord/**"],
    plugins: { vitest },
    rules: {
      "vitest/no-conditional-in-test": "error",
      "vitest/no-conditional-expect": "error",
      "vitest/no-conditional-tests": "error",
    },
  },

  // ── activerecord: no-conditional-tests and no-conditional-in-test are
  // clean. no-conditional-expect still has outstanding violations; enable
  // it in a follow-up PR as the sites are driven to zero.
  {
    files: [
      "packages/activerecord/src/**/*.test.ts",
      "packages/activerecord/dx-tests/**/*.test.ts",
      "packages/activerecord/virtualized-dx-tests/**/*.test.ts",
    ],
    plugins: { vitest },
    rules: {
      "vitest/no-conditional-tests": "error",
      "vitest/no-conditional-in-test": "error",
    },
  },

  // ── activesupport ──
  {
    files: ["packages/activesupport/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-namespace": "off",
      "unused-imports/no-unused-vars": "off",
      "no-empty": "off",
    },
  },
  {
    files: ["packages/activesupport/src/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },

  // ── rack ──
  {
    files: ["packages/rack/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["packages/rack/src/common-logger.ts"],
    rules: {
      "no-control-regex": "off",
    },
  },

  // ── actionpack + trailties ──
  {
    files: ["packages/actionpack/src/**/*.ts", "packages/trailties/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "unused-imports/no-unused-vars": "off",
      "no-undef": "off",
    },
  },

  // ── website ──
  {
    files: ["packages/website/src/**/*.ts", "packages/website/server/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-useless-assignment": "off",
      "no-undef": "off",
    },
  },

  // ── no-unnecessary-type-assertion: scoped typed-lint block (projectService only, not recommendedTypeChecked) ──
  {
    files: ["**/*.ts"],
    // `scripts/**` is run by tsx and belongs to no tsconfig program, so the
    // project service cannot resolve any of its ~500 `.ts` files — each one
    // would be a parse error rather than a lint result. The tree is linted by
    // every untyped rule; only this typed block skips it.
    ignores: ["scripts/**"],
    languageOptions: {
      parserOptions: {
        projectService: {
          // Files not included in any tsconfig.json — let projectService fall
          // back to an inferred default project so the rule can type-check them.
          allowDefaultProject: [
            "packages/actionview/types/tse-modules.d.ts",
            "packages/activerecord/scripts/materialize-model-declares.ts",
            "packages/activerecord/scripts/materialize-model-declares.test.ts",
            "packages/website/docs/.vitepress/config.ts",
            "vitest.config.ts",
            "vitest.dx-tests.config.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
    },
  },

  // ── dropped-Promise guards (RFC 0063 async-validation) ──
  // As `isValid()`/`validate()` flip to returning `Promise<boolean>`, lint must
  // catch a forgotten `await`. Two rules cover the footguns over the two
  // packages the flip touches (src + tests); both need type info, supplied by
  // the projectService block above.
  //
  //  - no-misused-promises (all three sub-checks on): `checksConditionals`
  //    catches a Promise in a boolean position (`if (record.isValid())` is
  //    always truthy); `checksVoidReturn` catches an async callback / adapter
  //    override passed where a void return is expected; `checksSpreads` catches
  //    a Promise spread into an object.
  //  - no-floating-promises: catches a dropped Promise statement — a bare
  //    `record.save()` whose result nobody awaits.
  {
    files: ["packages/activemodel/src/**/*.ts", "packages/activerecord/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksConditionals: true, checksVoidReturn: true, checksSpreads: true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
);
