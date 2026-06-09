/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_nested_test.rb
 *
 * Rails drives these through `Sample.transaction(requires_new: true)` (a real
 * SAVEPOINT) on the `samples`/`bits` tables; this port drives the same
 * SQLSTATE -> exception mapping at the adapter level. As in Rails, the parent
 * transaction is dirtied via a read on the separate `bits` table
 * (`make_parent_transaction_dirty` / `Bit.take`) so the dirtying query is not
 * an active participant in the serializable conflict on `samples`.
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
    // Mirrors Rails' setup/teardown (samples + bits tables, value column). The
    // global beforeEach (test-setup-ar) drops all tables, so (re)create them
    // here — after the reset — rather than in beforeAll.
    beforeEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS samples");
      await adapter.exec("DROP TABLE IF EXISTS bits");
      await adapter.exec("CREATE TABLE samples (id int PRIMARY KEY, value integer)");
      await adapter.exec("CREATE TABLE bits (id int PRIMARY KEY, value integer)");
      await adapter.execute("INSERT INTO samples VALUES (1, 0), (2, 0)");
      await adapter.execute("INSERT INTO bits VALUES (1, 0)");
    });
    afterEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS samples");
      await adapter.exec("DROP TABLE IF EXISTS bits");
    });

    // Mirrors Rails' make_parent_transaction_dirty (Bit.take): dirty the parent
    // transaction with a read that does NOT touch the contended `samples` rows.
    async function makeParentTransactionDirty(conn: PostgreSQLAdapter): Promise<void> {
      await conn.execute("SELECT * FROM bits LIMIT 1");
    }

    // Open a serializable parent transaction on each connection, dirty each
    // parent, take a savepoint on `adapter`, then commit a conflicting write on
    // `other`. The next write on `adapter` inside the savepoint raises
    // SerializationFailure.
    async function serializationConflict(): Promise<PostgreSQLAdapter> {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      await other.beginIsolatedDbTransaction("serializable");
      await makeParentTransactionDirty(other);
      await other.execute("SELECT sum(value) FROM samples");
      await adapter.beginIsolatedDbTransaction("serializable");
      await makeParentTransactionDirty(adapter);
      await adapter.execute("SELECT sum(value) FROM samples");
      await adapter.createSavepoint("sp1");
      await other.execute("UPDATE samples SET value = 1 WHERE id = 1");
      await other.commitDbTransaction();
      return other;
    }

    it("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {
      const other = await serializationConflict();
      try {
        await expect(adapter.execute("UPDATE samples SET value = 2 WHERE id = 1")).rejects.toThrow(
          SerializationFailure,
        );
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
    });

    it("SerializationFailure inside nested SavepointTransaction is recoverable", async () => {
      const other = await serializationConflict();
      try {
        await expect(adapter.execute("UPDATE samples SET value = 2 WHERE id = 1")).rejects.toThrow(
          SerializationFailure,
        );
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
      // Mirrors Rails' recovery assertion: the connection is usable again and
      // sees the committed state from the conflicting transaction.
      const rows = await adapter.execute("SELECT value FROM samples WHERE id = 1");
      expect((rows[0] as { value: number }).value).toBe(1);
    });

    it("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await makeParentTransactionDirty(adapter);
        await makeParentTransactionDirty(other);
        await adapter.createSavepoint("sp1");
        await other.createSavepoint("sp1");
        await adapter.execute("UPDATE samples SET value = 1 WHERE id = 1");
        await other.execute("UPDATE samples SET value = 2 WHERE id = 2");
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
        await other.close();
      }
    });

    it("deadlock inside nested SavepointTransaction is recoverable", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      let deadlocked = false;
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await makeParentTransactionDirty(adapter);
        await makeParentTransactionDirty(other);
        await adapter.createSavepoint("sp1");
        await other.createSavepoint("sp1");
        await adapter.execute("UPDATE samples SET value = 1 WHERE id = 1");
        await other.execute("UPDATE samples SET value = 2 WHERE id = 2");
        const [r1, r2] = await Promise.allSettled([
          adapter.execute("UPDATE samples SET value = 3 WHERE id = 2"),
          other.execute("UPDATE samples SET value = 4 WHERE id = 1"),
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
      expect((await adapter.execute("SELECT 1 AS n"))[0].n).toBe(1);
    });
  });
});
