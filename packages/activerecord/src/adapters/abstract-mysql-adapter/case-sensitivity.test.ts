/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/case_sensitivity_test.rb
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
