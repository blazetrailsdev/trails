/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb
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

  describe("CountDeletedRowsWithLockTest", () => {
    it.skip("delete and create in different threads synchronize correctly", () => {});
  });
});
