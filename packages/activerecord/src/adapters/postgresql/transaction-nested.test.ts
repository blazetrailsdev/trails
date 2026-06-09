/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/transaction_nested_test.rb
 *
 * Rails drives these through `Sample.transaction(requires_new: true)` (a real
 * SAVEPOINT) on `samples`/`bits`; this port drives the same SQLSTATE ->
 * exception mapping at the adapter level, dirtying the parent via a read on
 * `bits` (`make_parent_transaction_dirty` / `Bit.take`).
 *
 * Scope of the "recoverable" tests: PostgreSQL dooms the *whole* serializable /
 * deadlocked transaction on 40001 / 40P01 — ROLLBACK TO SAVEPOINT cannot recover
 * it (verified: a post-failure outer write raises 40001 again). Rails' Model/
 * TransactionManager savepoint-scoped recovery + final-state asserts ([10,10] /
 * [2]+[1]) are out of scope; the adapter layer verifies the CONNECTION recovers
 * from the aborted state — see assertConnectionRecovers.
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
    // Mirrors Rails' setup (samples + bits, value col); created post-reset.
    beforeEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS samples, bits");
      await adapter.exec("CREATE TABLE samples (id int PRIMARY KEY, value integer)");
      await adapter.exec("CREATE TABLE bits (id int PRIMARY KEY, value integer)");
      await adapter.execute("INSERT INTO samples VALUES (1, 0), (2, 0)");
      await adapter.execute("INSERT INTO bits VALUES (1, 0)");
    });
    afterEach(async () => {
      await adapter.exec("DROP TABLE IF EXISTS samples, bits");
    });

    // Mirrors make_parent_transaction_dirty (Bit.take): reads `bits`, not the
    // contended `samples` rows.
    async function makeParentTransactionDirty(conn: PostgreSQLAdapter): Promise<void> {
      await conn.execute("SELECT * FROM bits LIMIT 1");
    }

    // Serializable parent on each connection, dirty each, savepoint on
    // `adapter`, commit a conflicting write on `other` — the next write inside
    // `adapter`'s savepoint raises SerializationFailure.
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

    // Deadlock two savepoint-scoped writes; true iff one aborted (Deadlocked).
    async function nestedDeadlock(other: PostgreSQLAdapter): Promise<boolean> {
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
      return errs.length === 1 && (errs[0] as PromiseRejectedResult).reason instanceof Deadlocked;
    }

    // After the doomed txn is rolled back, the connection is reusable: a fresh
    // transaction commits and persists (fails if state was left stuck).
    async function assertConnectionRecovers(): Promise<void> {
      await adapter.beginDbTransaction();
      await adapter.execute("UPDATE samples SET value = 7 WHERE id = 2");
      await adapter.commitDbTransaction();
      const rows = await adapter.execute("SELECT value FROM samples WHERE id = 2");
      expect((rows[0] as { value: number }).value).toBe(7);
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
      await assertConnectionRecovers();
    });

    it("deadlock raises Deadlocked inside nested SavepointTransaction", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        expect(await nestedDeadlock(other)).toBe(true);
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
        deadlocked = await nestedDeadlock(other);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
        await other.close();
      }
      expect(deadlocked).toBe(true);
      await assertConnectionRecovers();
    });
  });
});
