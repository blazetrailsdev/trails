/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/json_test.rb
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

  describe("PostgresqlJsonTest", () => {
    it.skip("json column", async () => {});
    it.skip("json default", async () => {});
    it.skip("json type cast", async () => {});
    it.skip("deserialize with array", async () => {});
    it.skip("noname columns of different types", async () => {});
  });
});
