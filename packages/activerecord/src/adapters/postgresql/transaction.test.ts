/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_test.rb
 *
 * Rails drives these through `Sample.transaction`; this port drives the same
 * SQLSTATE -> exception mapping at the adapter level (two `PostgreSQLAdapter`
 * instances coordinating real conflicts), the idiom for `adapters/postgresql/`.
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SerializationFailure, Deadlocked, LockWaitTimeout, QueryCanceled } from "../../errors.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLTransactionTest", () => {
    // Mirrors Rails' setup/teardown (samples table, value column). Created in
    // beforeEach — after the global reset (test-setup-ar drops all tables).
    beforeEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS samples");
      await adapter.exec("CREATE TABLE samples (id int PRIMARY KEY, value integer)");
      await adapter.execute("INSERT INTO samples VALUES (1, 0), (2, 0)");
    });
    afterEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS samples");
    });

    it("raises SerializationFailure when a serialization failure occurs", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginIsolatedDbTransaction("serializable");
        await other.beginIsolatedDbTransaction("serializable");
        // Both read the same set, then both write based on it — the second
        // write to commit raises serialization_failure.
        await adapter.execute("SELECT sum(value) FROM samples");
        await other.execute("SELECT sum(value) FROM samples");
        await other.execute("UPDATE samples SET value = 1 WHERE id = 1");
        await other.commitDbTransaction();
        await expect(adapter.execute("UPDATE samples SET value = 2 WHERE id = 1")).rejects.toThrow(
          SerializationFailure,
        );
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });

    it("raises QueryCanceled when statement timeout exceeded", async () => {
      await adapter.execute("SET statement_timeout = '100ms'");
      await expect(adapter.execute("SELECT pg_sleep(1)")).rejects.toThrow(QueryCanceled);
    });

    it("raises Interrupt when canceling statement via interrupt", async () => {
      // Rails injects a Ruby `Interrupt` (`thread.raise Interrupt`) and asserts
      // the statement aborts promptly (duration < 5s). Node has no thread-
      // interrupt analog, so we cancel the backend from a second connection
      // (libpq's PQcancel, what Ruby's interrupt handler ultimately sends) —
      // same QueryCanceled (57014), same observable: the long query is aborted.
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        const rows = await adapter.execute("SELECT pg_backend_pid() AS pid");
        const pid = (rows[0] as { pid: number }).pid;
        const start = Date.now();
        // Attach the handler at creation so the canceled query is never
        // momentarily unhandled while we await the cancel (vitest fails on
        // unhandled rejections).
        let slowError: unknown;
        const slow = adapter.execute("SELECT pg_sleep(10)").catch((e) => {
          slowError = e;
        });
        await new Promise<void>((r) => setTimeout(r, 500));
        await other.execute("SELECT pg_cancel_backend(?)", [pid]);
        await slow;
        expect(slowError).toBeInstanceOf(QueryCanceled);
        expect(Date.now() - start).toBeLessThan(5000);
      } finally {
        await other.close();
      }
    });

    it("raises Deadlocked when a deadlock is encountered", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await adapter.execute("UPDATE samples SET value = 1 WHERE id = 1");
        await other.execute("UPDATE samples SET value = 2 WHERE id = 2");
        // Each now waits on the row the other holds — deadlock; PG aborts one.
        const [r1, r2] = await Promise.allSettled([
          adapter.execute("UPDATE samples SET value = 3 WHERE id = 2"),
          other.execute("UPDATE samples SET value = 4 WHERE id = 1"),
        ]);
        const errs = [r1, r2].filter((r) => r.status === "rejected");
        expect(errs).toHaveLength(1);
        expect((errs[0] as PromiseRejectedResult).reason).toBeInstanceOf(Deadlocked);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
      }
      // Mirrors Rails' `assert connections.all?(&:active?)` — both connections
      // remain usable after the deadlock.
      expect((await adapter.execute("SELECT 1 AS n"))[0].n).toBe(1);
      expect((await other.execute("SELECT 1 AS n"))[0].n).toBe(1);
      await other.close();
    });

    it("raises LockWaitTimeout when lock wait timeout exceeded", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await adapter.execute("SELECT * FROM samples WHERE id = 1 FOR UPDATE");
        await other.execute("SET lock_timeout = '100ms'");
        await expect(
          other.execute("SELECT * FROM samples WHERE id = 1 FOR UPDATE"),
        ).rejects.toThrow(LockWaitTimeout);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });

    it("raises QueryCanceled when canceling statement due to user request", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await adapter.execute("SELECT * FROM samples WHERE id = 1 FOR UPDATE");
        // `other` blocks on the row `adapter` holds; a third connection finds
        // its pid in pg_stat_activity and cancels it — mirrors Rails. Handler
        // attached at creation so the canceled query is never momentarily
        // unhandled while we await the cancel (vitest fails on those).
        let blockedError: unknown;
        const blocked = other
          .execute("SELECT * FROM samples WHERE id = 1 FOR UPDATE")
          .catch((e) => {
            blockedError = e;
          });
        await new Promise<void>((r) => setTimeout(r, 200));
        const canceler = new PostgreSQLAdapter(PG_TEST_URL);
        try {
          await canceler.execute(
            "SELECT pg_cancel_backend(pid) FROM pg_stat_activity " +
              "WHERE state = 'active' AND query LIKE '% FOR UPDATE'",
          );
          await blocked;
          expect(blockedError).toBeInstanceOf(QueryCanceled);
        } finally {
          await canceler.close();
        }
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });
  });
});
