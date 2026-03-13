/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/prepared_statements_disabled_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlPreparedStatementsDisabledTest", () => {
    it.skip("prepared statements disabled", async () => {});
    it.skip("select query works even when prepared statements are disabled", async () => {});
  });
});
