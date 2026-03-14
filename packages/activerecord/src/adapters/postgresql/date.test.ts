/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/date_test.rb
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

  describe("PostgresqlDateTest", () => {
    it.skip("date column", async () => {});
    it.skip("date default", async () => {});
    it.skip("date type cast", async () => {});
    it.skip("date infinity", async () => {});
    it.skip("date before epoch", async () => {});
    it.skip("bc date", async () => {});
    it.skip("bc date leap year", async () => {});
    it.skip("bc date year zero", async () => {});
  });
});
