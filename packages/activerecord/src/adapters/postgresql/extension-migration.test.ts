/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/extension_migration_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlExtensionMigrationTest", () => {
    it.skip("enable extension", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("disable extension", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("enable extension idempotent", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("disable extension idempotent", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("extension schema dump", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("enable extension migration ignores prefix and suffix", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("enable extension migration with schema", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("disable extension migration ignores prefix and suffix", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("disable extension raises when dependent objects exist", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
    it.skip("disable extension drops extension when cascading", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in extension-migration
      // ROOT-CAUSE: adapters/postgresql/extension-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/extension-migration.ts; affects ~10–47 tests in extension-migration.test.ts
    });
  });
});
