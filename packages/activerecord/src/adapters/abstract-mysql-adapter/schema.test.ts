/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("SchemaTest", () => {
    it.skip("float limits", () => {});
    it.skip("schema", () => {});
    it.skip("primary key", () => {});
    it.skip("data source exists", () => {});
    it.skip("dump indexes", () => {});
    it.skip("drop temporary table", () => {});
  });

  describe("MySQLAnsiQuotesTest", () => {
    it.skip("primary key method with ansi quotes", () => {});
    it.skip("foreign keys method with ansi quotes", () => {});
  });
});
