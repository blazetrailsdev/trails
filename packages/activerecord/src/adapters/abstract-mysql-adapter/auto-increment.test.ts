/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/auto_increment_test.rb
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

  describe("AutoIncrementTest", () => {
    it.skip("auto increment without primary key", () => {});
    it.skip("auto increment with composite primary key", () => {});
    it.skip("auto increment false with custom primary key", () => {});
    it.skip("auto increment false with create table", () => {});
  });
});
