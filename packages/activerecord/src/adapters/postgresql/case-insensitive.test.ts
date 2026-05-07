/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/case_insensitive_test.rb
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

  describe("PostgresqlCaseInsensitiveTest", () => {
    it.skip("case insensitive comparison", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in case-insensitive
      // ROOT-CAUSE: adapters/postgresql/case-insensitive.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/case-insensitive.ts; affects ~10–47 tests in case-insensitive.test.ts
    });
    it.skip("case insensitiveness", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in case-insensitive
      // ROOT-CAUSE: adapters/postgresql/case-insensitive.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/case-insensitive.ts; affects ~10–47 tests in case-insensitive.test.ts
    });
  });
});
