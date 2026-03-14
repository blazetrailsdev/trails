/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/citext_test.rb
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

  describe("PostgresqlCitextTest", () => {
    it.skip("citext column", async () => {});
    it.skip("citext default", async () => {});
    it.skip("citext type cast", async () => {});
    it.skip("case insensitive where", async () => {});
    it.skip("case insensitive uniqueness", async () => {});
    it.skip("case insensitive comparison", async () => {});
    it.skip("citext schema dump", async () => {});
    it.skip("citext enabled", async () => {});
    it.skip("change table supports json", async () => {});
    it.skip("write", async () => {});
    it.skip("select case insensitive", async () => {});
    it.skip("case insensitiveness", async () => {});
  });
});
