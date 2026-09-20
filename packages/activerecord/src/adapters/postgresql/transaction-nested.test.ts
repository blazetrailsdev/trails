import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { assertRaises } from "@blazetrails/activesupport";
import { describeIfPg, leasePgAdapter } from "./test-helper.js";
import type { PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { registerModel } from "../../associations.js";
import { Base } from "../../base.js";
import { SerializationFailure, Deadlocked } from "../../errors.js";
import { SavepointTransaction } from "../../connection-adapters/abstract/transaction.js";

class Sample extends Base {
  declare id: number;
  declare value: number | null;
  static {
    this.tableName = "samples";
  }
}
class Bit extends Base {
  declare id: number;
  declare value: number | null;
  static {
    this.tableName = "bits";
  }
}
registerModel([Sample, Bit]);

function cyclicBarrier(parties: number): { wait: () => Promise<void> } {
  let count = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return {
    wait: () => {
      if (++count >= parties) release();
      return gate;
    },
  };
}

function event(): { set: () => void; wait: (seconds?: number) => Promise<void> } {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return {
    set: () => release(),
    wait: (seconds?: number) =>
      seconds === undefined
        ? gate
        : Promise.race([gate, new Promise<void>((r) => setTimeout(r, seconds * 1000))]),
  };
}

async function withWarningSuppression<T>(fn: () => Promise<T>): Promise<T> {
  const connection = await leasePgAdapter();
  const logLevel = await connection.clientMinMessages();
  await connection.setClientMinMessages("error");
  try {
    return await fn();
  } finally {
    Base.connectionHandler.clearActiveConnectionsBang("all");
    await (await leasePgAdapter()).setClientMinMessages(logLevel);
  }
}

async function makeParentTransactionDirty(): Promise<void> {
  await Bit.take();
}

async function assertCurrentTransactionIsSavepointTransaction(): Promise<void> {
  const currentTransaction = (await Sample.leaseConnection()).currentTransaction();
  if (!(currentTransaction instanceof SavepointTransaction)) {
    expect.fail("current transaction is not a savepoint transaction");
  }
}

describeIfPg("PostgreSQLAdapter", () => {
  describe("PostgresqlTransactionNestedTest", () => {
    fixtures([], { useTransactionalTests: false });

    beforeEach(async () => {
      const connection = await leasePgAdapter();
      await connection.transaction(async () => {
        await connection.dropTable("samples", "bits", { ifExists: true });
        await connection.createTable("samples", (t) => {
          t.integer("value");
        });
        await connection.createTable("bits", (t) => {
          t.integer("value");
        });
      });

      Sample.resetColumnInformation();
      Bit.resetColumnInformation();
    });

    afterEach(async () => {
      Base.connectionHandler.clearActiveConnectionsBang("all");
      const connection = await leasePgAdapter();
      await connection.dropTable("samples", "bits", { ifExists: true });
    });

    it("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {
      await assertRaises([SerializationFailure], {}, async () => {
        const before = cyclicBarrier(2);
        const after = cyclicBarrier(2);

        const thread = new Thread(async () =>
          withWarningSuppression(async () =>
            Sample.transaction(
              async () => {
                await makeParentTransactionDirty();
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await before.wait();
                    await Sample.create({ value: await Sample.sum("value") });
                    await after.wait();
                  },
                  { requiresNew: true },
                );
              },
              { isolation: ":serializable", requiresNew: false },
            ),
          ),
        ).value();

        try {
          await withWarningSuppression(async () =>
            Sample.transaction(
              async () => {
                await makeParentTransactionDirty();
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await before.wait();
                    await Sample.create({ value: await Sample.sum("value") });
                    await after.wait();
                  },
                  { requiresNew: true },
                );
              },
              { isolation: ":serializable", requiresNew: false },
            ),
          );
        } finally {
          await thread;
        }
      });
    });

    it("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {
      const startRight = event();
      const commitLeft = event();
      const finishRight = event();
      await Sample.create({ value: 1 });

      const thread = new Thread(async () =>
        withWarningSuppression(async () => {
          await Sample.transaction(
            async () => {
              await Sample.updateAll({ value: 2 });
              startRight.set();
              await commitLeft.wait(1);
            },
            { isolation: ":serializable", requiresNew: false },
          );
          finishRight.set();
        }),
      ).value();

      try {
        await withWarningSuppression(async () => {
          await startRight.wait();
          await Sample.transaction(
            async () => {
              await makeParentTransactionDirty();
              await expect(
                Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await Sample.create({ value: 3 });
                    commitLeft.set();
                    await finishRight.wait(2);
                    await Sample.updateAll({ value: 4 });
                  },
                  { requiresNew: true },
                ),
              ).rejects.toThrow(SerializationFailure);
              await Bit.create({ value: 1 });
            },
            { isolation: ":serializable", requiresNew: false },
          );
        });
      } finally {
        await thread;
      }

      expect(await Sample.pluck("value")).toEqual([2]);
      expect(await Bit.pluck("value")).toEqual([1]);
    });

    it("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {
      await withWarningSuppression(async () => {
        const connections = new Set<PostgreSQLAdapter>();
        await assertRaises([Deadlocked], {}, async () => {
          const barrier = cyclicBarrier(2);

          const s1 = await Sample.create({ value: 1 });
          const s2 = await Sample.create({ value: 2 });

          const thread = new Thread(async () => {
            connections.add((await Sample.leaseConnection()) as PostgreSQLAdapter);
            await Sample.transaction(
              async () => {
                await makeParentTransactionDirty();
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await s1.lockBang();
                    await barrier.wait();
                    await s2.update({ value: 1 });
                  },
                  { requiresNew: true },
                );
              },
              { requiresNew: false },
            );
          }).value();

          try {
            connections.add((await Sample.leaseConnection()) as PostgreSQLAdapter);
            await Sample.transaction(
              async () => {
                await makeParentTransactionDirty();
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await s2.lockBang();
                    await barrier.wait();
                    await s1.update({ value: 2 });
                  },
                  { requiresNew: true },
                );
              },
              { requiresNew: false },
            );
          } finally {
            await thread;
          }
        });
        const active = await Promise.all([...connections].map((c) => c.active()));
        expect(active.every(Boolean)).toBeTruthy();
      });
    });

    it("deadlock inside nested SavepointTransaction is recoverable", async () => {
      await withWarningSuppression(async () => {
        const barrier = cyclicBarrier(2);
        let deadlocks = 0;

        const s1 = await Sample.create({ value: 1 });
        const s2 = await Sample.create({ value: 2 });

        const thread = new Thread(async () =>
          Sample.transaction(
            async () => {
              await makeParentTransactionDirty();
              try {
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await s1.lockBang();
                    await barrier.wait();
                    await s2.update({ value: 4 });
                  },
                  { requiresNew: true },
                );
              } catch (e) {
                if (!(e instanceof Deadlocked)) throw e;
                deadlocks += 1;
              }
              await s2.update({ value: 10 });
            },
            { requiresNew: false },
          ),
        ).value();

        try {
          await Sample.transaction(
            async () => {
              await makeParentTransactionDirty();
              try {
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await s2.lockBang();
                    await barrier.wait();
                    await s1.update({ value: 3 });
                  },
                  { requiresNew: true },
                );
              } catch (e) {
                if (!(e instanceof Deadlocked)) throw e;
                deadlocks += 1;
              }
              await s1.update({ value: 10 });
            },
            { requiresNew: false },
          );
        } finally {
          await thread;
        }

        expect(deadlocks).toBe(1);
        expect(await Sample.pluck("value")).toEqual([10, 10]);
      });
    });
  });
});
