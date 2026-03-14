/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/integer_test.rb
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

  describe("PostgresqlIntegerTest", () => {
    it.skip("integer types", async () => {});
    it.skip("schema properly respects bigint ranges", async () => {});
  });
});
