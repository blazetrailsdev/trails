import { defineConfig } from "vitest/config";
import path from "path";

// Number of parallel forks for activerecord tests. Set AR_DB_FORKS=4 in CI
// after provisioning rails_js_test_2/3/4 alongside the base database. Leave
// unset (or 0/1) for local runs — workers fall back to the base URL.
const AR_DB_FORKS = parseInt(process.env.AR_DB_FORKS ?? "0", 10) || undefined;

// When AR_DB_FORKS is unset and a real DB is present, cap to 1 fork so
// parallel workers don't race on the same PG/MySQL database. SQLite uses
// :memory: which is isolated per fork, so no cap is needed there.
const AR_DB_MAX_FORKS =
  AR_DB_FORKS ?? (process.env.PG_TEST_URL || process.env.MYSQL_TEST_URL ? 1 : undefined);

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
            ...(process.env.MYSQL_TEST_URL
              ? ["./packages/activerecord/src/test-setup-mysql.ts"]
              : []),
          ],
          pool: "forks",
          // minForks = maxForks so VITEST_WORKER_ID stays within [1, AR_DB_MAX_FORKS].
          // Without this each file gets a new fork; IDs wrap mod AR_DB_MAX_FORKS,
          // so workers share the same DB and race on table mutations mid-test.
          poolOptions: { forks: { maxForks: AR_DB_MAX_FORKS, minForks: AR_DB_MAX_FORKS } },
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
