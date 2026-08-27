import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL, suiteTable } from "./test-helper.js";
import { SerializationFailure, Deadlocked } from "../../errors.js";

const SAMPLES = suiteTable("samples", "transaction_nested");
const BITS = suiteTable("bits", "transaction_nested");

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLTransactionNestedTest", () => {
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS ${SAMPLES}, ${BITS}`);
      await adapter.exec(`CREATE TABLE ${SAMPLES} (id int PRIMARY KEY, value integer)`);
      await adapter.exec(`CREATE TABLE ${BITS} (id int PRIMARY KEY, value integer)`);
      await adapter.execute(`INSERT INTO ${SAMPLES} VALUES (1, 0), (2, 0)`);
      await adapter.execute(`INSERT INTO ${BITS} VALUES (1, 0)`);
    });
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS ${SAMPLES}, ${BITS}`);
    });

    async function makeParentTransactionDirty(conn: PostgreSQLAdapter): Promise<void> {
      await conn.execute(`SELECT * FROM ${BITS} LIMIT 1`);
    }

    async function serializationConflict(): Promise<PostgreSQLAdapter> {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      await other.beginIsolatedDbTransaction("serializable");
      await makeParentTransactionDirty(other);
      await other.execute(`SELECT sum(value) FROM ${SAMPLES}`);
      await adapter.beginIsolatedDbTransaction("serializable");
      await makeParentTransactionDirty(adapter);
      await adapter.execute(`SELECT sum(value) FROM ${SAMPLES}`);
      await adapter.createSavepoint("sp1");
      await other.execute(`UPDATE ${SAMPLES} SET value = 1 WHERE id = 1`);
      await other.commitDbTransaction();
      return other;
    }

    async function nestedDeadlock(other: PostgreSQLAdapter): Promise<boolean> {
      await adapter.beginDbTransaction();
      await other.beginDbTransaction();
      await makeParentTransactionDirty(adapter);
      await makeParentTransactionDirty(other);
      await adapter.createSavepoint("sp1");
      await other.createSavepoint("sp1");
      await adapter.execute(`UPDATE ${SAMPLES} SET value = 1 WHERE id = 1`);
      await other.execute(`UPDATE ${SAMPLES} SET value = 2 WHERE id = 2`);
      const [r1, r2] = await Promise.allSettled([
        adapter.execute(`UPDATE ${SAMPLES} SET value = 3 WHERE id = 2`),
        other.execute(`UPDATE ${SAMPLES} SET value = 4 WHERE id = 1`),
      ]);
      const errs = [r1, r2].filter((r) => r.status === "rejected");
      return errs.length === 1 && errs[0].reason instanceof Deadlocked;
    }

    async function assertConnectionRecovers(): Promise<void> {
      await adapter.beginDbTransaction();
      await adapter.execute(`UPDATE ${SAMPLES} SET value = 7 WHERE id = 2`);
      await adapter.commitDbTransaction();
      const rows = await adapter.execute(`SELECT value FROM ${SAMPLES} WHERE id = 2`);
      expect((rows[0] as { value: number }).value).toBe(7);
    }

    it("unserializable transaction raises SerializationFailure inside nested SavepointTransaction", async () => {
      const other = await serializationConflict();
      try {
        await expect(
          adapter.execute(`UPDATE ${SAMPLES} SET value = 2 WHERE id = 1`),
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
          adapter.execute(`UPDATE ${SAMPLES} SET value = 2 WHERE id = 1`),
        ).rejects.toThrow(SerializationFailure);
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
