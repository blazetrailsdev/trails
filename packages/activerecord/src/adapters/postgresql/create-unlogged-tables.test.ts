/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/create_unlogged_tables_test.rb
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

  describe("UnloggedTablesTest", () => {
    it.skip("create unlogged table", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("create unlogged table with index", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("create unlogged table from select", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("create logged table", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("unlogged table schema dump", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("logged by default", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("unlogged in test environment when unlogged setting enabled", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("not included in schema dump", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("not changed in change table", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
    it.skip("gracefully handles temporary tables", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in create-unlogged-tables
      // ROOT-CAUSE: adapters/postgresql/create-unlogged-tables.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/create-unlogged-tables.ts; affects ~10–47 tests in create-unlogged-tables.test.ts
    });
  });
});
