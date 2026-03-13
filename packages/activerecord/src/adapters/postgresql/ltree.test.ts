/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/ltree_test.rb
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

  describe("PostgresqlLtreeTest", () => {
    it.skip("column", async () => {});
    it.skip("default", async () => {});
    it.skip("ltree query", async () => {});
    it.skip("ltree schema dump", async () => {});
    it.skip("write", async () => {});
    it.skip("select", async () => {});
  });
});
