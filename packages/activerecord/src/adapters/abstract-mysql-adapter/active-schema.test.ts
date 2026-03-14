/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/active_schema_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfMysql, MysqlAdapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("ActiveSchemaTest", () => {
    it.skip("add index", () => {});
    it.skip("index in create", () => {});
    it.skip("index in bulk change", () => {});
    it.skip("drop table", () => {});
    it.skip("drop tables", () => {});
    it.skip("create mysql database with encoding", () => {});
    it.skip("recreate mysql database with encoding", () => {});
    it.skip("add column", () => {});
    it.skip("add column with limit", () => {});
    it.skip("drop table with specific database", () => {});
    it.skip("drop tables with specific database", () => {});
    it.skip("add timestamps", () => {});
    it.skip("remove timestamps", () => {});
    it.skip("indexes in create", () => {});
  });
});
