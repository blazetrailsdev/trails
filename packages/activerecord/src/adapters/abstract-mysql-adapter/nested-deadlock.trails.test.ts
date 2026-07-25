import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { SavepointTransaction } from "../../connection-adapters/abstract/transaction.js";

async function makeParentDirty(a: Mysql2Adapter): Promise<void> {
  await a.execQuery("SELECT * FROM `samples` LIMIT 1");
}

function assertSavepoint(a: Mysql2Adapter): void {
  expect(a.currentTransaction()).toBeInstanceOf(SavepointTransaction);
}

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
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
