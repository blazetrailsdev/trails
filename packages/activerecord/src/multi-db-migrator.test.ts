import { describe, it } from "vitest";

describe("MultiDbMigratorTest", () => {
  it.skip("schema migration is different for different connections", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
  it.skip("finds migrations", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
  it.skip("migrations status", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
  it.skip("get all versions", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
  it.skip("finds pending migrations", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
  it.skip("migrator db has no schema migrations table", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
  it.skip("migrator forward", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClassQ not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in multi-db-migrator.test.ts
  });
});
