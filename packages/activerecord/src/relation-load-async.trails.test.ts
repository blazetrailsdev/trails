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
  registerModel("Topic", Topic);
  registerModel("Reply", Reply);

  let restoreExecutor: (() => void) | undefined;
  let tracker: AsynchronousQueriesTracker | undefined;

  beforeEach(async () => {
    ActiveRecord.asyncQueryExecutor = "global_thread_pool";
    tracker = AsynchronousQueriesTracker.run();

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
    const connection = Base.connection as unknown as {
      selectAll: (...args: unknown[]) => unknown;
      supportsConcurrentConnections(): boolean;
    };
    const spy = vi.spyOn(connection, "selectAll");

    const relation = Topic.all().loadAsync();
    await relation;

    expect(spy).toHaveBeenCalled();
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
    scheduled[0].executeOrSkip();
    await expect(scheduled[0].result()).rejects.toBeInstanceOf(FutureResult.Canceled);
  });

  itIfSupports(
    "concurrent_connections",
    "reset cancels the scheduled query of a skip_query_cache! relation",
    async () => {
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
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("batches a scheduled relation in memory instead of re-querying", async () => {
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

    expect((spy.mock.calls[0][3] as { async?: boolean }).async).toBe(false);
  });
  itIfSupports(
    "concurrent_connections",
    "cache hands the block's pending FutureResult back unresolved",
    async () => {
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

      expect(relation).not.toBeInstanceOf(Promise);
      expect(scheduled[0]).toBeInstanceOf(FutureResult.SelectAll);
      expect(scheduled[0].pending()).toBe(true);
      expect((await Base.connectionPool()).queryCacheEnabled).toBe(false);

      relation.reset();
      expect(scheduled[0].pending()).toBe(false);
      await expect(scheduled[0].result()).rejects.toBeInstanceOf(FutureResult.Canceled);
    },
  );
});
