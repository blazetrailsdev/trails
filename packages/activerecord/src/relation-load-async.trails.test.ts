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

  itIfSupports("concurrent_connections", "reset cancels the scheduled query", async () => {
    // Mirrors relation.rb:1195-1196 — `@future_result&.cancel` — which is
    // reachable only because `exec_main_query` hands the pending FutureResult
    // back unresolved (relation.rb:1148). Hold the scheduled query off the
    // executor so `reset` lands while it is still pending, exactly as Rails'
    // thread pool leaves it until a worker picks it up.
    const pool = (await Base.connectionPool()) as unknown as {
      scheduleQuery(futureResult: unknown): void;
    };
    const scheduled: FutureResult[] = [];
    vi.spyOn(pool, "scheduleQuery").mockImplementation((futureResult) => {
      scheduled.push(futureResult as FutureResult);
    });

    const relation = Topic.all().loadAsync();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].pending()).toBe(true);

    relation.reset();

    expect(scheduled[0].pending()).toBe(false);
    // `executeOrSkip` is the worker's entry point (future_result.rb:100-108);
    // a canceled handle is no longer pending, so it skips the query outright.
    scheduled[0].executeOrSkip();
    await expect(scheduled[0].result()).rejects.toBeInstanceOf(FutureResult.Canceled);
  });

  itIfSupports(
    "concurrent_connections",
    "reset cancels the scheduled query of a skip_query_cache! relation",
    async () => {
      // `skip_query_cache_if_necessary` yields and hands the block's value
      // back untouched (relation.rb:1466-1471), so the `uncached` arm parks the
      // same pending handle the plain arm does.
      const pool = (await Base.connectionPool()) as unknown as {
        scheduleQuery(futureResult: unknown): void;
      };
      const scheduled: FutureResult[] = [];
      vi.spyOn(pool, "scheduleQuery").mockImplementation((futureResult) => {
        scheduled.push(futureResult as FutureResult);
      });

      const relation = Topic.all().skipQueryCacheBang().loadAsync();
      expect(scheduled[0]).toBeInstanceOf(FutureResult.SelectAll);

      relation.reset();

      expect(scheduled[0].pending()).toBe(false);
      await expect(scheduled[0].result()).rejects.toBeInstanceOf(FutureResult.Canceled);
    },
  );

  itIfSupports(
    "concurrent_connections",
    "reset cancels an eager-loaded relation's scheduled query",
    async () => {
      // `apply_join_dependency` yields and hands the block's value back
      // (finder_methods.rb:457-481), so the eager arm's
      // `select_all(relation.arel, "SQL", async: async)` (relation.rb:1436)
      // parks a pending handle too.
      const pool = (await Base.connectionPool()) as unknown as {
        scheduleQuery(futureResult: unknown): void;
      };
      const scheduled: FutureResult[] = [];
      vi.spyOn(pool, "scheduleQuery").mockImplementation((futureResult) => {
        scheduled.push(futureResult as FutureResult);
      });

      const relation = Topic.eagerLoad(":replies").loadAsync();
      expect(scheduled[0]).toBeInstanceOf(FutureResult.SelectAll);

      relation.reset();

      expect(scheduled[0].pending()).toBe(false);
      await expect(scheduled[0].result()).rejects.toBeInstanceOf(FutureResult.Canceled);
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

  it("drains the scheduled query from the loaded? readers", async () => {
    // relation.rb:1149 — `load_async` sets `@loaded` alongside `@future_result`,
    // so `size` (relation.rb:353-359), `empty?` (:362-370), `one?` (:399-405)
    // and `many?` all take their `loaded?` arm, reach `records` -> `load`, and
    // drain the parked future through `!loaded? || scheduled?` (:1180) rather
    // than issuing a COUNT/EXISTS of their own.
    await Topic.create({ title: "sole async topic", author_name: "David" });

    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
    };
    const spy = vi.spyOn(connection, "selectAll");

    const relation = Topic.where({ title: "sole async topic" }).loadAsync();
    expect(relation.isLoaded).toBe(true);
    expect(relation.isScheduled).toBe(true);

    expect(await relation.size()).toBe(1);
    expect(await relation.isEmpty()).toBe(false);
    expect(await relation.isOne()).toBe(true);
    expect(await relation.isMany()).toBe(false);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(relation.isScheduled).toBe(false);
  });

  it("drains a scheduled relation argument to #excluding instead of re-querying its ids", async () => {
    // `excluding` folds relation arguments with `relations.flat_map(&:ids)`
    // (query_methods.rb:1583-1586), and `Calculations#ids` takes its `loaded?`
    // arm through the `records` seam (calculations.rb:373), which drains a
    // parked future — so a `load_async` relation costs no id-select of its own.
    const excluded = await Topic.create({ title: "excluded async topic", author_name: "David" });
    await Topic.create({ title: "kept async topic", author_name: "David" });

    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
    };
    const spy = vi.spyOn(connection, "selectAll");

    const scheduled = Topic.where({ title: "excluded async topic" }).loadAsync();
    const titles = await Topic.excluding(scheduled).pluck("title");

    expect(titles).toEqual(["kept async topic"]);
    expect((excluded as { id: unknown }).id).not.toBe(null);
    // The scheduled SELECT plus the pluck — no third query for the ids.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("batches a scheduled relation in memory instead of re-querying", async () => {
    // `in_batches`' `if loaded?` arm batches `records` in memory
    // (batches.rb), and that read drains the parked future (relation.rb:1149).
    await Topic.create({ title: "batched async topic", author_name: "David" });
    await Topic.create({ title: "other batched async topic", author_name: "David" });

    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
    };
    const spy = vi.spyOn(connection, "selectAll");

    const relation = Topic.all().loadAsync();
    const seen: string[] = [];
    for await (const topic of relation.findEach({ batchSize: 1 })) {
      seen.push((topic as { title: string }).title);
    }

    expect(seen.length).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);
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
  itIfSupports(
    "concurrent_connections",
    "cache hands the block's pending FutureResult back unresolved",
    async () => {
      // `QueryCache::ClassMethods#cache` runs its restore in an `ensure`, which
      // fires when the block RETURNS (query_cache.rb:9-21), so a block handing
      // back a pending handle restores synchronously and the handle passes
      // through untouched — the same shape `uncached` has on the other half of
      // the pair. Adopting it here would resolve the scheduled query away.
      const pool = (await Base.connectionPool()) as unknown as {
        scheduleQuery(futureResult: unknown): void;
      };
      const scheduled: FutureResult[] = [];
      vi.spyOn(pool, "scheduleQuery").mockImplementation((futureResult) => {
        scheduled.push(futureResult as FutureResult);
      });

      const relation = Topic.cache(() => Topic.all().loadAsync()) as unknown as ReturnType<
        typeof Topic.all
      >;

      // Not a Promise: an `async` wrapper would have adopted the relation.
      expect(relation).not.toBeInstanceOf(Promise);
      expect(scheduled[0]).toBeInstanceOf(FutureResult.SelectAll);
      expect(scheduled[0].pending()).toBe(true);
      // The restore already ran, synchronously, when the block returned.
      expect((await Base.connectionPool()).queryCacheEnabled).toBe(false);

      relation.reset();
      expect(scheduled[0].pending()).toBe(false);
      await expect(scheduled[0].result()).rejects.toBeInstanceOf(FutureResult.Canceled);
    },
  );
});
