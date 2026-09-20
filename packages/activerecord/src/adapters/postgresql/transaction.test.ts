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
    await adapter.disconnectBang();
  });

  describe("PostgreSQLTransactionTest", () => {
    beforeEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS ${SAMPLES}`);
      await adapter.execute(`CREATE TABLE ${SAMPLES} (id int PRIMARY KEY, value integer)`);
      await adapter.execute(`INSERT INTO ${SAMPLES} VALUES (1, 0), (2, 0)`);
    });
    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS ${SAMPLES}`);
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
        await other.disconnectBang();
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
        await other.execQuery("SELECT pg_cancel_backend($1) AS ok", "SQL", [pid]);
        await slow;
        expect(slowError).toBeInstanceOf(QueryCanceled);
        expect(Date.now() - start).toBeLessThan(5000);
      } finally {
        await other.disconnectBang();
      }
    });

    it("raises Deadlocked when a deadlock is encountered", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await other.beginDbTransaction();
        await adapter.execute(`UPDATE ${SAMPLES} SET value = 1 WHERE id = 1`);
        await other.execute(`UPDATE ${SAMPLES} SET value = 2 WHERE id = 2`);
        await expect(
          Promise.allSettled([
            adapter.execute(`UPDATE ${SAMPLES} SET value = 3 WHERE id = 2`),
            other.execute(`UPDATE ${SAMPLES} SET value = 4 WHERE id = 1`),
          ]).then((results) => {
            for (const result of results) {
              if (result.status === "rejected") throw result.reason;
            }
          }),
        ).rejects.toThrow(Deadlocked);
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.rollbackDbTransaction().catch(() => {});
      }
      const connections = [adapter, other];
      expect((await Promise.all(connections.map((c) => c.active()))).every(Boolean)).toBeTruthy();
      await other.disconnectBang();
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
        await other.disconnectBang();
      }
    });

    it("raises QueryCanceled when canceling statement due to user request", async () => {
      const other = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        await adapter.beginDbTransaction();
        await adapter.execute(`SELECT * FROM ${SAMPLES} WHERE id = 1 FOR UPDATE`);
        const otherRows = await other.execute("SELECT pg_backend_pid() AS pid");
        const otherPid = (otherRows[0] as { pid: number }).pid;
        const blocked = other.execute(`SELECT * FROM ${SAMPLES} WHERE id = 1 FOR UPDATE`);
        const canceler = new PostgreSQLAdapter(PG_TEST_URL);
        try {
          const deadline = Date.now() + 3000;
          while (Date.now() < deadline) {
            const rows = (
              await canceler.execQuery(
                "SELECT 1 AS n FROM pg_stat_activity " +
                  "WHERE pid = $1 AND state = 'active' AND wait_event_type = 'Lock'",
                "SQL",
                [otherPid],
              )
            ).toArray();
            if (rows.length === 1) break;
            await new Promise<void>((r) => setTimeout(r, 50));
          }
          await canceler.execQuery("SELECT pg_cancel_backend($1) AS ok", "SQL", [otherPid]);
          await expect(blocked).rejects.toThrow(QueryCanceled);
        } finally {
          await canceler.disconnectBang();
        }
      } finally {
        await adapter.rollbackDbTransaction().catch(() => {});
        await other.disconnectBang();
      }
    });
  });
});
