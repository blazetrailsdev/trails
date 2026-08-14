import { describe, it, expect, afterEach } from "vitest";
import { Result } from "./result.js";
import { FutureResult, Complete, type FutureResultConnection } from "./future-result.js";
import { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { ActiveRecord } from "./ar-config.js";
import { select } from "./connection-adapters/abstract/database-statements.js";
import { AsynchronousQueryInsideTransactionError } from "./errors.js";

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

  it("raises AsynchronousQueryInsideTransactionError inside a joinable transaction", async () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    const host = {
      asyncEnabled: () => true,
      currentTransaction: () => ({ open: true, joinable: true }),
    };

    await expect(
      select.call(host as never, "SELECT 1", null, [], { async: FutureResult.SelectAll }),
    ).rejects.toThrow(AsynchronousQueryInsideTransactionError);
  });

  it("resolves to the Result when async is set but no executor is enabled", async () => {
    const result = new Result(["id"], [[1]]);
    const host = {
      asyncEnabled: () => false,
      internalExecQuery: async () => result,
    };

    // Rails' non-enabled arm returns `FutureResult.wrap(result)`. `select` is
    // itself async, so the returned promise adopts that Complete and awaiting
    // yields the Result — which is exactly what select_one/select_rows read.
    expect(
      await select.call(host as never, "SELECT 1", null, [], { async: FutureResult.SelectAll }),
    ).toBe(result);
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

  it("returns a bare Result when async is not set", async () => {
    const result = new Result(["id"], [[1]]);
    const host = { asyncEnabled: () => false, internalExecQuery: async () => result };
    expect(await select.call(host as never, "SELECT 1", null, [])).toBe(result);
  });
});

/** A pool whose `withConnection` yields a connection returning (or raising) `outcome`. */
function fakePool(outcome: Result | Error) {
  const pool = {
    calls: 0,
    scheduleQuery(futureResult: { executeOrSkip(): void }) {
      futureResult.executeOrSkip();
    },
    async withConnection<T>(
      fn: (connection: FutureResultConnection) => Promise<T> | T,
    ): Promise<T> {
      return fn({
        rawExecQuery: async () => {
          pool.calls += 1;
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
      });
    },
  };
  return pool;
}
