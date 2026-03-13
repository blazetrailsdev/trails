/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/virtual_column_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, MysqlAdapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("VirtualColumnTest", () => {
    it.skip("virtual column", () => {});
    it.skip("stored column", () => {});
    it.skip("change table", () => {});
    it.skip("schema dumping", () => {});
  });
});
