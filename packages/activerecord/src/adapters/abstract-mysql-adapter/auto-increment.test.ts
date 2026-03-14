/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/auto_increment_test.rb
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

  describe("AutoIncrementTest", () => {
    it.skip("auto increment without primary key", () => {});
    it.skip("auto increment with composite primary key", () => {});
    it.skip("auto increment false with custom primary key", () => {});
    it.skip("auto increment false with create table", () => {});
  });
});
