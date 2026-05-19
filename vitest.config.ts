import { defineConfig } from "vitest/config";
import path from "path";

// AR_DB_FORKS (read in test-setup-worker-db.ts) sets the advisory-lock slot
// pool size. TRAILS_TEST_FORKS caps the vitest worker count for both pools so
// that concurrent local worktrees don't saturate the machine. Precedence:
// TRAILS_TEST_FORKS > AR_DB_FORKS > 6. Raise with TRAILS_TEST_FORKS=N for a
// solo full run; CI sets AR_DB_FORKS=4 so those jobs stay at 4 workers.

const SHARED_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "packages/website/**",
  "packages/*/dx-tests/**",
];

// Adapter-specific test files must not load on a mismatched TEST_ADAPTER run.
// Shared tests that route through `createTestAdapter` + `SchemaAdapter` will
// drop tables that adapter-specific files (which construct their own adapter
// directly) assume stick around for the duration of a describe. See
// docs/shared-adapter-test-suite-plan.md Phase 1.
const TEST_ADAPTER = process.env.TEST_ADAPTER ?? "sqlite3";
const ADAPTER_SPECIFIC_EXCLUDE = [
  ...(TEST_ADAPTER !== "postgresql"
    ? [
        "packages/activerecord/src/adapters/postgresql/**",
        "packages/activerecord/src/connection-adapters/postgresql/**",
        "packages/activerecord/src/connection-adapters/postgresql-*.test.ts",
        "packages/activerecord/src/tasks/postgresql-*.test.ts",
      ]
    : []),
  ...(TEST_ADAPTER !== "mysql2"
    ? [
        "packages/activerecord/src/adapters/abstract-mysql-adapter/**",
        "packages/activerecord/src/adapters/mysql2/**",
        "packages/activerecord/src/connection-adapters/mysql/**",
        "packages/activerecord/src/connection-adapters/mysql2-*.test.ts",
        "packages/activerecord/src/connection-adapters/abstract-mysql-adapter.test.ts",
        "packages/activerecord/src/connection-adapters/mysql-*.test.ts",
        "packages/activerecord/src/tasks/mysql-*.test.ts",
      ]
    : []),
  ...(TEST_ADAPTER !== "sqlite3"
    ? [
        "packages/activerecord/src/adapters/sqlite3/**",
        "packages/activerecord/src/adapters/sqlite3-*.test.ts",
        "packages/activerecord/src/connection-adapters/sqlite3/**",
        "packages/activerecord/src/connection-adapters/sqlite3-*.test.ts",
        "packages/activerecord/src/tasks/sqlite-*.test.ts",
      ]
    : []),
];

const _parsedForks = parseInt(process.env.TRAILS_TEST_FORKS ?? process.env.AR_DB_FORKS ?? "", 10);
const TEST_FORKS = Number.isFinite(_parsedForks) && _parsedForks > 0 ? _parsedForks : 6;

const alias = {
  "@blazetrails/activesupport/message-verifier": path.resolve(
    __dirname,
    "packages/activesupport/src/message-verifier.ts",
  ),
  "@blazetrails/activesupport/temporal": path.resolve(
    __dirname,
    "packages/activesupport/src/temporal.ts",
  ),
  "@blazetrails/activesupport/sqlite-adapter": path.resolve(
    __dirname,
    "packages/activesupport/src/sqlite-adapter.ts",
  ),
  "@blazetrails/activesupport/sqlite/better-sqlite3": path.resolve(
    __dirname,
    "packages/activesupport/src/sqlite-drivers/better-sqlite3.ts",
  ),
  "@blazetrails/activesupport/sqlite/node-sqlite": path.resolve(
    __dirname,
    "packages/activesupport/src/sqlite-drivers/node-sqlite.ts",
  ),
  "@blazetrails/activesupport/key-generator": path.resolve(
    __dirname,
    "packages/activesupport/src/key-generator.ts",
  ),
  "@blazetrails/activesupport/glob": path.resolve(__dirname, "packages/activesupport/src/glob.ts"),
  "@blazetrails/activesupport/yaml": path.resolve(__dirname, "packages/activesupport/src/yaml.ts"),
  "@blazetrails/activesupport/gzip": path.resolve(__dirname, "packages/activesupport/src/gzip.ts"),
  "@blazetrails/activesupport/process-adapter": path.resolve(
    __dirname,
    "packages/activesupport/src/process-adapter.ts",
  ),
  "@blazetrails/activesupport/testing/temporal-helpers": path.resolve(
    __dirname,
    "packages/activesupport/src/testing/temporal-helpers.ts",
  ),
  "@blazetrails/activesupport": path.resolve(__dirname, "packages/activesupport/src/index.ts"),
  "@blazetrails/arel/src": path.resolve(__dirname, "packages/arel/src"),
  "@blazetrails/arel": path.resolve(__dirname, "packages/arel/src/index.ts"),
  "@blazetrails/activemodel/yaml": path.resolve(
    __dirname,
    "packages/activemodel/src/attribute-set/codecs/yaml.ts",
  ),
  "@blazetrails/activemodel": path.resolve(__dirname, "packages/activemodel/src/index.ts"),
  "@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/src/connection-adapters/sqlite3-adapter.ts",
  ),
  "@blazetrails/activerecord/adapters/postgresql-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/src/adapters/postgresql-adapter.ts",
  ),
  "@blazetrails/activerecord/adapters/mysql2-adapter.js": path.resolve(
    __dirname,
    "packages/activerecord/src/adapters/mysql2-adapter.ts",
  ),
  "@blazetrails/activerecord": path.resolve(__dirname, "packages/activerecord/src/index.ts"),
  "@blazetrails/rack": path.resolve(__dirname, "packages/rack/src/index.ts"),
  "@blazetrails/actionview": path.resolve(__dirname, "packages/actionview/src/index.ts"),
  "@blazetrails/actionpack": path.resolve(__dirname, "packages/actionpack/src/index.ts"),
  "@blazetrails/globalid/wire": path.resolve(__dirname, "packages/globalid/src/wire.ts"),
  "@blazetrails/globalid/signed-global-id": path.resolve(
    __dirname,
    "packages/globalid/src/signed-global-id.ts",
  ),
  "@blazetrails/globalid": path.resolve(__dirname, "packages/globalid/src/index.ts"),
  "@blazetrails/trails-tsc": path.resolve(__dirname, "packages/trails-tsc/src/index.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        // All activerecord tests. Each fork gets its own database (rails_js_test_N
        // for PG/MySQL, provisioned via AR_DB_FORKS) so files can run in parallel.
        // SQLite uses :memory: which is isolated per fork by default.
        resolve: { alias },
        test: {
          name: "activerecord",
          include: ["packages/activerecord/src/**/*.test.ts"],
          exclude: [...SHARED_EXCLUDE, ...ADAPTER_SPECIFIC_EXCLUDE],
          setupFiles: [
            "./packages/activerecord/src/test-setup-worker-db.ts",
            "./packages/activerecord/src/test-setup.ts",
            "./packages/activerecord/src/test-setup-ar.ts",
            ...(process.env.MYSQL_TEST_URL
              ? ["./packages/activerecord/src/test-setup-mysql.ts"]
              : []),
          ],
          // Real-DB tests share a per-worker DB; the module-level state in
          // test-adapter.ts has known race windows (see PR #1114 for prior
          // _createdTables drift recovery). Retry intermittents on PG/MySQL
          // only.
          //
          // Tradeoff: this is broader than the known shared-DB flakes — it
          // also covers describeIfPg/describeIfMysql backend-only tests that
          // SQLite never exercises, so a flaky-but-real regression in
          // backend-only code could slip through after a retry. We accept
          // this because (a) retries only mask non-deterministic failures —
          // a 100% regression still fails through all attempts, (b) the
          // observed flake pattern spans 10+ files across the project,
          // making per-file scoping brittle, and (c) the alternative —
          // letting CI fail on every transient race — burns more reviewer
          // time than the rare hidden flake costs. Revisit if a real
          // regression slips through.
          retry: process.env.PG_TEST_URL || process.env.MYSQL_TEST_URL ? 2 : 0,
          pool: "forks",
          poolOptions: { forks: { maxForks: TEST_FORKS } },
        },
      },
      {
        // All non-AR packages + scripts: parallel, no DB concerns.
        resolve: { alias },
        test: {
          name: "other",
          include: [
            "packages/*/src/**/*.test.ts",
            "scripts/guides-typecheck/*.test.ts",
            "scripts/api-compare/*.test.ts",
            "scripts/parity/**/*.test.ts",
            "vendor/*.test.ts",
          ],
          exclude: ["packages/activerecord/**", ...SHARED_EXCLUDE],
          setupFiles: ["./packages/activerecord/src/test-setup.ts"],
          poolOptions: { forks: { maxForks: TEST_FORKS } },
        },
      },
    ],
  },
});
