/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/case_insensitive_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlCaseInsensitiveTest", () => {
    it.skip("case insensitive comparison", async () => {});
    it.skip("case insensitiveness", async () => {});
  });
});
