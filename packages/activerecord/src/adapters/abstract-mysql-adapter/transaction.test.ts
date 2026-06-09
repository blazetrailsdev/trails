/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/transaction_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, isMariaDb, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { StatementTimeout, QueryAborted, ConnectionFailed } from "../../errors.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("TransactionTest", () => {
    beforeEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `samples`");
      await adapter.execute(
        "CREATE TABLE `samples` (id INT AUTO_INCREMENT PRIMARY KEY, value INT)",
      );
    });
    afterEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `samples`").catch(() => {});
    });

    // Rails skips unless `show_variable("max_execution_time")` — that variable
    // exists only on MySQL, not MariaDB, so gate on the server flavor.
    it.skipIf(isMariaDb)("raises StatementTimeout when statement timeout exceeded", async () => {
      await adapter.execute("INSERT INTO `samples` (value) VALUES (1)");
      const rows = await adapter.execute("SELECT id FROM `samples` LIMIT 1");
      const id = Number(rows[0]["id"]);

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      let error: unknown;
      try {
        let latch1Resolve!: () => void;
        let latch2Resolve!: () => void;
        const latch1 = new Promise<void>((r) => {
          latch1Resolve = r;
        });
        const latch2 = new Promise<void>((r) => {
          latch2Resolve = r;
        });

        const thread = (async () => {
          await adapter2.transaction(async () => {
            await adapter2.execute(`SELECT * FROM \`samples\` WHERE id = ${id} FOR UPDATE`);
            latch1Resolve();
            await latch2;
          });
        })();

        try {
          await adapter.transaction(async () => {
            await latch1;
            await adapter.execute("SET max_execution_time = 1");
            await adapter.execute(`SELECT * FROM \`samples\` WHERE id = ${id} FOR UPDATE`);
          });
        } catch (e) {
          error = e;
        } finally {
          await adapter.execute("SET max_execution_time = DEFAULT").catch(() => {});
          latch2Resolve();
          await thread.catch(() => {});
        }
      } finally {
        await adapter2.close();
      }

      expect(error).toBeInstanceOf(StatementTimeout);
      expect(error).toBeInstanceOf(QueryAborted);
    });

    it("reconnect preserves isolation level", async () => {
      const sampleCount = async (): Promise<number> => {
        const rows = await adapter.execute("SELECT COUNT(*) AS n FROM `samples`");
        return Number(rows[0]["n"]);
      };

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        // 1. Default (REPEATABLE READ): INSERT by another connection is not visible
        await adapter.transaction(async () => {
          await adapter.materializeTransactions();
          const countBefore = await sampleCount();
          await adapter2.execute("INSERT INTO `samples` (value) VALUES (1)");
          const countAfter = await sampleCount();
          expect(countAfter).toBe(countBefore);
        });

        // 2. READ COMMITTED: INSERT by another connection is visible mid-transaction
        await adapter.transaction({ isolation: "read_committed" }, async () => {
          await adapter.materializeTransactions();
          const countBefore = await sampleCount();
          await adapter2.execute("INSERT INTO `samples` (value) VALUES (1)");
          const countAfter = await sampleCount();
          expect(countAfter).toBe(countBefore + 1);
        });

        // 3. Retry preserves isolation: fail the first BEGIN, verify READ COMMITTED survives the retry
        let firstBeginFailed = false;
        const origInternalExecute = (adapter as any).internalExecute.bind(adapter);
        (adapter as any).internalExecute = async (sql: string, ...args: any[]) => {
          if (sql === "BEGIN" && !firstBeginFailed) {
            firstBeginFailed = true;
            throw new ConnectionFailed("Simulated failure");
          }
          return origInternalExecute(sql, ...args);
        };
        try {
          await adapter.transaction({ isolation: "read_committed" }, async () => {
            await adapter.materializeTransactions();
            const countBefore = await sampleCount();
            await adapter2.execute("INSERT INTO `samples` (value) VALUES (1)");
            const countAfter = await sampleCount();
            expect(countAfter).toBe(countBefore + 1);
          });
        } finally {
          delete (adapter as any).internalExecute;
        }
        expect(firstBeginFailed).toBe(true);
      } finally {
        await adapter2.close();
      }
    });
  });
});
