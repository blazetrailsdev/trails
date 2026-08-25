/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/statement_pool_test.rb
 */
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    adapter.preparedStatements = true;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close();
  });

  describe("StatementPoolTest", () => {
    it("statement pool", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        await adapter.execute("SELECT $1::int", [2]);
        const pool = adapter._statements;
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
        const pool = adapter._statements;
        // Rails' matching test sets statement_limit = 1 and asserts
        // LRU eviction. setMaxSize immediately evicts excess entries.
        await pool.setMaxSize(1);
        await adapter.execute("SELECT $1::text", ["a"]);
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
        const pool = adapter._statements;
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
        const pool = adapter._statements;
        expect(pool.length).toBe(2);
        await pool.clear();
        expect(pool.length).toBe(0);
      } finally {
        await adapter.rollback();
      }
    });

    it("dealloc does not raise on inactive connection", async () => {
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      const pool = adapter._statements;
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
      await configured.execute("SELECT $1::int", [1]);
      expect(configured._statements.maxSize).toBe(7);
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

    it("passes a non-boolean preparedStatements config through as Rails does", async () => {
      // abstract_adapter.rb:159 pipes the config through
      // `type_cast_config_to_boolean`, which maps the string `"false"` to
      // `false` and returns everything else UNCHANGED (abstract_adapter.rb:65-71).
      const cast = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        preparedStatements: "false" as unknown as boolean,
      });
      try {
        expect(cast.preparedStatements).toBe(false);
      } finally {
        await cast.close();
      }
      // `0` survives the cast and is truthy in Ruby, so
      // `prepared_statements?` (abstract_adapter.rb:234-235) answers true.
      const zero = new PostgreSQLAdapter({
        connectionString: PG_TEST_URL,
        preparedStatements: 0 as unknown as boolean,
      });
      try {
        expect(zero.preparedStatements).toBe(true);
      } finally {
        await zero.close();
      }

      const adapter2 = new PostgreSQLAdapter(PG_TEST_URL);
      try {
        (adapter2 as unknown as { preparedStatements: unknown }).preparedStatements = "true";
        expect(adapter2.preparedStatements).toBe(true);
      } finally {
        await adapter2.close();
      }
    });

    it("clearCacheBang drops cached plans on the active connection", async () => {
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [1]);
        await adapter.execute("SELECT $1::text", ["a"]);
        const pool = adapter._statements;
        expect(pool.length).toBe(2);
        await adapter.clearCacheBang();
        expect(pool.length).toBe(0);
        expect(adapter._statements).toBe(pool);
      } finally {
        await adapter.rollback();
      }
    });

    it("clearCacheBang clears the just-released txn pool when called post-rollback", async () => {
      // TransactionManager calls `clearCacheBang` AFTER `rollback()`
      // (Rails' after_failure_actions ordering). With the single
      // persistent connection, the StatementPool stays attached
      // through commit/rollback — clearCacheBang issues DEALLOCATE
      // per cached entry on the live connection.
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      await adapter.execute("SELECT $1::text", ["a"]);
      const pool = adapter._statements;
      expect(pool.length).toBe(2);
      await adapter.rollback();
      expect(adapter._statements).toBe(pool);
      await adapter.clearCacheBang();
      expect(pool.length).toBe(0);
    });

    it("tags the released client and runs DEALLOCATE ALL on its next checkout", async () => {
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      await adapter.rollback();
      await adapter.reconnect();
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [2]);
      await adapter.rollback();
      const conn = adapter._rawConnectionForTest();
      adapter._rawConnection = null;
      await adapter.clearCacheBang();
      expect(adapter._needsDeallocateAllForTest()).toBe(true);
      adapter._rawConnection = conn;
      expect(conn).not.toBeNull();
      const observed: string[] = [];
      const live = conn!;
      const origQuery = live.query.bind(live);
      // pg's `query` is overloaded with a void-returning callback form, so the
      // mock's Promise return trips checksVoidReturn; the Promise form is the one
      // exercised here (execute awaits it), so the return is intentional.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      vi.spyOn(live, "query").mockImplementation(((sql: unknown, ...rest: unknown[]) => {
        if (typeof sql === "string") observed.push(sql);
        return (origQuery as (...a: unknown[]) => unknown)(sql, ...rest);
      }) as typeof live.query);
      await adapter.execute("SELECT 1");
      expect(observed[0]).toBe("DEALLOCATE ALL");
      expect(adapter._needsDeallocateAllForTest()).toBe(false);
    });

    it("clearCacheBang resets the released-client pool even when a new txn is in progress", async () => {
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      const failedPool = adapter._statements;
      expect(failedPool.length).toBe(1);
      await adapter.rollback();
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [2]);
        const newTxnPool = adapter._statements;
        expect(newTxnPool).toBe(failedPool);
        expect(newTxnPool.length).toBeGreaterThan(0);
        await adapter.clearCacheBang();
        expect(newTxnPool.length).toBe(0);
      } finally {
        await adapter.rollback();
      }
    });
  });
});
