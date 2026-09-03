import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Result } from "./result.js";
import { FutureResult, Complete, type FutureResultConnection } from "./future-result.js";
import { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { ActiveRecord } from "./ar-config.js";
import { DatabaseStatements, select } from "./connection-adapters/abstract/database-statements.js";
import { makeCachedSelectAll, Store } from "./connection-adapters/abstract/query-cache.js";
import { AsynchronousQueryInsideTransactionError, RangeError as ARRangeError } from "./errors.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import {
  Executor,
  IsolatedExecutionState,
  Notifications,
  type CompletableExecution,
  type NotificationEvent,
} from "@blazetrails/activesupport";
import { ACTIVE_RECORD_INSTRUMENTER } from "./future-result.js";

describe("Result.empty", () => {
  it("returns EMPTY for the sync arm", () => {
    expect(Result.empty()).toBe(Result.empty());
    expect(Result.empty().rows).toEqual([]);
  });

  it("returns EMPTY_ASYNC for the async arm", () => {
    const empty = Result.empty({ async: true }) as unknown as Complete;
    expect(empty).toBeInstanceOf(Complete);
    expect(empty.result).toBe(Result.empty());
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
  class TestExecutor extends Executor {}
  AsynchronousQueriesTracker.installExecutorHooks(TestExecutor);

  let execution: CompletableExecution;

  beforeEach(() => {
    execution = TestExecutor.runBang();
  });

  afterEach(() => {
    execution.completeBang();
    ActiveRecord.asyncQueryExecutor = null;
  });

  it("raises AsynchronousQueryInsideTransactionError inside a joinable transaction", () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const host = {
      asyncEnabled: () => true,
      currentTransaction: () => ({ open: true, joinable: true }),
    };

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
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const result = new Result(["id"], [[1]]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
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

describe("FutureResult::EventBuffer", () => {
  it("reports the wait on a contended read", async () => {
    const events: NotificationEvent[] = [];
    const sub = Notifications.subscribe("sql.active_record", (e: NotificationEvent) =>
      events.push(e),
    );
    const pool = instrumentedDeferredPool(new Result(["id"], [[1]]));
    const futureResult = new FutureResult(pool, ["SELECT 1", null, []]);

    try {
      futureResult.scheduleBang(new AsynchronousQueriesTracker.Session());
      const pending = futureResult.result();
      await new Promise((resolve) => setTimeout(resolve, 5));
      pool.finish();
      await pending;
    } finally {
      Notifications.unsubscribe(sub);
    }

    expect(events).toHaveLength(1);
    expect(events[0].payload.lock_wait as number).toBeGreaterThan(0);
  });

  it("holds the events back until an uncontended read, which reports 0.0", async () => {
    const events: NotificationEvent[] = [];
    const sub = Notifications.subscribe("sql.active_record", (e: NotificationEvent) =>
      events.push(e),
    );
    const pool = instrumentedDeferredPool(new Result(["id"], [[1]]));
    const futureResult = new FutureResult(pool, ["SELECT 1", null, []]);

    try {
      futureResult.scheduleBang(new AsynchronousQueriesTracker.Session());
      pool.finish();
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(futureResult.pending()).toBe(false);
      expect(events).toEqual([]);
      await futureResult.result();
    } finally {
      Notifications.unsubscribe(sub);
    }

    expect(events).toHaveLength(1);
    expect(events[0].payload.lock_wait).toBe(0.0);
  });
});

function instrumentedDeferredPool(outcome: Result) {
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
        rawExecQuery: async (sql, name, binds) => {
          const instrumenter = IsolatedExecutionState.fetch(
            ACTIVE_RECORD_INSTRUMENTER,
            () => Notifications.instrumenter,
          );
          return instrumenter.instrument(
            "sql.active_record",
            { sql, name, binds, async: true },
            async () => {
              await gate;
              return outcome;
            },
          );
        },
      });
    },
  };
}

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
