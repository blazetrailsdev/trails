/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/invertible_migration_test.rb
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

  describe("PostgresqlInvertibleMigrationTest", () => {
    it.skip("up", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("down", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("change", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("revert", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("revert whole migration", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate and revert", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate revert add index with expression", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate revert create enum", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate revert drop enum", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate revert rename enum value", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate revert add and validate check constraint", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
    it.skip("migrate revert add and validate foreign key", () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in invertible-migration
      // ROOT-CAUSE: adapters/postgresql/invertible-migration.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/invertible-migration.ts; affects ~10–47 tests in invertible-migration.test.ts
    });
  });
});
