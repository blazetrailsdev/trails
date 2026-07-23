/**
 * Trails-specific (TS-only) extra for the MySQL adapter's nested-deadlock
 * suite. The Rails-named tests from
 * adapters/abstract_mysql_adapter/nested_deadlock_test.rb live in
 * nested-deadlock.test.ts; this file keeps the adapter-level savepoint
 * promotion check that has no Rails counterpart.
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { SavepointTransaction } from "../../connection-adapters/abstract/transaction.js";

/** Mirrors Rails' `make_parent_transaction_dirty` which runs `Sample.take`. */
async function makeParentDirty(a: Mysql2Adapter): Promise<void> {
  await a.execQuery("SELECT * FROM `samples` LIMIT 1");
}

/** Mirrors `assert_current_transaction_is_savepoint_transaction`. */
function assertSavepoint(a: Mysql2Adapter): void {
  expect(a.currentTransaction()).toBeInstanceOf(SavepointTransaction);
}

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("NestedDeadlockTest", () => {
    beforeEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `samples`");
      await adapter.execute(
        "CREATE TABLE `samples` (id INT AUTO_INCREMENT PRIMARY KEY, value INT)",
      );
    });
    afterEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `samples`").catch(() => {});
    });

    it("select inside transaction forces nested requiresNew to use a SavepointTransaction", async () => {
      await adapter.transaction(async () => {
        await makeParentDirty(adapter);
        await adapter.transaction({ requiresNew: true }, async () => {
          assertSavepoint(adapter);
        });
      });
    });
  });
});
