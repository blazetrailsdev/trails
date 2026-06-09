/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/nested_deadlock_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Deadlocked, Rollback } from "../../errors.js";

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

    it("deadlock correctly raises Deadlocked inside nested SavepointTransaction", async () => {
      await adapter.execute("INSERT INTO `samples` (value) VALUES (1)");
      await adapter.execute("INSERT INTO `samples` (value) VALUES (2)");
      const rows = await adapter.execute("SELECT id FROM `samples` ORDER BY id");
      const s1id = Number(rows[0]["id"]);
      const s2id = Number(rows[1]["id"]);

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        const barrier = createBarrier(2);

        const [result1, result2] = await Promise.allSettled([
          (async () => {
            await adapter.transaction(async () => {
              await adapter.execute("SELECT * FROM `samples` LIMIT 1");
              await adapter.transaction({ requiresNew: true }, async () => {
                await adapter.execute(`SELECT * FROM \`samples\` WHERE id = ${s1id} FOR UPDATE`);
                await barrier.wait();
                await adapter.executeMutation(
                  `UPDATE \`samples\` SET value = 1 WHERE id = ${s2id}`,
                );
              });
            });
          })(),
          (async () => {
            await adapter2.transaction(async () => {
              await adapter2.execute("SELECT * FROM `samples` LIMIT 1");
              await adapter2.transaction({ requiresNew: true }, async () => {
                await adapter2.execute(`SELECT * FROM \`samples\` WHERE id = ${s2id} FOR UPDATE`);
                await barrier.wait();
                await adapter2.executeMutation(
                  `UPDATE \`samples\` SET value = 2 WHERE id = ${s1id}`,
                );
              });
            });
          })(),
        ]);

        const errors = [result1, result2]
          .filter((r) => r.status === "rejected")
          .map((r) => (r as PromiseRejectedResult).reason);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(Deadlocked);

        expect(adapter.active).toBe(true);
        expect(adapter2.active).toBe(true);
      } finally {
        await adapter2.close();
      }
    });

    it("rollback exception is swallowed after a rollback", async () => {
      await adapter.execute("INSERT INTO `samples` (value) VALUES (1)");
      await adapter.execute("INSERT INTO `samples` (value) VALUES (2)");
      const rows = await adapter.execute("SELECT id FROM `samples` ORDER BY id");
      const s1id = Number(rows[0]["id"]);
      const s2id = Number(rows[1]["id"]);

      const adapter2 = new Mysql2Adapter(MYSQL_TEST_URL);
      try {
        const barrier = createBarrier(2);
        let deadlocks = 0;

        const [result1, result2] = await Promise.allSettled([
          (async () => {
            await adapter.transaction(async () => {
              await adapter.execute("SELECT * FROM `samples` LIMIT 1");
              await adapter.transaction({ requiresNew: true }, async () => {
                await adapter.execute(`SELECT * FROM \`samples\` WHERE id = ${s1id} FOR UPDATE`);
                await barrier.wait();
                try {
                  await adapter.executeMutation(
                    `UPDATE \`samples\` SET value = 4 WHERE id = ${s2id}`,
                  );
                } catch (e) {
                  if (e instanceof Deadlocked) {
                    deadlocks++;
                    throw new Rollback();
                  }
                  throw e;
                }
              });
              await adapter.executeMutation(`UPDATE \`samples\` SET value = 10 WHERE id = ${s2id}`);
            });
          })(),
          (async () => {
            await adapter2.transaction(async () => {
              await adapter2.execute("SELECT * FROM `samples` LIMIT 1");
              await adapter2.transaction({ requiresNew: true }, async () => {
                await adapter2.execute(`SELECT * FROM \`samples\` WHERE id = ${s2id} FOR UPDATE`);
                await barrier.wait();
                try {
                  await adapter2.executeMutation(
                    `UPDATE \`samples\` SET value = 3 WHERE id = ${s1id}`,
                  );
                } catch (e) {
                  if (e instanceof Deadlocked) {
                    deadlocks++;
                    throw new Rollback();
                  }
                  throw e;
                }
              });
              await adapter2.executeMutation(
                `UPDATE \`samples\` SET value = 10 WHERE id = ${s1id}`,
              );
            });
          })(),
        ]);

        expect(result1.status).toBe("fulfilled");
        expect(result2.status).toBe("fulfilled");
        expect(deadlocks).toBe(1);

        const finalRows = await adapter.execute("SELECT value FROM `samples` ORDER BY id");
        expect(finalRows.map((r) => Number(r["value"]))).toEqual([10, 10]);
      } finally {
        await adapter2.close();
      }
    });
  });

  // -- Rails: abstract_mysql_adapter/sql_types_test.rb --
});
