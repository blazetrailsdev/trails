/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_test.rb
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
    // The global beforeEach (test-setup-ar) drops all tables, so create the
    // table here — after the reset — rather than in beforeAll.
    beforeEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS lock_tests");
      await adapter.exec("CREATE TABLE lock_tests (id int PRIMARY KEY, value int DEFAULT 0)");
      await adapter.execute("INSERT INTO lock_tests VALUES (1, 0), (2, 0)");
    });
    afterEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS lock_tests");
    });

    it("raises SerializationFailure when a serialization failure occurs", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginIsolatedDbTransaction("serializable");
        await other.beginIsolatedDbTransaction("serializable");
        await adapter.execute("SELECT * FROM lock_tests");
        await other.execute("SELECT * FROM lock_tests");
        await other.execute("UPDATE lock_tests SET value = 1 WHERE id = 1");
        await other.commitDbTransaction();
        await expect(
          adapter.execute("UPDATE lock_tests SET value = 2 WHERE id = 1"),
        ).rejects.toThrow(SerializationFailure);
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
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        const rows = await adapter.execute("SELECT pg_backend_pid() AS pid");
        const pid = (rows[0] as { pid: number }).pid;
        const slow = adapter.execute("SELECT pg_sleep(5)");
        await new Promise<void>((r) => setTimeout(r, 50));
        await other.execute("SELECT pg_cancel_backend(?)", [pid]);
        await expect(slow).rejects.toThrow(QueryCanceled);
      } finally {
        await other.close();
      }
    });

    it("raises Deadlocked when a deadlock is encountered", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await adapter.execute("UPDATE lock_tests SET value = 1 WHERE id = 1");
        await other.execute("UPDATE lock_tests SET value = 2 WHERE id = 2");
        const [r1, r2] = await Promise.allSettled([
          adapter.execute("UPDATE lock_tests SET value = 3 WHERE id = 2"),
          other.execute("UPDATE lock_tests SET value = 4 WHERE id = 1"),
        ]);
        const errs = [r1, r2].filter((r) => r.status === "rejected");
        expect(errs).toHaveLength(1);
        expect((errs[0] as PromiseRejectedResult).reason).toBeInstanceOf(Deadlocked);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });

    it("raises LockWaitTimeout when lock wait timeout exceeded", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await adapter.execute("SELECT * FROM lock_tests WHERE id = 1 FOR UPDATE");
        await other.execute("SET lock_timeout = '100ms'");
        await expect(
          other.execute("SELECT * FROM lock_tests WHERE id = 1 FOR UPDATE"),
        ).rejects.toThrow(LockWaitTimeout);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });

    it("raises QueryCanceled when canceling statement due to user request", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        const rows = await adapter.execute("SELECT pg_backend_pid() AS pid");
        const pid = (rows[0] as { pid: number }).pid;
        const slow = adapter.execute("SELECT pg_sleep(5)");
        await new Promise<void>((r) => setTimeout(r, 50));
        await other.execute("SELECT pg_cancel_backend(?)", [pid]);
        await expect(slow).rejects.toThrow(QueryCanceled);
      } finally {
        await other.close();
      }
    });
  });
});
