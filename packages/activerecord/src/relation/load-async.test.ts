import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { Base } from "../index.js";
import { AsynchronousQueriesTracker } from "../asynchronous-queries-tracker.js";
import { globalThreadPoolAsyncQueryExecutor, setAsyncQueryExecutor } from "../active-record.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { assertQueriesCount } from "../testing/query-assertions.js";

describe("LoadAsyncTest", () => {
  fixtures(["posts"]);

  let restoreExecutor: (() => void) | undefined;
  let tracker: AsynchronousQueriesTracker | undefined;

  beforeEach(async () => {
    setAsyncQueryExecutor("global_thread_pool");
    tracker = AsynchronousQueriesTracker.run();
    const pool = (await Base.connectionPool()) as unknown as { asyncExecutor: unknown };
    const previous = pool.asyncExecutor;
    pool.asyncExecutor = globalThreadPoolAsyncQueryExecutor();
    restoreExecutor = () => {
      pool.asyncExecutor = previous;
    };
  });

  afterEach(() => {
    if (tracker) AsynchronousQueriesTracker.complete(tracker);
    tracker = undefined;
    restoreExecutor?.();
    restoreExecutor = undefined;
    setAsyncQueryExecutor(null);
  });

  it("scheduled?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    expect(deferredPosts.isScheduled).toBe(!inMemoryDb());
    expect(deferredPosts.isLoaded).toBeTruthy();
    await deferredPosts;
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it("null scheduled?", async () => {
    const deferredNullPosts = Post.none().loadAsync();
    expect(deferredNullPosts.isScheduled).toBe(!inMemoryDb());
    expect(deferredNullPosts.isLoaded).toBeTruthy();
    await deferredNullPosts;
    expect(deferredNullPosts.isScheduled).toBeFalsy();
  });
  it("reset", () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
    expect(deferredPosts.isScheduled).toBe(!inMemoryDb());
    deferredPosts.reset();
    expect(deferredPosts.isScheduled).toBeFalsy();
  });
  it.skip("load async has many association", () => {});
  it.skip("load async has many through association", () => {});
  it("notification forwarding", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });

    const status: {
      executed?: boolean;
      async?: unknown;
      thread_id?: unknown;
      lock_wait?: unknown;
    } = {};
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
        status.thread_id = Thread.current().id;
        status.lock_wait = event.payload.lock_wait;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
      const records = await deferredPosts;

      expect(records.map((post) => post.id)).toEqual(expectedRecords.map((post) => post.id));
      const connection = (await Base.connection) as unknown as {
        supportsConcurrentConnections(): boolean;
      };
      expect(status.async).toBe(connection.supportsConcurrentConnections());
      expect(status.thread_id).toBe(Thread.current().id);
      if (connection.supportsConcurrentConnections()) {
        expect(Object(status.lock_wait)).toBeInstanceOf(Number);
      } else {
        expect(status.lock_wait).toBeUndefined();
      }
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });
  it.skip("simple query", () => {});
  it.skip("load async from transaction", () => {});
  it.skip("load async instrumentation is thread safe", () => {});
  it.skip("eager loading query", () => {});
  it("contradiction", async () => {
    await assertQueriesCount(0, false, async () => {
      expect(await Post.where({ id: [] }).loadAsync()).toEqual([]);
    });

    Post.where({ id: [] }).loadAsync().reset();
  });
  it("pluck", async () => {
    const titles = await Post.where({ author_id: 1 }).pluck("title");
    expect(await Post.where({ author_id: 1 }).loadAsync().pluck("title")).toEqual(titles);
  });
  it("count", async () => {
    const count = await Post.where({ author_id: 1 }).count();
    expect(await Post.where({ author_id: 1 }).loadAsync().count()).toEqual(count);
  });
  it("size", async () => {
    const expectedSize = await Post.where({ author_id: 1 }).size();

    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.size()).toEqual(expectedSize);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
  it("empty?", async () => {
    const deferredPosts = Post.where({ author_id: 1 }).loadAsync();

    expect(await deferredPosts.isEmpty()).toEqual(false);
    expect(deferredPosts.isLoaded).toBeTruthy();
  });
  it("load async pluck with query cache", async () => {
    const titles = await Post.where({ author_id: 1 }).pluck("title");
    await Post.cache(async () => {
      expect(await Post.where({ author_id: 1 }).loadAsync().pluck("title")).toEqual(titles);
    });
  });
  it("load async count with query cache", async () => {
    const count = await Post.where({ author_id: 1 }).count();
    await Post.cache(async () => {
      expect(await Post.where({ author_id: 1 }).loadAsync().count()).toEqual(count);
    });
  });
});

describe("LoadAsyncNullExecutorTest", () => {
  it.skip("scheduled?", () => {});
  it.skip("reset", () => {});
  it.skip("simple query", () => {});
  it.skip("load async from transaction", () => {});
  it.skip("eager loading query", () => {});
  it.skip("contradiction", () => {});
  it.skip("pluck", () => {});
  it.skip("size", () => {});
  it.skip("empty?", () => {});
});

describe("LoadAsyncMultiThreadPoolExecutorTest", () => {
  it.skip("async query executor and configuration", () => {});
  it.skip("scheduled?", () => {});
  it.skip("reset", () => {});
  it.skip("simple query", () => {});
  it.skip("load async from transaction", () => {});
  it.skip("eager loading query", () => {});
  it.skip("contradiction", () => {});
  it.skip("pluck", () => {});
  it.skip("size", () => {});
  it.skip("empty?", () => {});
});

describe("LoadAsyncMixedThreadPoolExecutorTest", () => {
  it.skip("scheduled?", () => {});
  it.skip("simple query", () => {});
});
