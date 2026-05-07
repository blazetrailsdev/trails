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
    it.skip("delete and create in different threads synchronize correctly", () => {
      // BLOCKED: adapter-mysql — MySQL-specific adapter gap in count-deleted-rows-with-lock
      // ROOT-CAUSE: adapters/mysql2/count-deleted-rows-with-lock.ts or abstract-mysql-adapter/count-deleted-rows-with-lock.ts missing Rails parity
      // SCOPE: ~50–150 LOC fix in adapters/mysql2/count-deleted-rows-with-lock.ts; affects ~10–26 tests in count-deleted-rows-with-lock.test.ts
    });
  });
});
