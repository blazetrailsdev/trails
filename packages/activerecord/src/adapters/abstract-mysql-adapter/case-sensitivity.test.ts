/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/case_sensitivity_test.rb
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

  describe("CaseSensitivityTest", () => {
    it.skip("columns include collation different from table", () => {});
    it.skip("case sensitive", () => {});
    it.skip("case insensitive comparison for ci column", () => {});
    it.skip("case insensitive comparison for cs column", () => {});
    it.skip("case sensitive comparison for ci column", () => {});
    it.skip("case sensitive comparison for cs column", () => {});
    it.skip("case sensitive comparison for binary column", () => {});
  });
});
