/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/collation_test.rb
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

  describe("PostgresqlCollationTest", () => {
    it.skip("columns collation", async () => {});
    it.skip("collation change", async () => {});
    it.skip("collation add", async () => {});
    it.skip("collation schema dump", async () => {});
    it.skip("collation default", async () => {});
  });
});
