/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_boolean_test.rb
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

  describe("MysqlBooleanTest", () => {
    it.skip("column type with emulated booleans", () => {});
    it.skip("column type without emulated booleans", () => {});
    it.skip("type casting with emulated booleans", () => {});
    it.skip("type casting without emulated booleans", () => {});
    it.skip("with booleans stored as 1 and 0", () => {});
    it.skip("with booleans stored as t", () => {});
  });
});
