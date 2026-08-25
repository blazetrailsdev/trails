/**
 * Mirrors Rails
 * activerecord/test/cases/adapters/abstract_mysql_adapter/nested_deadlock_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { withExecutionContext } from "../../connection-adapters/abstract/connection-pool/execution-context.js";
import { describeIfMysqlAdapter, leaseMysqlAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { registerModel } from "../../associations.js";
import { Base } from "../../base.js";
import { Deadlocked, Rollback, StatementInvalid } from "../../errors.js";
import { SavepointTransaction } from "../../connection-adapters/abstract/transaction.js";

// Rails' `class Sample < ActiveRecord::Base` (nested_deadlock_test.rb:9-12) —
// an inline model over the table the test creates itself.
class Sample extends Base {
  declare id: number;
  declare value: number | null;
  static {
    this.tableName = "samples";
  }
}
registerModel([Sample]);

// `Concurrent::CyclicBarrier.new(2)` (nested_deadlock_test.rb:38).
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

// nested_deadlock_test.rb:177-180 — dirty the parent transaction so the next
// nested one is a savepoint transaction.
async function makeParentTransactionDirty(): Promise<void> {
  await Sample.take();
}

// nested_deadlock_test.rb:182-187.
async function assertCurrentTransactionIsSavepointTransaction(): Promise<void> {
  const currentTransaction = (await Sample.leaseConnection()).currentTransaction();
  expect(currentTransaction).toBeInstanceOf(SavepointTransaction);
}

// nested_deadlock_test.rb:64-70 — the savepoint race surfaces as an opaque
// StatementInvalid, so Rails flunks with a diagnosis rather than re-raising it.
function flunkOnLostSavepoint(errors: unknown[]): void {
  const lost = errors.find(
    (e) =>
      e instanceof StatementInvalid && /SAVEPOINT active_record_. does not exist/.test(String(e)),
  );
  if (lost === undefined) return;
  expect.fail(
    `ROLLBACK TO SAVEPOINT query issued for savepoint that no longer exists due to deadlock: ${String(lost)}`,
  );
}

describeIfMysqlAdapter("Mysql2Adapter", () => {
  describe("NestedDeadlockTest", () => {
    fixtures([], { useTransactionalTests: false });

    beforeEach(async () => {
      const connection = await leaseMysqlAdapter();
      await connection.clearCache();
      await connection.createTable("samples", { force: true }, (t) => {
        t.integer("value");
      });
      Sample.resetColumnInformation();
    });

    afterEach(async () => {
      const connection = await leaseMysqlAdapter();
      await connection.dropTable("samples", { ifExists: true });
    });

    it("deadlock correctly raises Deadlocked inside nested SavepointTransaction", async () => {
      const connection = await Sample.leaseConnection();
      const barrier = cyclicBarrier(2);

      const s1 = await Sample.create({ value: 1 });
      const s2 = await Sample.create({ value: 2 });

      // Rails' `Thread.new` (nested_deadlock_test.rb:45). `withExecutionContext`
      // is the trails analogue for the part that matters here: the pool leases
      // per execution context (connection_pool.rb:711 `connection_lease`), so
      // the two sides run on two connections and can really deadlock.
      const thread = withExecutionContext(async () =>
        Sample.transaction(async () => {
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
        }),
      );

      const main = Sample.transaction(async () => {
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
      });

      const outcomes = await Promise.allSettled([thread, main]);
      const errors = outcomes.filter((o) => o.status === "rejected").map((o) => o.reason);
      flunkOnLostSavepoint(errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(Deadlocked);

      expect(await connection.active()).toBe(true);
    });

    it("rollback exception is swallowed after a rollback", async () => {
      const barrier = cyclicBarrier(2);
      let deadlocks = 0;

      const s1 = await Sample.create({ value: 1 });
      const s2 = await Sample.create({ value: 2 });

      const side = async (locked: Sample, updated: Sample, value: number): Promise<void> =>
        Sample.transaction(async () => {
          await makeParentTransactionDirty();
          await Sample.transaction(
            async () => {
              try {
                await assertCurrentTransactionIsSavepointTransaction();
                await locked.lockBang();
                await barrier.wait();
                await updated.update({ value });
              } catch (e) {
                if (!(e instanceof Deadlocked)) throw e;
                deadlocks += 1;
                // nested_deadlock_test.rb:99-101: "This rollback is actually
                // wrong as mysql automatically rollbacks the transaction which
                // means we have nothing to rollback on the db side but we
                // expect the framework to handle our mistake gracefully".
                throw new Rollback();
              }
            },
            { requiresNew: true },
          );
          await updated.update({ value: 10 });
        });

      const thread = withExecutionContext(async () => side(s1, s2, 4));
      await side(s2, s1, 3);
      await thread;

      expect(deadlocks).toBe(1);
      expect(await Sample.pluck("value")).toEqual([10, 10]);
    });

    it("deadlock inside nested SavepointTransaction is recoverable", async () => {
      const barrier = cyclicBarrier(2);
      let deadlocks = 0;

      const s1 = await Sample.create({ value: 1 });
      const s2 = await Sample.create({ value: 2 });

      const side = async (locked: Sample, updated: Sample, value: number): Promise<void> =>
        Sample.transaction(async () => {
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
        });

      const thread = withExecutionContext(async () => side(s1, s2, 4));
      await side(s2, s1, 3);
      await thread;

      expect(deadlocks).toBe(1);
      expect(await Sample.pluck("value")).toEqual([10, 10]);
    });
  });
});
