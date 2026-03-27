/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb
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

  describe("CountDeletedRowsWithLockTest", () => {
    it.skip("delete and create in different threads synchronize correctly", () => {});
  });
});
