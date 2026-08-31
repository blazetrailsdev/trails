import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { withExecutionContext } from "../../connection-adapters/abstract/connection-pool/execution-context.js";
import { describeIfPg } from "./test-helper.js";
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

function event(): { set: () => void; wait: () => Promise<void> } {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return { set: () => release(), wait: () => gate };
}

async function leasePgAdapter(): Promise<PostgreSQLAdapter> {
  return (await Base.leaseConnection()) as unknown as PostgreSQLAdapter;
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
      const before = cyclicBarrier(2);
      const after = cyclicBarrier(2);

      const side = async (): Promise<void> =>
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
            { isolation: "serializable", requiresNew: false },
          ),
        );

      const thread = withExecutionContext(side);
      const outcomes = await Promise.allSettled([thread, side()]);
      const errors = outcomes.filter((o) => o.status === "rejected").map((o) => o.reason);

      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0]).toBeInstanceOf(SerializationFailure);
    });

    it("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {
      const startRight = event();
      const commitLeft = event();
      const finishRight = event();
      await Sample.create({ value: 1 });

      const thread = withExecutionContext(async () =>
        withWarningSuppression(async () => {
          await Sample.transaction(
            async () => {
              await Sample.updateAll({ value: 2 });
              startRight.set();
              await commitLeft.wait();
            },
            { isolation: "serializable", requiresNew: false },
          );
          finishRight.set();
        }),
      );

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
                    await finishRight.wait();
                    await Sample.updateAll({ value: 4 });
                  },
                  { requiresNew: true },
                ),
              ).rejects.toThrow(SerializationFailure);
              await Bit.create({ value: 1 });
            },
            { isolation: "serializable", requiresNew: false },
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
        const connections = new Set<unknown>();
        const barrier = cyclicBarrier(2);

        const s1 = await Sample.create({ value: 1 });
        const s2 = await Sample.create({ value: 2 });

        const side = async (locked: Sample, updated: Sample, value: number): Promise<void> => {
          connections.add(await Sample.leaseConnection());
          return Sample.transaction(
            async () => {
              await makeParentTransactionDirty();
              await Sample.transaction(
                async () => {
                  await assertCurrentTransactionIsSavepointTransaction();
                  await locked.lockBang();
                  await barrier.wait();
                  await updated.update({ value });
                },
                { requiresNew: true },
              );
            },
            { requiresNew: false },
          );
        };

        const thread = withExecutionContext(async () => side(s1, s2, 1));
        const outcomes = await Promise.allSettled([thread, side(s2, s1, 2)]);
        const errors = outcomes.filter((o) => o.status === "rejected").map((o) => o.reason);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toBeInstanceOf(Deadlocked);

        for (const connection of connections) {
          expect(await (connection as PostgreSQLAdapter).active()).toBe(true);
        }
      });
    });

    it("deadlock inside nested SavepointTransaction is recoverable", async () => {
      await withWarningSuppression(async () => {
        const barrier = cyclicBarrier(2);
        let deadlocks = 0;

        const s1 = await Sample.create({ value: 1 });
        const s2 = await Sample.create({ value: 2 });

        const side = async (locked: Sample, updated: Sample, value: number): Promise<void> =>
          Sample.transaction(
            async () => {
              await makeParentTransactionDirty();
              try {
                await Sample.transaction(
                  async () => {
                    await assertCurrentTransactionIsSavepointTransaction();
                    await locked.lockBang();
                    await barrier.wait();
                    await updated.update({ value });
                  },
                  { requiresNew: true },
                );
              } catch (e) {
                if (!(e instanceof Deadlocked)) throw e;
                deadlocks += 1;
              }
              await updated.update({ value: 10 });
            },
            { requiresNew: false },
          );

        const thread = withExecutionContext(async () => side(s1, s2, 4));
        await side(s2, s1, 3);
        await thread;

        expect(deadlocks).toBe(1);
        expect(await Sample.pluck("value")).toEqual([10, 10]);
      });
    });
  });
});
