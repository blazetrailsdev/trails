/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/integer_test.rb
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

  describe("PostgresqlIntegerTest", () => {
    it.skip("integer types", async () => {});
    it.skip("schema properly respects bigint ranges", async () => {});
  });
});
