import { describe, it, expect, afterEach } from "vitest";
import { Result } from "./result.js";
import { FutureResult, Complete, type FutureResultConnection } from "./future-result.js";
import { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { ActiveRecord } from "./ar-config.js";
import { DatabaseStatements, select } from "./connection-adapters/abstract/database-statements.js";
import { makeCachedSelectAll, Store } from "./connection-adapters/abstract/query-cache.js";
import { AsynchronousQueryInsideTransactionError, RangeError as ARRangeError } from "./errors.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";

// Rails' own load_async_test.rb / asynchronous_queries_test.rb stay excluded
// (scripts/parity/unported-files/unscoped.ts): every live test class there
// asserts thread-pool sizing, `scheduled?` interleaving or mutex lock_wait,
// none of which is observable on a single-threaded event loop. These cover the
// arms that ARE observable.

describe("Result.empty", () => {
  it("returns EMPTY for the sync arm", () => {
    expect(Result.empty()).toBe(Result.empty());
    expect(Result.empty().rows).toEqual([]);
  });

  it("returns EMPTY_ASYNC for the async arm", () => {
    const empty = Result.empty({ async: true }) as unknown as Complete;
    expect(empty).toBeInstanceOf(Complete);
    expect(empty.result).toBe(Result.empty());
    // Rails holds it as one frozen constant (result.rb:247).
    expect(Result.empty({ async: true })).toBe(Result.empty({ async: true }));
  });
});

describe("FutureResult.wrap", () => {
  it("wraps a bare Result in a Complete", () => {
    const result = new Result(["id"], [[1]]);
    const wrapped = FutureResult.wrap(result);
    expect(wrapped).toBeInstanceOf(Complete);
    expect((wrapped as Complete).result).toBe(result);
    expect((wrapped as Complete).pending()).toBe(false);
  });

  it("returns an already-wrapped value unchanged", () => {
    const complete = new Complete(new Result([], []));
    expect(FutureResult.wrap(complete)).toBe(complete);
  });
});

describe("FutureResult#then", () => {
  // Ruby returns an ActiveRecord::Promise here and reads it with `#value`.
  // `then` is the JS thenable protocol, so the port implements that instead —
  // see the FutureResult class comment and promise.rb's unported-files entry.
  it("applies the block when the value is read", async () => {
    expect(await new Complete(new Result([], [])).then((r) => r.rows.length)).toBe(0);
  });

  it("composes blocks left to right", async () => {
    const complete = new Complete(new Result(["title"], [["post title"]]));
    expect(await complete.then((r) => r.rows[0][0]).then((t) => String(t).toUpperCase())).toBe(
      "POST TITLE",
    );
  });

  it("resolves through the FutureResult it wraps", async () => {
    const result = new Result(["id"], [[7]]);
    const futureResult = new FutureResult(fakePool(result), ["SELECT 1", null, []]);
    expect(await futureResult.then((r) => r.rows[0][0])).toBe(7);
  });

  it("makes a FutureResult awaitable as the Result it will produce", async () => {
    const result = new Result(["id"], [[7]]);
    expect(await new FutureResult(fakePool(result), ["SELECT 1", null, []])).toBe(result);
  });
});

describe("FutureResult", () => {
  it("executes the query once, on the first read", async () => {
    const result = new Result(["id"], [[1]]);
    const pool = fakePool(result);
    const futureResult = new FutureResult(pool, ["SELECT 1", null, []]);

    expect(futureResult.pending()).toBe(true);
    expect(await futureResult.result()).toBe(result);
    expect(futureResult.pending()).toBe(false);
    expect(await futureResult.result()).toBe(result);
    expect(pool.calls).toBe(1);
  });

  it("re-raises the query's error from result()", async () => {
    const boom = new Error("boom");
    const futureResult = new FutureResult(fakePool(boom), ["SELECT 1", null, []]);
    await expect(futureResult.result()).rejects.toThrow("boom");
  });

  it("raises Canceled once its session is finalized", async () => {
    const session = new AsynchronousQueriesTracker.Session();
    const futureResult = new FutureResult(fakePool(new Result([], [])), ["SELECT 1", null, []]);
    futureResult.scheduleBang(session);
    session.finalize();

    expect(futureResult.canceled()).toBe(true);
    await expect(futureResult.result()).rejects.toThrow(FutureResult.Canceled);
  });

  it("SelectAll rescues ::RangeError into an empty Result", async () => {
    const { RangeError: ARRangeError } = await import("./errors.js");
    const futureResult = new FutureResult.SelectAll(fakePool(new ARRangeError("out of range")), [
      "SELECT 1",
      null,
      [],
    ]);
    expect(await futureResult.result()).toBe(Result.empty());
  });
});

describe("AsynchronousQueriesTracker", () => {
  it("raises without a query session", () => {
    expect(() => new AsynchronousQueriesTracker().currentSession).toThrow(
      "Can't perform asynchronous queries without a query session",
    );
  });

  it("stacks and finalizes sessions", () => {
    const tracker = new AsynchronousQueriesTracker();
    tracker.startSession();
    const outer = tracker.currentSession;
    tracker.startSession();
    const inner = tracker.currentSession;
    expect(inner).not.toBe(outer);

    tracker.finalizeSession();
    expect(inner.active()).toBe(false);
    expect(tracker.currentSession).toBe(outer);
    expect(outer.active()).toBe(true);

    tracker.finalizeSession();
    expect(outer.active()).toBe(false);
    expect(() => tracker.currentSession).toThrow();
  });

  it("run starts a session on the execution state's tracker", () => {
    const tracker = AsynchronousQueriesTracker.run();
    const session = tracker.currentSession;
    expect(session.active()).toBe(true);

    AsynchronousQueriesTracker.complete(tracker);
    expect(session.active()).toBe(false);
  });
});

describe("DatabaseStatements#select", () => {
  afterEach(() => {
    ActiveRecord.asyncQueryExecutor = null;
  });

  it("raises AsynchronousQueryInsideTransactionError inside a joinable transaction", () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const host = {
      asyncEnabled: () => true,
      currentTransaction: () => ({ open: true, joinable: true }),
    };

    // Ruby raises here, synchronously, before any query is issued
    // (database_statements.rb:672-674) — `select` is not an async function, so
    // the raise reaches the caller as a throw rather than a rejected promise.
    expect(() =>
      select.call(host as never, "SELECT 1", null, [], { async: FutureResult.SelectAll }),
    ).toThrow(AsynchronousQueryInsideTransactionError);
  });

  it("resolves to the Result when async is set but no executor is enabled", async () => {
    const result = new Result(["id"], [[1]]);
    const host = {
      asyncEnabled: () => false,
      internalExecQuery: async () => result,
    };

    // Rails' non-enabled arm is `FutureResult.wrap(result)` — already complete,
    // so awaiting it yields the Result, which is what select_one/select_rows read.
    expect(
      await select.call(host as never, "SELECT 1", null, [], { async: FutureResult.SelectAll }),
    ).toBe(result);
  });

  it("forwards prepare and async through to the connection's rawExecQuery", async () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const result = new Result(["id"], [[1]]);
    const pool = fakePool(result);
    const host = {
      pool,
      asyncEnabled: () => true,
      supportsConcurrentConnections: () => true,
      currentTransaction: () => ({ open: false, joinable: false }),
    };

    await select.call(host as never, "SELECT 1", "SQL", [], {
      prepare: true,
      async: FutureResult.SelectAll,
    });

    // Ruby's `raw_exec_query(...)` forwards the whole argument list, so the
    // `prepare:` select() chose and the `async: true` execute_or_skip passes both
    // reach `raw_execute` (future_result.rb:159, database_statements.rb:541-552).
    expect(pool.lastArgs).toEqual({
      sql: "SELECT 1",
      name: "SQL",
      binds: [],
      kwargs: { prepare: true, async: true },
    });
  });

  it("schedules a FutureResult through the pool when async is enabled", async () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const result = new Result(["id"], [[1]]);
    const pool = fakePool(result);
    const host = {
      pool,
      asyncEnabled: () => true,
      supportsConcurrentConnections: () => true,
      currentTransaction: () => ({ open: false, joinable: false }),
      internalExecQuery: async () => {
        throw new Error("must not run in the foreground");
      },
    };

    expect(
      await select.call(host as never, "SELECT 1", null, [], { async: FutureResult.SelectAll }),
    ).toBe(result);
    expect(pool.calls).toBe(1);
  });

  it("hands back a pending FutureResult without waiting for the query", async () => {
    // Ruby's `select` is an ordinary method: the async arm schedules the query
    // and returns the still-pending FutureResult, so the caller holds a handle
    // and reads `.value` later (database_statements.rb:671-694). `select` is
    // therefore NOT an async function here — an async function's promise would
    // adopt the returned FutureResult (a thenable) and resolve it away, so no
    // caller could ever observe one pending.
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const result = new Result(["id"], [[1]]);
    const pool = deferredPool(result);
    const host = {
      pool,
      asyncEnabled: () => true,
      supportsConcurrentConnections: () => true,
      currentTransaction: () => ({ open: false, joinable: false }),
    };

    const futureResult = select.call(host as never, "SELECT 1", null, [], {
      async: FutureResult.SelectAll,
    });
    expect(futureResult).toBeInstanceOf(FutureResult);
    expect((futureResult as FutureResult).pending()).toBe(true);

    pool.finish();
    expect(await (futureResult as FutureResult).result()).toBe(result);
    expect((futureResult as FutureResult).pending()).toBe(false);
  });

  it("runs the query to completion before returning when connections are not concurrent", async () => {
    // Ruby's `execute!` branch blocks (database_statements.rb:685-689): it is
    // taken when the connection cannot be used concurrently, so the query must
    // finish before anything else touches it.
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const result = new Result(["id"], [[1]]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    // `execute!` is handed the adapter itself as the connection, not a pooled
    // one (database_statements.rb:688), so the host is what answers the query.
    const host = {
      pool: {},
      asyncEnabled: () => true,
      supportsConcurrentConnections: () => false,
      currentTransaction: () => ({ open: false, joinable: false }),
      rawExecQuery: async () => {
        await gate;
        return result;
      },
    };

    let settled = false;
    const pending = (
      select.call(host as never, "SELECT 1", null, [], {
        async: FutureResult.SelectAll,
      }) as Promise<Result>
    ).then((r) => {
      settled = true;
      return r;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    expect(await pending).toBe(result);
    expect(settled).toBe(true);
  });

  it("returns a bare Result when async is not set", async () => {
    const result = new Result(["id"], [[1]]);
    const host = { asyncEnabled: () => false, internalExecQuery: async () => result };
    expect(await select.call(host as never, "SELECT 1", null, [])).toBe(result);
  });
});

describe("DatabaseStatements#select_all", () => {
  // database_statements.rb:77-79 — `rescue ::RangeError` →
  // `ActiveRecord::Result.empty(async: async)`. Ruby has one rescue clause; the
  // port spells it at two points, so both need covering.
  it("rescues a ::RangeError the query rejects with into an empty Result", async () => {
    const host = {
      internalExecQuery: async () => {
        throw new ARRangeError("out of range");
      },
    };

    const result = await DatabaseStatements.selectAll.call(host as never, "SELECT 1");
    expect(result).toBe(Result.empty());
  });

  it("rescues a ::RangeError raised before the query is issued", async () => {
    const host = {
      internalExecQuery: () => {
        throw new ActiveModelRangeError("out of range");
      },
    };

    const result = await DatabaseStatements.selectAll.call(host as never, "SELECT 1");
    expect(result).toBe(Result.empty());
  });

  it("lets any other error through", async () => {
    const host = {
      internalExecQuery: async () => {
        throw new Error("boom");
      },
    };

    await expect(DatabaseStatements.selectAll.call(host as never, "SELECT 1")).rejects.toThrow(
      "boom",
    );
  });
});

describe("QueryCache#select_all", () => {
  // query_cache.rb:243-250 splits on `async`: the async arm is
  // `FutureResult.wrap(lookup_sql_cache(...) || super)`, so the pending handle
  // has to survive the cache wrapper. It only does because `cachedSelectAll`
  // is not an `async function` — one would adopt the thenable FutureResult and
  // settle with its Result, which is exactly the collapse this covers.
  function cacheHost(store: Store) {
    return {
      _queryCache: store,
      lookupSqlCache: (sql: string, _name: string | null | undefined, binds: unknown[]) =>
        store.get(binds.length === 0 ? sql : JSON.stringify([sql, binds])),
      cacheSql: async (
        _sql: string,
        _name: string | null | undefined,
        _binds: unknown[],
        block: () => Promise<Record<string, unknown>[]>,
      ) => block(),
    };
  }

  it("hands back a pending FutureResult with the query cache enabled", async () => {
    const result = new Result(["id"], [[1]]);
    const store = new Store();
    store.enabled = true;
    const pending = new FutureResult.SelectAll(deferredPool(result) as never, [
      "SELECT 1",
      null,
      [],
    ]);
    const selectAll = makeCachedSelectAll(() => pending);

    const returned = selectAll.call(cacheHost(store) as never, "SELECT 1", null, [], {
      async: true,
    });

    expect(returned).toBe(pending);
    expect((returned as FutureResult).pending()).toBe(true);
  });

  it("wraps a cache hit in a Complete on the async arm", async () => {
    const store = new Store();
    store.enabled = true;
    await store.computeIfAbsent("SELECT 1", async () => [{ id: 1 }]);
    const selectAll = makeCachedSelectAll(() => {
      throw new Error("must not reach super on a cache hit");
    });

    const returned = selectAll.call(cacheHost(store) as never, "SELECT 1", null, [], {
      async: true,
    });

    expect(returned).toBeInstanceOf(Complete);
    expect((returned as Complete).pending()).toBe(false);
    expect((returned as Complete).toArray()).toEqual([{ id: 1 }]);
  });

  it("still caches through cache_sql on the sync arm", async () => {
    const result = new Result(["id"], [[1]]);
    const store = new Store();
    store.enabled = true;
    const selectAll = makeCachedSelectAll(async () => result);

    expect(
      await selectAll.call(cacheHost(store) as never, "SELECT 1", null, [], { async: false }),
    ).toEqual(result);
  });
});

/** A pool whose query stays in flight until `finish()` is called. */
function deferredPool(outcome: Result) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return {
    finish: () => release(),
    scheduleQuery(futureResult: { executeOrSkip(): void }) {
      futureResult.executeOrSkip();
    },
    async withConnection<T>(
      fn: (connection: FutureResultConnection) => Promise<T> | T,
    ): Promise<T> {
      return fn({
        rawExecQuery: async () => {
          await gate;
          return outcome;
        },
      });
    },
  };
}

/**
 * A pool whose `withConnection` yields a connection returning (or raising)
 * `outcome`, recording the arguments each `rawExecQuery` was issued with.
 */
function fakePool(outcome: Result | Error) {
  const pool = {
    calls: 0,
    lastArgs: undefined as
      | { sql: string; name?: string | null; binds?: unknown[]; kwargs?: unknown }
      | undefined,
    scheduleQuery(futureResult: { executeOrSkip(): void }) {
      futureResult.executeOrSkip();
    },
    async withConnection<T>(
      fn: (connection: FutureResultConnection) => Promise<T> | T,
    ): Promise<T> {
      return fn({
        rawExecQuery: async (sql, name, binds, kwargs) => {
          pool.calls += 1;
          pool.lastArgs = { sql, name, binds, kwargs };
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      });
    },
  };
  return pool;
}
