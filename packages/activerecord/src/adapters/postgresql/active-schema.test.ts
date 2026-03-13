/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/active_schema_test.rb
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

  describe("PostgreSQLActiveSchemaTest", () => {
    it.skip("create database with encoding", async () => {});
    it.skip("create database with collation and ctype", async () => {});
    it.skip("add index", async () => {});
    it.skip("remove index", async () => {});
    it.skip("remove index when name is specified", async () => {});
    it.skip("remove index with wrong option", async () => {});
  });
});
