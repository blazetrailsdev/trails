import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { assertDifference, assertNoDifference, assertRaises } from "@blazetrails/activesupport";
import { Thread } from "@blazetrails/ruby-compat";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { Base } from "../../base.js";
import {
  StatementTimeout,
  QueryAborted,
  ConnectionFailed,
  LockWaitTimeout,
  QueryCanceled,
} from "../../errors.js";

class Sample extends Base {
  declare id: number;
  declare value: number | null;
  static {
    this.tableName = "samples";
  }
}

function countDownLatch(): { countDown: () => void; wait: () => Promise<void> } {
  let countDown!: () => void;
  const latch = new Promise<void>((r) => {
    countDown = r;
  });
  return { countDown, wait: () => latch };
}

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("TransactionTest", () => {
    beforeEach(async () => {
      await adapter.clearCacheBang();

      await adapter.transaction(async () => {
        await adapter.dropTable("samples", { ifExists: true });
        await adapter.createTable("samples", {}, (t) => {
          t.integer("value");
        });
      });

      Sample.resetColumnInformation();
    });
    afterEach(async () => {
      await (await Base.leaseConnection()).dropTable("samples", { ifExists: true });
    });

    it("raises LockWaitTimeout when lock wait timeout exceeded", async () => {
      await assertRaises([LockWaitTimeout], {}, async () => {
        const s = await Sample.createBang({ value: 1 });
        const latch1 = countDownLatch();
        const latch2 = countDownLatch();

        const thread = new Thread(() =>
          Sample.transaction(async () => {
            await Sample.lock().find(s.id);
            latch1.countDown();
            await latch2.wait();
          }),
        );

        try {
          await Sample.transaction(async () => {
            await latch1.wait();
            await (await Sample.leaseConnection()).execute("SET innodb_lock_wait_timeout = 1");
            await Sample.lock().find(s.id);
          });
        } finally {
          await (await Sample.leaseConnection()).execute("SET innodb_lock_wait_timeout = DEFAULT");
          latch2.countDown();
          await thread.join();
        }
      });
    });

    it("raises StatementTimeout when statement timeout exceeded", async (ctx) => {
      ctx.skip((await adapter.showVariable("max_execution_time")) == null);
      const error = await assertRaises([StatementTimeout], {}, async () => {
        const s = await Sample.createBang({ value: 1 });
        const latch1 = countDownLatch();
        const latch2 = countDownLatch();

        const thread = new Thread(() =>
          Sample.transaction(async () => {
            await Sample.lock().find(s.id);
            latch1.countDown();
            await latch2.wait();
          }),
        );

        try {
          await Sample.transaction(async () => {
            await latch1.wait();
            await (await Sample.leaseConnection()).execute("SET max_execution_time = 1");
            await Sample.lock().find(s.id);
          });
        } finally {
          await (await Sample.leaseConnection()).execute("SET max_execution_time = DEFAULT");
          latch2.countDown();
          await thread.join();
        }
      });
      expect(error).toBeInstanceOf(QueryAborted);
    });

    it("raises QueryCanceled when canceling statement due to user request", async () => {
      const error = await assertRaises([QueryCanceled], {}, async () => {
        const s = await Sample.createBang({ value: 1 });
        const latch = countDownLatch();

        const thread = new Thread(() =>
          Sample.transaction(async () => {
            await Sample.lock().find(s.id);
            latch.countDown();
            await new Promise<void>((r) => setTimeout(r, 500));
            const conn = await Sample.leaseConnection();
            const pid = await conn.queryValue(
              "SELECT id FROM information_schema.processlist WHERE info LIKE '% FOR UPDATE'",
            );
            await conn.execute(`KILL QUERY ${pid}`);
          }),
        );

        try {
          await Sample.transaction(async () => {
            await latch.wait();
            await Sample.lock().find(s.id);
          });
        } finally {
          await thread.join();
        }
      });
      expect(error).toBeInstanceOf(QueryAborted);
    });

    it("reconnect preserves isolation level", async () => {
      const pool = Sample.connectionPool();
      const connection = await Sample.leaseConnection();
      try {
        await Sample.transaction(async () => {
          await connection.materializeTransactions();
          await assertNoDifference(
            () => Sample.count(),
            null,
            async () => void (await new Thread(() => Sample.createBang({ value: 1 })).join()),
          );
        });

        await Sample.transaction(
          async () => {
            await connection.materializeTransactions();
            await assertDifference(
              () => Sample.count(),
              +1,
              null,
              async () => void (await new Thread(() => Sample.createBang({ value: 1 })).join()),
            );
          },
          { isolation: ":read_committed" },
        );

        let firstBeginFailed = false;
        const performQuery = (connection as any).performQuery;
        (connection as any).performQuery = async function (
          this: unknown,
          rawConnection: unknown,
          sql: string,
          ...args: unknown[]
        ) {
          if (sql.includes("BEGIN") && !firstBeginFailed) {
            firstBeginFailed = true;
            throw new ConnectionFailed("Simulated failure");
          }
          return performQuery.call(this, rawConnection, sql, ...args);
        };

        await Sample.transaction(
          async () => {
            await connection.materializeTransactions();
            await assertDifference(
              () => Sample.count(),
              +1,
              null,
              async () => void (await new Thread(() => Sample.createBang({ value: 1 })).join()),
            );
          },
          { isolation: ":read_committed" },
        );

        expect(firstBeginFailed).toBeTruthy();
      } finally {
        pool.remove(connection);
        await connection.disconnectBang();
        Sample.releaseConnection();
      }
    });
  });
});
