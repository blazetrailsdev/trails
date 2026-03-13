/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/set_test.rb
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

  describe("SetTest", () => {
    it.skip("should not be unsigned", () => {});
    it.skip("should not be bigint", () => {});
    it.skip("schema dumping", () => {});
  });
});
