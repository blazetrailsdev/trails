/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/numbers_test.rb
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

  describe("PostgreSQLNumberTest", () => {
    it.skip("numeric column", async () => {});
    it.skip("numeric default", async () => {});
    it.skip("numeric type cast", async () => {});
    it.skip("numeric nan", async () => {});
    it.skip("numeric infinity", async () => {});
    it.skip("data type", async () => {});
    it.skip("values", async () => {});
    it.skip("reassigning infinity does not mark record as changed", async () => {});
    it.skip("reassigning nan does not mark record as changed", async () => {});
    it.skip("update", () => {
      /* TODO: needs imports from original file */
    });
  });
});
