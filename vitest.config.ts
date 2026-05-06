import { defineConfig } from "vitest/config";
import path from "path";

// AR_DB_FORKS (read in test-setup-worker-db.ts) sets the advisory-lock slot
// pool size. Worker count is no longer pinned to it: vitest spawns freely and
// workers queue on advisory locks when all slots are held.

const SHARED_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "packages/website/**",
  "packages/*/dx-tests/**",
];

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
  "@blazetrails/activesupport/glob": path.resolve(__dirname, "packages/activesupport/src/glob.ts"),
  "@blazetrails/activesupport/yaml": path.resolve(__dirname, "packages/activesupport/src/yaml.ts"),
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
          exclude: SHARED_EXCLUDE,
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
          // Worker count is intentionally uncapped: advisory locks in
          // test-setup-worker-db.ts bound real DB concurrency to AR_DB_FORKS
          // slots, so extra workers simply wait for a free slot.
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
          ],
          exclude: ["packages/activerecord/**", ...SHARED_EXCLUDE],
          setupFiles: ["./packages/activerecord/src/test-setup.ts"],
        },
      },
    ],
  },
});
