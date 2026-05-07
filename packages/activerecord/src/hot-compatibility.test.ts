import { describe, it } from "vitest";

describe("HotCompatibilityTest", () => {
  it.skip("insert after remove_column", () => {
    // BLOCKED: migration — migration runner gap in hot-compatibility
    // ROOT-CAUSE: migration.ts#Migrator or MigrationContext not fully implementing Rails migration semantics
    // SCOPE: ~50–150 LOC fix in migration.ts; affects ~4–30 tests in hot-compatibility.test.ts
  });
  it.skip("update after remove_column", () => {
    // BLOCKED: migration — migration runner gap in hot-compatibility
    // ROOT-CAUSE: migration.ts#Migrator or MigrationContext not fully implementing Rails migration semantics
    // SCOPE: ~50–150 LOC fix in migration.ts; affects ~4–30 tests in hot-compatibility.test.ts
  });
  it.skip("cleans up after prepared statement failure in a transaction", () => {
    // BLOCKED: migration — migration runner gap in hot-compatibility
    // ROOT-CAUSE: migration.ts#Migrator or MigrationContext not fully implementing Rails migration semantics
    // SCOPE: ~50–150 LOC fix in migration.ts; affects ~4–30 tests in hot-compatibility.test.ts
  });
  it.skip("cleans up after prepared statement failure in nested transactions", () => {
    // BLOCKED: migration — migration runner gap in hot-compatibility
    // ROOT-CAUSE: migration.ts#Migrator or MigrationContext not fully implementing Rails migration semantics
    // SCOPE: ~50–150 LOC fix in migration.ts; affects ~4–30 tests in hot-compatibility.test.ts
  });
});
