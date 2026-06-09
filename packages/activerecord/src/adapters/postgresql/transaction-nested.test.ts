/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_nested_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SerializationFailure, Deadlocked } from "../../errors.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLTransactionNestedTest", () => {
    // The global beforeEach (test-setup-ar) drops all tables, so create the
    // table here — after the reset — rather than in beforeAll.
    beforeEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS lock_tests_nested");
      await adapter.exec(
        "CREATE TABLE lock_tests_nested (id int PRIMARY KEY, value int DEFAULT 0)",
      );
      await adapter.execute("INSERT INTO lock_tests_nested VALUES (1, 0), (2, 0)");
    });
    afterEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS lock_tests_nested");
    });

    // Open serializable transactions on both connections, take a savepoint on
    // `adapter`, then commit a conflicting write on `other`. The next write on
    // `adapter` inside the savepoint will raise SerializationFailure.
    async function serializationConflict(): Promise<PostgreSQLAdapter> {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      await other.beginIsolatedDbTransaction("serializable");
      await other.execute("SELECT * FROM lock_tests_nested");
      await adapter.beginIsolatedDbTransaction("serializable");
      await adapter.execute("SELECT * FROM lock_tests_nested");
      await adapter.createSavepoint("sp1");
      await other.execute("UPDATE lock_tests_nested SET value = 1 WHERE id = 1");
      await other.commitDbTransaction();
      return other;
    }

    it("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {
      const other = await serializationConflict();
      try {
        await expect(
          adapter.execute("UPDATE lock_tests_nested SET value = 2 WHERE id = 1"),
        ).rejects.toThrow(SerializationFailure);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });

    it("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {
      const other = await serializationConflict();
      try {
        await expect(
          adapter.execute("UPDATE lock_tests_nested SET value = 2 WHERE id = 1"),
        ).rejects.toThrow(SerializationFailure);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
      // Connection remains usable after the rolled-back transaction.
      await adapter.execute("SELECT 1");
    });

    it("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await adapter.createSavepoint("sp1");
        await adapter.execute("UPDATE lock_tests_nested SET value = 1 WHERE id = 1");
        await other.execute("UPDATE lock_tests_nested SET value = 2 WHERE id = 2");
        const [r1, r2] = await Promise.allSettled([
          adapter.execute("UPDATE lock_tests_nested SET value = 3 WHERE id = 2"),
          other.execute("UPDATE lock_tests_nested SET value = 4 WHERE id = 1"),
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

    it("deadlock inside nested SavepointTransaction is recoverable", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      let deadlocked = false;
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await adapter.createSavepoint("sp1");
        await adapter.execute("UPDATE lock_tests_nested SET value = 1 WHERE id = 1");
        await other.execute("UPDATE lock_tests_nested SET value = 2 WHERE id = 2");
        const [r1, r2] = await Promise.allSettled([
          adapter.execute("UPDATE lock_tests_nested SET value = 3 WHERE id = 2"),
          other.execute("UPDATE lock_tests_nested SET value = 4 WHERE id = 1"),
        ]);
        const errs = [r1, r2].filter((r) => r.status === "rejected");
        deadlocked = errs.length === 1 && errs[0].reason instanceof Deadlocked;
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
      expect(deadlocked).toBe(true);
      // Connection remains usable after the rolled-back transaction.
      await adapter.execute("SELECT 1");
    });
  });
});
