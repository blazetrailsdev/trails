/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/nested_deadlock_test.rb
 *
 * Rails provokes a real InnoDB deadlock by running competing nested
 * (savepoint) transactions on two Ruby Threads synchronized with a
 * Concurrent::CyclicBarrier. This port drives the same interleave on two
 * adapter connections raced with Promise.allSettled and an async barrier.
 * Rails' own test creates the `samples` table inline, so the inline
 * DROP/CREATE here is faithful.
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Deadlocked, Rollback } from "../../errors.js";
import { SavepointTransaction } from "../../connection-adapters/abstract/transaction.js";

function createBarrier(n: number): { wait: () => Promise<void> } {
  let count = 0;
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    wait: () => {
      count++;
      if (count >= n) resolve();
      return promise;
    },
  };
}

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
    let s1id: number;
    let s2id: number;

    beforeEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `samples`");
      await adapter.execute(
        "CREATE TABLE `samples` (id INT AUTO_INCREMENT PRIMARY KEY, value INT)",
      );
      await adapter.execute("INSERT INTO `samples` (value) VALUES (1)");
      await adapter.execute("INSERT INTO `samples` (value) VALUES (2)");
      const rows = await adapter.execute("SELECT id FROM `samples` ORDER BY id");
      s1id = Number(rows[0]["id"]);
      s2id = Number(rows[1]["id"]);
    });
    afterEach(async () => {
      await adapter.execute("DROP TABLE IF EXISTS `samples`").catch(() => {});
    });

    /**
     * The shared interleave: each connection opens a parent transaction,
     * dirties it (forcing the nested `requiresNew` transaction onto a
     * savepoint), row-locks its own sample, waits at the barrier, then
     * updates the other's row — guaranteeing InnoDB detects a deadlock on
     * exactly one side. `onDeadlock` mirrors each Rails test's rescue
     * placement: undefined lets Deadlocked propagate out of the nested
     * transaction and doom the whole block.
     */
    async function raceNestedTransactions(
      adapter2: Mysql2Adapter,
      onDeadlock?: "rollback" | "swallow",
    ): Promise<{ results: PromiseSettledResult<void>[]; deadlocks: number }> {
      const barrier = createBarrier(2);
      let deadlocks = 0;

      const side = async (
        a: Mysql2Adapter,
        lockId: number,
        updateId: number,
        value: number,
      ): Promise<void> => {
        await a.transaction(async () => {
          await makeParentDirty(a);
          const nested = a.transaction({ requiresNew: true }, async () => {
            assertSavepoint(a);
            await a.execute(`SELECT * FROM \`samples\` WHERE id = ${lockId} FOR UPDATE`);
            await barrier.wait();
            try {
              await a.executeMutation(
                `UPDATE \`samples\` SET value = ${value} WHERE id = ${updateId}`,
              );
            } catch (e) {
              if (onDeadlock === "rollback" && e instanceof Deadlocked) {
                deadlocks++;
                throw new Rollback();
              }
              throw e;
            }
          });
          if (onDeadlock === "swallow") {
            try {
              await nested;
            } catch (e) {
              if (!(e instanceof Deadlocked)) throw e;
              deadlocks++;
            }
          } else {
            await nested;
          }
          // Rails' first test ends at the nested transaction; only the
          // recovery tests follow it with the outer `update value: 10`.
          if (onDeadlock !== undefined) {
            await a.executeMutation(`UPDATE \`samples\` SET value = 10 WHERE id = ${updateId}`);
          }
        });
      };

      const results = await Promise.allSettled([
        side(adapter, s1id, s2id, onDeadlock ? 4 : 1),
        side(adapter2, s2id, s1id, onDeadlock ? 3 : 2),
      ]);
      return { results, deadlocks };
    }

    async function expectFinalValues(values: number[]): Promise<void> {
      const finalRows = await adapter.execute("SELECT value FROM `samples` ORDER BY id");
      expect(finalRows.map((r) => Number(r["value"]))).toEqual(values);
    }

    it("deadlock correctly raises Deadlocked inside nested SavepointTransaction", async () => {
      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        const { results } = await raceNestedTransactions(adapter2);

        const errors = results.filter((r) => r.status === "rejected").map((r) => r.reason);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(Deadlocked);

        expect(adapter.active).toBe(true);
        expect(adapter2.active).toBe(true);
      } finally {
        await adapter2.close();
      }
    });

    it("rollback exception is swallowed after a rollback", async () => {
      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        const { results, deadlocks } = await raceNestedTransactions(adapter2, "rollback");

        expect(results[0].status).toBe("fulfilled");
        expect(results[1].status).toBe("fulfilled");
        expect(deadlocks).toBe(1);
        await expectFinalValues([10, 10]);
      } finally {
        await adapter2.close();
      }
    });

    it("deadlock inside nested SavepointTransaction is recoverable", async () => {
      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        const { results, deadlocks } = await raceNestedTransactions(adapter2, "swallow");

        expect(results[0].status).toBe("fulfilled");
        expect(results[1].status).toBe("fulfilled");
        expect(deadlocks).toBe(1);
        await expectFinalValues([10, 10]);
      } finally {
        await adapter2.close();
      }
    });
  });
});
