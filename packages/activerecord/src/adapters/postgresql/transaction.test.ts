import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL, suiteTable } from "./test-helper.js";
import { SerializationFailure, Deadlocked, LockWaitTimeout, QueryCanceled } from "../../errors.js";

const SAMPLES = suiteTable("samples", "transaction");

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgreSQLTransactionTest", () => {
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS ${SAMPLES}`);
      await adapter.exec(`CREATE TABLE ${SAMPLES} (id int PRIMARY KEY, value integer)`);
      await adapter.execute(`INSERT INTO ${SAMPLES} VALUES (1, 0), (2, 0)`);
    });
    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS ${SAMPLES}`);
    });

    it("raises SerializationFailure when a serialization failure occurs", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginIsolatedDbTransaction(":serializable");
        await other.beginIsolatedDbTransaction(":serializable");
        await adapter.execute(`SELECT sum(value) FROM ${SAMPLES}`);
        await other.execute(`SELECT sum(value) FROM ${SAMPLES}`);
        await other.execute(`UPDATE ${SAMPLES} SET value = 1 WHERE id = 1`);
        await other.commitDbTransaction();
        await expect(
          adapter.execute(`UPDATE ${SAMPLES} SET value = 2 WHERE id = 1`),
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
        const start = Date.now();
        let slowError: unknown;
        const slow = adapter.execute("SELECT pg_sleep(10)").catch((e) => {
          slowError = e;
        });
        await new Promise<void>((r) => setTimeout(r, 500));
        const sent = (
          await other.execQuery("SELECT pg_cancel_backend(?) AS ok", "SQL", [pid])
        ).toArray();
        expect((sent[0] as { ok: boolean }).ok).toBe(true);
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
        await adapter.execute(`UPDATE ${SAMPLES} SET value = 1 WHERE id = 1`);
        await other.execute(`UPDATE ${SAMPLES} SET value = 2 WHERE id = 2`);
        const [r1, r2] = await Promise.allSettled([
          adapter.execute(`UPDATE ${SAMPLES} SET value = 3 WHERE id = 2`),
          other.execute(`UPDATE ${SAMPLES} SET value = 4 WHERE id = 1`),
        ]);
        const errs = [r1, r2].filter((r) => r.status === "rejected");
        expect(errs).toHaveLength(1);
        expect(errs[0].reason).toBeInstanceOf(Deadlocked);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
      }
      expect((await adapter.execute("SELECT 1 AS n"))[0].n).toBe(1);
      expect((await other.execute("SELECT 1 AS n"))[0].n).toBe(1);
      await other.close();
    });

    it("raises LockWaitTimeout when lock wait timeout exceeded", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await adapter.execute(`SELECT * FROM ${SAMPLES} WHERE id = 1 FOR UPDATE`);
        await other.execute("SET lock_timeout = '100ms'");
        await expect(
          other.execute(`SELECT * FROM ${SAMPLES} WHERE id = 1 FOR UPDATE`),
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
        await adapter.execute(`SELECT * FROM ${SAMPLES} WHERE id = 1 FOR UPDATE`);
        const otherRows = await other.execute("SELECT pg_backend_pid() AS pid");
        const otherPid = (otherRows[0] as { pid: number }).pid;
        let blockedError: unknown;
        const blocked = other
          .execute(`SELECT * FROM ${SAMPLES} WHERE id = 1 FOR UPDATE`)
          .catch((e) => {
            blockedError = e;
          });
        const canceler = new PostgreSQLAdapter(PG_TEST_URL);
        try {
          const deadline = Date.now() + 3000;
          let waiting = false;
          while (Date.now() < deadline) {
            const rows = (
              await canceler.execQuery(
                "SELECT 1 AS n FROM pg_stat_activity " +
                  "WHERE pid = ? AND state = 'active' AND wait_event_type = 'Lock'",
                "SQL",
                [otherPid],
              )
            ).toArray();
            if (rows.length === 1) {
              waiting = true;
              break;
            }
            await new Promise<void>((r) => setTimeout(r, 50));
          }
          expect(waiting).toBe(true);
          const sent = (
            await canceler.execQuery("SELECT pg_cancel_backend(?) AS ok", "SQL", [otherPid])
          ).toArray();
          expect((sent[0] as { ok: boolean }).ok).toBe(true);
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
