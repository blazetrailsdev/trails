/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/composite_test.rb
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

  describe("PostgresqlCompositeTest", () => {
    it.skip("column", async () => {});
    it.skip("composite value", async () => {});
    it.skip("composite mapping", async () => {});
    it.skip("composite write", async () => {});
  });
});
