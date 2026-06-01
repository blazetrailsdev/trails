import { defineConfig } from "vitest/config";
import path from "path";

// Canary vitest config: activerecord tests that have been migrated to the
// transactional-fixtures architecture (useFixtures + withTransactionalFixtures,
// no per-test defineSchema). Runs against PostgreSQL only.
//
// Add files here as they are converted. The existing postgres-tests CI job
// continues to cover all files; this job verifies migrated files pass under
// the stricter no-DDL-per-test contract.
//
// To run locally:
//   PG_TEST_URL=postgres://... pnpm vitest run --config vitest.pg-canary.config.ts

const MIGRATED_FILES = ["packages/activerecord/src/coders/json.test.ts"];

const SHARED_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "packages/website/**",
  "packages/*/dx-tests/**",
];

// This config always runs against postgresql; exclude sqlite3 and mysql
// adapter-specific files so they don't accidentally land in MIGRATED_FILES
// and run against the wrong adapter.
const ADAPTER_SPECIFIC_EXCLUDE = [
  "packages/activerecord/src/adapters/abstract-mysql-adapter/**",
  "packages/activerecord/src/adapters/mysql2/**",
  "packages/activerecord/src/connection-adapters/mysql/**",
  "packages/activerecord/src/connection-adapters/mysql2-*.test.ts",
  "packages/activerecord/src/connection-adapters/abstract-mysql-adapter.test.ts",
  "packages/activerecord/src/connection-adapters/mysql-*.test.ts",
  "packages/activerecord/src/tasks/mysql-*.test.ts",
  "packages/activerecord/src/adapters/sqlite3/**",
  "packages/activerecord/src/adapters/sqlite3-*.test.ts",
  "packages/activerecord/src/connection-adapters/sqlite3/**",
  "packages/activerecord/src/connection-adapters/sqlite3-*.test.ts",
  "packages/activerecord/src/tasks/sqlite-*.test.ts",
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
  "@blazetrails/activesupport/sqlite/node-sqlite": path.resolve(
    __dirname,
    "packages/activesupport/src/sqlite-drivers/node-sqlite.ts",
  ),
  "@blazetrails/activesupport/key-generator": path.resolve(
    __dirname,
    "packages/activesupport/src/key-generator.ts",
  ),
  "@blazetrails/activesupport/digest": path.resolve(
    __dirname,
    "packages/activesupport/src/digest.ts",
  ),
  "@blazetrails/activesupport/glob": path.resolve(__dirname, "packages/activesupport/src/glob.ts"),
  "@blazetrails/activesupport/yaml": path.resolve(__dirname, "packages/activesupport/src/yaml.ts"),
  "@blazetrails/activesupport/gzip": path.resolve(__dirname, "packages/activesupport/src/gzip.ts"),
  "@blazetrails/activesupport/process-adapter": path.resolve(
    __dirname,
    "packages/activesupport/src/process-adapter.ts",
  ),
  "@blazetrails/activesupport/child-process-adapter": path.resolve(
    __dirname,
    "packages/activesupport/src/child-process-adapter.ts",
  ),
  "@blazetrails/activesupport/fs-adapter": path.resolve(
    __dirname,
    "packages/activesupport/src/fs-adapter.ts",
  ),
  "@blazetrails/activesupport/encrypted-file": path.resolve(
    __dirname,
    "packages/activesupport/src/encrypted-file.ts",
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
  "@blazetrails/activerecord/type-virtualization/virtualize.js": path.resolve(
    __dirname,
    "packages/activerecord/src/type-virtualization/virtualize.ts",
  ),
  "@blazetrails/activerecord/type-virtualization/synthesize.js": path.resolve(
    __dirname,
    "packages/activerecord/src/type-virtualization/synthesize.ts",
  ),
  "@blazetrails/activerecord/type-virtualization/transitive-extends-walker.js": path.resolve(
    __dirname,
    "packages/activerecord/src/type-virtualization/transitive-extends-walker.ts",
  ),
  "@blazetrails/activerecord/type-virtualization/walker.js": path.resolve(
    __dirname,
    "packages/activerecord/src/type-virtualization/walker.ts",
  ),
  "@blazetrails/activerecord/type-virtualization/resolve-target.js": path.resolve(
    __dirname,
    "packages/activerecord/src/type-virtualization/resolve-target.ts",
  ),
  "@blazetrails/activerecord": path.resolve(__dirname, "packages/activerecord/src/index.ts"),
  "@blazetrails/globalid/wire": path.resolve(__dirname, "packages/globalid/src/wire.ts"),
  "@blazetrails/globalid/signed-global-id": path.resolve(
    __dirname,
    "packages/globalid/src/signed-global-id.ts",
  ),
  "@blazetrails/globalid": path.resolve(__dirname, "packages/globalid/src/index.ts"),
  "@blazetrails/rack": path.resolve(__dirname, "packages/rack/src/index.ts"),
  "@blazetrails/actionview": path.resolve(__dirname, "packages/actionview/src/index.ts"),
  "@blazetrails/actionpack": path.resolve(__dirname, "packages/actionpack/src/index.ts"),
  "@blazetrails/tse-compiler": path.resolve(__dirname, "packages/tse-compiler/src/index.ts"),
  "@blazetrails/trails-tsc": path.resolve(__dirname, "packages/trails-tsc/src/index.ts"),
  "@blazetrails/did-you-mean": path.resolve(__dirname, "packages/did-you-mean/src/index.ts"),
  "@blazetrails/nokogiri": path.resolve(__dirname, "packages/nokogiri/src/index.ts"),
};

const _parsedForks = parseInt(process.env.TRAILS_TEST_FORKS ?? process.env.AR_DB_FORKS ?? "", 10);
const TEST_FORKS = Number.isFinite(_parsedForks) && _parsedForks > 0 ? _parsedForks : 4;

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "ar-pg-canary",
          globalSetup: ["./packages/activerecord/src/test-helpers/pg-template-global-setup.ts"],
          include: MIGRATED_FILES,
          exclude: [...SHARED_EXCLUDE, ...ADAPTER_SPECIFIC_EXCLUDE],
          setupFiles: [
            "./packages/activerecord/src/test-setup-worker-db.ts",
            "./packages/activerecord/src/test-setup-ar.ts",
            "./packages/activerecord/src/test-setup-dy.ts",
          ],
          retry: 2,
          hookTimeout: 30_000,
          pool: "forks",
          poolOptions: { forks: { maxForks: TEST_FORKS } },
        },
      },
    ],
  },
});
