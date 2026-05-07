/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/ltree_test.rb
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

  describe("PostgresqlLtreeTest", () => {
    it.skip("column", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in ltree
      // ROOT-CAUSE: adapters/postgresql/ltree.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/ltree.ts; affects ~10–47 tests in ltree.test.ts
    });
    it.skip("default", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in ltree
      // ROOT-CAUSE: adapters/postgresql/ltree.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/ltree.ts; affects ~10–47 tests in ltree.test.ts
    });
    it.skip("ltree query", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in ltree
      // ROOT-CAUSE: adapters/postgresql/ltree.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/ltree.ts; affects ~10–47 tests in ltree.test.ts
    });
    it.skip("ltree schema dump", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in ltree
      // ROOT-CAUSE: adapters/postgresql/ltree.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/ltree.ts; affects ~10–47 tests in ltree.test.ts
    });
    it.skip("write", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in ltree
      // ROOT-CAUSE: adapters/postgresql/ltree.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/ltree.ts; affects ~10–47 tests in ltree.test.ts
    });
  });
});
