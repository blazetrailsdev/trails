/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/prepared_statements_disabled_test.rb
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

  describe("PreparedStatementsDisabledTest", () => {
    it.skip("prepared statements disabled", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in prepared-statements-disabled
      // ROOT-CAUSE: adapters/postgresql/prepared-statements-disabled.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/prepared-statements-disabled.ts; affects ~10–47 tests in prepared-statements-disabled.test.ts
    });
    it.skip("select query works even when prepared statements are disabled", async () => {
      // BLOCKED: adapter-pg — PostgreSQL-specific adapter gap in prepared-statements-disabled
      // ROOT-CAUSE: adapters/postgresql/prepared-statements-disabled.ts missing or incomplete Rails parity
      // SCOPE: ~50–200 LOC fix in adapters/postgresql/prepared-statements-disabled.ts; affects ~10–47 tests in prepared-statements-disabled.test.ts
    });
  });
});
