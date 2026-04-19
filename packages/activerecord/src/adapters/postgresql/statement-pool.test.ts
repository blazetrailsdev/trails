/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/statement_pool_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    adapter.preparedStatements = true;
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("StatementPoolTest", () => {
    it("statement pool", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        await adapter.execute("SELECT $1::int", [2]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool).toBeDefined();
        expect(pool.length).toBe(1);

        await adapter.execute("SELECT $1::text", ["a"]);
        expect(pool.length).toBe(2);
      } finally {
        await adapter.rollback();
      }
    });

    it("statement pool max", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        const pool = adapter._statementPoolForTest()!;
        // Rails' matching test sets statement_limit = 1 and asserts
        // LRU eviction. setMaxSize immediately evicts excess entries.
        pool.setMaxSize(1);
        await adapter.execute("SELECT $1::text", ["a"]);
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
      }
    });

    it("statementLimit config resizes the active pool", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        await adapter.execute("SELECT $1::text", ["a"]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool.length).toBe(2);
        adapter.statementLimit = 1;
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
      }
    });

    it("executeMutation caches the plan for INSERT (reuses on repeat)", async () => {
      await adapter.exec(
        `CREATE TABLE IF NOT EXISTS "sp_exec_mut" ("id" SERIAL PRIMARY KEY, "name" TEXT)`,
      );
      await adapter.beginDbTransaction();
      try {
        await adapter.executeMutation(`INSERT INTO "sp_exec_mut" ("name") VALUES ($1)`, ["a"]);
        await adapter.executeMutation(`INSERT INTO "sp_exec_mut" ("name") VALUES ($1)`, ["b"]);
        const pool = adapter._statementPoolForTest()!;
        // Both INSERTs share the same SQL template → single cached
        // plan. Rails exec_cache backs exec_insert the same way.
        // The statement key is the RETURNING-rewritten form, so only
        // one entry — the two mutations reused the plan.
        expect(pool.length).toBe(1);
      } finally {
        await adapter.rollback();
        await adapter.exec(`DROP TABLE IF EXISTS "sp_exec_mut"`);
      }
    });

    it("statement pool clear", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        await adapter.execute("SELECT $1::text", ["a"]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool.length).toBe(2);
        pool.clear();
        expect(pool.length).toBe(0);
      } finally {
        await adapter.rollback();
      }
    });

    it("dealloc does not raise on inactive connection", async () => {
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      const pool = adapter._statementPoolForTest()!;
      await adapter.rollback();
      await adapter.close();
      // After close the driver pool has ended the client, so DEALLOCATE
      // can't route anywhere. The fire-and-forget catch in dealloc()
      // must swallow the failure rather than surface an unhandled
      // rejection. Mirrors Rails' PG::StatementPool#dealloc which
      // rescues PG::InvalidSqlStatementName and connection errors.
      expect(() => pool.clear()).not.toThrow();
    });

    it("prepared statements do not get stuck on query interruption", async () => {
      // Rails' equivalent stubs `get_last_result` to raise after PREPARE,
      // simulating a lost ack while the server has the statement. pg-js
      // doesn't expose that hook, so we test the closest observable
      // property: an execute-time error (outside a transaction, so the
      // session is still usable) must not prevent a later query from
      // reusing the prepared plan. Mirrors the spirit of
      // `test_prepared_statements_do_not_get_stuck_on_query_interruption`
      // in activerecord/test/cases/adapters/postgresql/statement_pool_test.rb.
      await expect(adapter.execute("SELECT 1 / $1::int", [0])).rejects.toThrow();
      // The adapter still serves queries with the same SQL shape after
      // the error — no pool poisoning, no duplicate-prepared-statement
      // error on reuse.
      const rows = await adapter.execute("SELECT 1 / $1::int", [1]);
      expect(rows[0]).toBeDefined();
    });

    it("PreparedStatementCacheExpired is exported for txn-retry callers", async () => {
      // In-txn `exec_cache` can't transparently retry a cached-plan
      // failure — any error aborts the enclosing txn, so subsequent
      // commands raise 25P02 InFailedSqlTransaction. Rails raises
      // `PreparedStatementCacheExpired` for the transaction machinery
      // to catch and retry the whole txn. Triggering a real 0A000
      // requires DDL on a referenced object between two queries in
      // the same txn (covered by txn retry suite); here we just
      // verify the error class round-trips.
      const { PreparedStatementCacheExpired } = await import("../../errors.js");
      expect(new PreparedStatementCacheExpired("test").name).toBe("PreparedStatementCacheExpired");
    });

    it("reads statementLimit from the config hash (database.yml shape)", async () => {
      const configured = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        statementLimit: 7,
      });
      expect(configured.statementLimit).toBe(7);
      await configured.close();
    });

    it("reads preparedStatements from the config hash", async () => {
      const configured = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        preparedStatements: false,
      });
      expect(configured.preparedStatements).toBe(false);
      await configured.close();
    });

    it("rejects invalid statementLimit at construction time", () => {
      expect(
        () => new PostgreSQLAdapter({ connectionString: PG_TEST_URL, statementLimit: -1 }),
      ).toThrow(RangeError);
      expect(
        () => new PostgreSQLAdapter({ connectionString: PG_TEST_URL, statementLimit: 1.5 }),
      ).toThrow(RangeError);
    });

    it("rejects non-boolean preparedStatements at construction time and via assignment", async () => {
      // Construction-time validation routes preparedStatements through
      // the setter, so a non-boolean (string, number, etc.) hits the
      // same TypeError guard as direct assignment. Without this test
      // the runtime guard could regress silently.
      expect(
        () =>
          new PostgreSQLAdapter({
            connectionString: PG_TEST_URL,
            preparedStatements: "false" as unknown as boolean,
          }),
      ).toThrow(TypeError);
      expect(
        () =>
          new PostgreSQLAdapter({
            connectionString: PG_TEST_URL,
            preparedStatements: 0 as unknown as boolean,
          }),
      ).toThrow(TypeError);

      const adapter2 = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        expect(() => {
          (adapter2 as unknown as { preparedStatements: unknown }).preparedStatements = "true";
        }).toThrow(TypeError);
      } finally {
        // pg.Pool keeps sockets/timers alive — close to avoid Vitest
        // hangs / flakiness from leaked handles.
        await adapter2.close();
      }
    });

    it("clearCacheBang drops cached plans on the active connection", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        await adapter.execute("SELECT $1::text", ["a"]);
        const pool = adapter._statementPoolForTest()!;
        expect(pool.length).toBe(2);
        adapter.clearCacheBang();
        expect(pool.length).toBe(0);
        // Pool itself remains attached — counter continues from where
        // it left off so we never collide with a still-PREPAREd name
        // on this session after the server DEALLOCATEs complete.
        expect(adapter._statementPoolForTest()).toBe(pool);
      } finally {
        await adapter.rollback();
      }
    });
  });
});
