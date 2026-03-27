/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/table_options_test.rb
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

  describe("TableOptionsTest", () => {
    it.skip("table options with ENGINE", () => {});
    it.skip("table options with ROW_FORMAT", () => {});
    it.skip("table options with CHARSET", () => {});
    it.skip("table options with COLLATE", () => {});
    it.skip("charset and collation options", () => {});
    it.skip("charset and partitioned table options", () => {});
    it.skip("schema dump works with NO_TABLE_OPTIONS sql mode", () => {});
  });

  describe("DefaultEngineOptionTest", () => {
    it.skip("new migrations do not contain default ENGINE=InnoDB option", () => {});
    it.skip("legacy migrations contain default ENGINE=InnoDB option", () => {});
  });
});
