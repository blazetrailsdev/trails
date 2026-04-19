/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/statement_pool_test.rb
 */
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import type pg from "pg";
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

    it("clearCacheBang clears the just-released txn pool when called post-rollback", async () => {
      // TransactionManager calls `clearCacheBang` AFTER `rollback()`
      // (Rails' after_failure_actions ordering, abstract/transaction.rb
      // :627-631). Our PG `rollback()` releases `_client`, so the hook
      // needs to reach the pool of the just-released client. Exercises
      // the `_lastReleasedTxnClient` fallback path in `clearCacheBang`.
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      await adapter.execute("SELECT $1::text", ["a"]);
      const pool = adapter._statementPoolForTest()!;
      expect(pool.length).toBe(2);
      await adapter.rollback();
      // After rollback, _client is null but the released-client pool
      // is still reachable.
      const releasedPool = adapter._lastReleasedStatementPoolForTest()!;
      expect(releasedPool).toBe(pool);
      // clearCacheBang falls back to the released pool and `reset()`s
      // it (local-only — can't fire DEALLOCATE on a released client),
      // then drops the WeakRef so we don't pin longer than needed.
      adapter.clearCacheBang();
      expect(pool.length).toBe(0);
      expect(adapter._lastReleasedStatementPoolForTest()).toBeUndefined();
    });

    it("tags the released client and runs DEALLOCATE ALL on its next checkout", async () => {
      // Released-client `reset()` path can't fire DEALLOCATE on a
      // session it doesn't own, so server-side PREPAREs leak. The
      // deferred half: tag the client; on next checkout, drain via
      // `DEALLOCATE ALL` before user code.
      //
      // Use a dedicated pool-size-1 adapter so pg.Pool always hands
      // back the same physical client on re-checkout — makes the
      // DEALLOCATE-before-BEGIN assertion deterministic. The shared
      // `adapter` from beforeEach uses pg.Pool's default max (10) and
      // could hand back a different client, weakening the assertion.
      const max1 = new PostgreSQLAdapter({ connectionString: PG_TEST_URL, max: 1 });
      max1.preparedStatements = true;
      try {
        await max1.beginDbTransaction();
        await max1.execute("SELECT $1::int", [1]);
        await max1.execute("SELECT $1::text", ["a"]);
        await max1.rollback();
        // Capture the released client BEFORE clearCacheBang — its
        // finally block nulls _lastReleasedTxnClient (so a post-clear
        // _lastReleasedClientForTest() would return null and the
        // tag check would silently fail with `WeakSet.has(null)` → false).
        const taggedClient = max1._lastReleasedClientForTest();
        expect(taggedClient).not.toBeNull();
        max1.clearCacheBang();
        expect(max1._needsDeallocateAllForTest(taggedClient!)).toBe(true);

        // vi.spyOn both pool.connect AND the returned client's query
        // so vi.restoreAllMocks() handles cleanup for both.
        const observed: string[] = [];
        const pool = max1._driverPoolForTest()!;
        const originalConnect = pool.connect.bind(pool);
        vi.spyOn(pool, "connect").mockImplementation((async (...args: unknown[]) => {
          const client = await (originalConnect as (...a: unknown[]) => Promise<pg.PoolClient>)(
            ...args,
          );
          const origQuery = client.query.bind(client);
          vi.spyOn(client, "query").mockImplementation(((sql: unknown, ...rest: unknown[]) => {
            if (typeof sql === "string") observed.push(sql);
            return (origQuery as (...a: unknown[]) => unknown)(sql, ...rest);
          }) as typeof client.query);
          return client;
        }) as unknown as typeof pool.connect);

        await max1.beginDbTransaction();
        try {
          // max:1 guarantees pg.Pool returned the same physical client.
          const newClient = max1._currentClientForTest();
          expect(newClient).toBe(taggedClient);
          // Drain ran → no longer tagged.
          expect(max1._needsDeallocateAllForTest(newClient!)).toBe(false);
          // DEALLOCATE ALL fired BEFORE BEGIN.
          expect(observed).toContain("DEALLOCATE ALL");
          const deallocIdx = observed.indexOf("DEALLOCATE ALL");
          const beginIdx = observed.indexOf("BEGIN");
          expect(deallocIdx).toBeGreaterThanOrEqual(0);
          expect(beginIdx).toBeGreaterThan(deallocIdx);
        } finally {
          await max1.rollback();
        }
      } finally {
        await max1.close();
      }
    });

    it("clearCacheBang resets the released-client pool even when a new txn is in progress", async () => {
      // Repro for the after_rollback-callback-opens-new-txn race: if
      // an after_rollback callback begins a new transaction before
      // TransactionManager calls clearCacheBang, _client points at the
      // NEW client while _lastReleasedTxnClient still points at the
      // failed one. The hook must reset the failed pool AND clear the
      // new-txn pool (both branches fire in clearCacheBang).
      //
      // pg.Pool can either re-checkout the same physical client
      // (pool size 1, no concurrency) or hand back a different one;
      // the test has to work with both. When same-client, `failedPool`
      // and `newTxnPool` are the same pool object; when different,
      // they are distinct. Both paths still have to end with all
      // relevant pools empty after clearCacheBang.
      await adapter.beginDbTransaction();
      await adapter.execute("SELECT $1::int", [1]);
      const failedPool = adapter._statementPoolForTest()!;
      expect(failedPool.length).toBe(1);
      await adapter.rollback();
      await adapter.beginDbTransaction();
      try {
        await adapter.execute("SELECT $1::int", [2]);
        const newTxnPool = adapter._statementPoolForTest()!;
        // Precondition: at least one entry exists to be cleared.
        expect(newTxnPool.length).toBeGreaterThan(0);
        adapter.clearCacheBang();
        // Hook behavior: the failed pool (via _lastReleasedTxnClient)
        // gets reset(), and the current txn pool (via _client) gets
        // clear()'d. Whether the pools are the same object or not, both
        // end up empty.
        expect(failedPool.length).toBe(0);
        expect(newTxnPool.length).toBe(0);
        // Released-client ref dropped regardless.
        expect(adapter._lastReleasedStatementPoolForTest()).toBeUndefined();
      } finally {
        await adapter.rollback();
      }
    });
  });
});
