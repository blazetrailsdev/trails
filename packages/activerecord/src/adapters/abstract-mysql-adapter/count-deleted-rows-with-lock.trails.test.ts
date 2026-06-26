/**
 * Trails-specific invariant for the MySQL adapter: deleting rows in one
 * connection while another connection concurrently inserts must report the
 * correct deleted-row count. Relocated from
 * count-deleted-rows-with-lock.test.ts (RFC 0043) -- the paired Rails file
 * adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb is an
 * adapter-gated case that maps zero in test:compare.
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
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
    beforeEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `test_bulbs`");
      await adapter.execute("DROP TABLE IF EXISTS `test_authors`");
      await adapter.execute(
        "CREATE TABLE `test_bulbs` (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255), color VARCHAR(255))",
      );
      await adapter.execute(
        "CREATE TABLE `test_authors` (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255))",
      );
    });
    afterEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `test_bulbs`").catch(() => {});
      await adapter.execute("DROP TABLE IF EXISTS `test_authors`").catch(() => {});
    });

    it("delete and create in different threads synchronize correctly", async () => {
      await adapter.executeMutation(
        "INSERT INTO `test_bulbs` (name, color) VALUES ('Jimmy', 'blue')",
      );

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        const [deleteResult, _createResult] = await Promise.allSettled([
          adapter.executeMutation("DELETE FROM `test_bulbs`"),
          adapter2.executeMutation("INSERT INTO `test_authors` (name) VALUES ('Tommy')"),
        ]);

        expect(deleteResult.status).toBe("fulfilled");
        expect((deleteResult as PromiseFulfilledResult<number>).value).toBe(1);
      } finally {
        await adapter2.close();
      }
    });
  });
});
