import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { assertDifference, assertNoDifference, assertRaises } from "@blazetrails/activesupport";
import { Thread } from "@blazetrails/ruby-compat";
import {
  describeIfMysqlAdapter,
  isMariaDb,
  leaseMysqlAdapter,
  Mysql2Adapter,
  MYSQL_TEST_URL,
} from "./test-helper.js";
import { Base } from "../../base.js";
import {
  StatementTimeout,
  QueryAborted,
  ConnectionFailed,
  LockWaitTimeout,
  QueryCanceled,
} from "../../errors.js";
import type { Mysql2RawResult } from "../../connection-adapters/mysql2/database-statements.js";

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

    it.skipIf(isMariaDb)("raises StatementTimeout when statement timeout exceeded", async () => {
      await adapter.execute("INSERT INTO `samples` (value) VALUES (1)");
      const result = (await adapter.execute("SELECT id FROM `samples` LIMIT 1")) as Mysql2RawResult;
      const id = Number(result.rows![0][0]);

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
          error = await assertRaises([StatementTimeout], {}, () =>
            adapter.transaction(async () => {
              await latch1;
              await adapter.execute("SET max_execution_time = 1");
              await adapter.execute(`SELECT * FROM \`samples\` WHERE id = ${id} FOR UPDATE`);
            }),
          );
        } finally {
          await adapter.execute("SET max_execution_time = DEFAULT").catch(() => {});
          latch2Resolve();
          await thread.catch(() => {});
        }
      } finally {
        await adapter2.disconnectBang();
      }

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
      const sampleCount = async (): Promise<number> => {
        const result = (await adapter.execute(
          "SELECT COUNT(*) AS n FROM `samples`",
        )) as Mysql2RawResult;
        return Number(result.rows![0][0]);
      };

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        await adapter.transaction(async () => {
          await adapter.materializeTransactions();
          await assertNoDifference(sampleCount, null, () =>
            adapter2.execute("INSERT INTO `samples` (value) VALUES (1)"),
          );
        });

        await adapter.transaction({ isolation: ":read_committed" }, async () => {
          await adapter.materializeTransactions();
          await assertDifference(sampleCount, +1, null, () =>
            adapter2.execute("INSERT INTO `samples` (value) VALUES (1)"),
          );
        });

        let firstBeginFailed = false;
        const origPerformQuery = (adapter as any).performQuery.bind(adapter);
        (adapter as any).performQuery = async (
          rawConnection: unknown,
          sql: string,
          ...args: any[]
        ) => {
          if (sql.includes("BEGIN") && !firstBeginFailed) {
            firstBeginFailed = true;
            throw new ConnectionFailed("Simulated failure");
          }
          return origPerformQuery(rawConnection, sql, ...args);
        };
        try {
          await adapter.transaction({ isolation: ":read_committed" }, async () => {
            await adapter.materializeTransactions();
            await assertDifference(sampleCount, +1, null, () =>
              adapter2.execute("INSERT INTO `samples` (value) VALUES (1)"),
            );
          });
        } finally {
          delete (adapter as any).performQuery;
        }
        expect(firstBeginFailed).toBeTruthy();
      } finally {
        await adapter2.disconnectBang();
      }
    });
  });
});
