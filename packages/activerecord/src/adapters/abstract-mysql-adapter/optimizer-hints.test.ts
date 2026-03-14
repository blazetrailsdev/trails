/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/optimizer_hints_test.rb
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

  describe("OptimizerHintsTest", () => {
    it.skip("optimizer hints", () => {});
  });
});
