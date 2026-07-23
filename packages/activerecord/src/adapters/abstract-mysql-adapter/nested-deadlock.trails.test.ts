import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { SavepointTransaction } from "../../connection-adapters/abstract/transaction.js";

async function makeParentDirty(a: Mysql2Adapter): Promise<void> {
  await a.execQuery("SELECT * FROM `samples` LIMIT 1");
}

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
