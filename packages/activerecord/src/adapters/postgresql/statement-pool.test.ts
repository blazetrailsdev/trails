/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/statement_pool_test.rb
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

  describe("PostgresqlStatementPoolTest", () => {
    it.skip("statement pool", async () => {});
    it.skip("statement pool max", async () => {});
    it.skip("statement pool clear", async () => {});
    it.skip("dealloc does not raise on inactive connection", async () => {});
    it.skip("prepared statements do not get stuck on query interruption", async () => {});
  });
});
