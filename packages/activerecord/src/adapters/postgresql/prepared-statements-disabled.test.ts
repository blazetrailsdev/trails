/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/prepared_statements_disabled_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL, preparedStatements: false });
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PreparedStatementsDisabledTest", () => {
    it("prepared statements disabled", async () => {
      expect(adapter.preparedStatements).toBe(false);
    });
    it("select query works even when prepared statements are disabled", async () => {
      expect(adapter.preparedStatements).toBe(false);
      const withBinds = await adapter.execute("SELECT $1::integer AS n", [42]);
      expect(withBinds[0]["n"]).toBe(42);
      const withoutBinds = await adapter.execute("SELECT 1 AS n");
      expect(withoutBinds[0]["n"]).toBe(1);
    });
  });
});
