/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/unsigned_type_test.rb
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

  describe("UnsignedTypeTest", () => {
    it.skip("unsigned int max value is in range", () => {});
    it.skip("minus value is out of range", () => {});
    it.skip("schema definition can use unsigned as the type", () => {});
    it.skip("deprecate unsigned_float and unsigned_decimal", () => {});
    it.skip("schema dump includes unsigned option", () => {});
  });
});
