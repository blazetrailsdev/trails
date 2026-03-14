/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/charset_collation_test.rb
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

  describe("CharsetCollationTest", () => {
    it.skip("string column with charset and collation", () => {});
    it.skip("text column with charset and collation", () => {});
    it.skip("add column with charset and collation", () => {});
    it.skip("change column with charset and collation", () => {});
    it.skip("change column doesn't preserve collation for string to binary types", () => {});
    it.skip("change column doesn't preserve collation for string to non-string types", () => {});
    it.skip("change column preserves collation for string to text", () => {});
  });
});
