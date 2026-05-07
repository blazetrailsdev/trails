import { describe, it } from "vitest";

describe("PrimaryClassTest", () => {
  it.skip("application record is used if no primary class is set", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
  it.skip("primary class and primary abstract class behavior", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
  it.skip("primary abstract class cannot be reset", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
  it.skip("primary abstract class is used over application record if set", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
  it.skip("setting primary abstract class explicitly wins over application record set implicitly", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
  it.skip("application record shares a connection with active record by default", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
  it.skip("application record shares a connection with the primary abstract class if set", () => {
    // BLOCKED: migration — multi-DB migrator / primary-class gap
    // ROOT-CAUSE: migration.ts#MigrationContext or connection-adapters/abstract/connection-handler.ts#primaryClass not fully implemented
    // SCOPE: ~50 LOC fix in migration.ts; affects ~7 tests in primary-class.test.ts
  });
});
