/**
 * trails-only end-to-end coverage for `Relation#load_async`.
 *
 * Rails' own relation/load_async_test.rb stays excluded
 * (scripts/parity/unported-files/unscoped.ts): every case there asserts
 * thread-pool interleaving, `scheduled?` across threads, or mutex lock_wait,
 * none of which is observable on a single-threaded event loop. What IS
 * observable — and what relation.rb:1138-1152 is for — is that `load_async`
 * issues its SELECT through `select_all(..., async:)` and so runs on the
 * FutureResult path rather than in the foreground.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { Base, registerModel } from "./index.js";
import { ActiveRecord } from "./ar-config.js";
import { FutureResult } from "./future-result.js";
import { AsynchronousQueriesTracker } from "./asynchronous-queries-tracker.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";
import { fixtures } from "./test-fixtures.js";
import { itIfSupports } from "./support/supports.js";

fixtures({ topics: [Topic, {}] });

describe("Relation#load_async", () => {
  // Register by Rails name so the STI Reply rows behind Topic#replies resolve
  // before the first query warms the model registry.
  registerModel("Topic", Topic);
  registerModel("Reply", Reply);

  let restoreExecutor: (() => void) | undefined;
  let tracker: AsynchronousQueriesTracker | undefined;

  beforeEach(async () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    // Rails schedules a FutureResult onto `asynchronous_queries_session`, which
    // only exists inside one: the Executor opens it per request
    // (`AsynchronousQueriesTracker.run` / `.complete`,
    // asynchronous_queries_tracker.rb:32-40). trails has no Executor to hook
    // yet — `asynchronousQueriesTracker()` seeds a session as a stopgap
    // (core.ts:660-665, story install-executor-hooks-for-async-queries-tracker)
    // — and that seed lives on a tracker shared through the isolated execution
    // state, so a sibling suite's `complete()` can leave the stack empty. Open
    // this suite's own session, exactly as the Executor would.
    tracker = AsynchronousQueriesTracker.run();

    // The pool reads `asyncQueryExecutor` once, in its constructor
    // (connection_pool.rb:714-728 → buildAsyncExecutor), and the harness has
    // already built this one. Swap the executor in for the test so
    // `async_enabled?` is true, exactly as it would be for a pool built with
    // the config set.
    const pool = (await Base.connectionPool()) as unknown as { asyncExecutor: unknown };
    const previous = pool.asyncExecutor;
    pool.asyncExecutor = ActiveRecord.globalThreadPoolAsyncQueryExecutor();
    restoreExecutor = () => {
      pool.asyncExecutor = previous;
    };
  });

  afterEach(() => {
    if (tracker) AsynchronousQueriesTracker.complete(tracker);
    tracker = undefined;
    restoreExecutor?.();
    restoreExecutor = undefined;
    ActiveRecord.asyncQueryExecutor = null;
    vi.restoreAllMocks();
  });

  it("issues the query through select_all with async on", async () => {
    // Spy on the instance, not the prototype: the fixture harness restores its
    // own property and would shadow a prototype spy so it never fires.
    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
      supportsConcurrentConnections(): boolean;
    };
    const spy = vi.spyOn(connection, "selectAll");

    const relation = Topic.all().loadAsync();
    await relation;

    expect(spy).toHaveBeenCalled();
    // Rails asserts the adapter-dependent value rather than a literal `true`:
    // `assert_equal Post.lease_connection.supports_concurrent_connections?,
    // status[:async]` (load_async_test.rb:111). A SQLite `:memory:` database
    // answers false (sqlite3_adapter.rb:198-200), so `async_enabled?` is false
    // (abstract_adapter.rb:562-565) and `load_async` loads in the foreground.
    expect((spy.mock.calls[0][3] as { async?: boolean }).async).toBe(
      connection.supportsConcurrentConnections(),
    );
  });

  itIfSupports(
    "concurrent_connections",
    "schedules a FutureResult::SelectAll on the pool",
    async () => {
      const pool = (await Base.connectionPool()) as unknown as {
        scheduleQuery(futureResult: { executeOrSkip(): void }): void;
      };
      const scheduled: unknown[] = [];
      const spy = vi.spyOn(pool, "scheduleQuery").mockImplementation((futureResult) => {
        scheduled.push(futureResult);
        futureResult.executeOrSkip();
      });

      await Topic.all().loadAsync();

      expect(spy).toHaveBeenCalled();
      expect(scheduled[0]).toBeInstanceOf(FutureResult.SelectAll);
    },
  );

  it("issues an eager-loaded relation's join query with async on", async () => {
    // Rails' exec_main_query forwards `async:` to its eager_loading? arm too —
    // `c.select_all(relation.arel, "SQL", async: async)` (relation.rb:1436).
    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
      supportsConcurrentConnections(): boolean;
    };
    const spy = vi.spyOn(connection, "selectAll");

    await Topic.eagerLoad(":replies").loadAsync();

    const joinCall = spy.mock.calls.find((call) => call[1] === "SQL");
    expect(joinCall).toBeDefined();
    expect((joinCall![3] as { async?: boolean }).async).toBe(
      connection.supportsConcurrentConnections(),
    );
  });

  it("returns the records the scheduled query loaded", async () => {
    await Topic.create({ title: "async load", author_name: "David" });

    const relation = Topic.all().loadAsync();
    const records = await relation;

    expect(records.map((t) => t.title)).toContain("async load");
    expect(relation.isLoaded).toBe(true);
  });

  it("runs the query in the foreground when no executor is configured", async () => {
    restoreExecutor?.();
    restoreExecutor = undefined;
    ActiveRecord.asyncQueryExecutor = null;

    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
    };
    const spy = vi.spyOn(connection, "selectAll");

    await Topic.all().loadAsync();

    // Rails: `return load if !c.async_enabled?` (relation.rb:1140).
    expect((spy.mock.calls[0][3] as { async?: boolean }).async).toBe(false);
  });
});
