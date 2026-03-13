/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/create_unlogged_tables_test.rb
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

  describe("PostgresqlCreateUnloggedTablesTest", () => {
    it.skip("create unlogged table", async () => {});
    it.skip("create unlogged table with index", async () => {});
    it.skip("create unlogged table from select", async () => {});
    it.skip("create logged table", async () => {});
    it.skip("unlogged table schema dump", async () => {});
    it.skip("logged by default", async () => {});
    it.skip("unlogged in test environment when unlogged setting enabled", async () => {});
    it.skip("not included in schema dump", async () => {});
    it.skip("not changed in change table", async () => {});
    it.skip("gracefully handles temporary tables", async () => {});
  });
});
