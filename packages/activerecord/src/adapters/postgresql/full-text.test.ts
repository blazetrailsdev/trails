/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/full_text_test.rb
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

  describe("PostgresqlFullTextTest", () => {
    it.skip("tsvector column", async () => {});
    it.skip("tsquery column", async () => {});
    it.skip("full text search", async () => {});
    it.skip("update tsvector", async () => {});
  });
});
