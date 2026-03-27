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
    it.skip("prepared statements disabled", async () => {});
    it.skip("select query works even when prepared statements are disabled", async () => {});
  });
});
