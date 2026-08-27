import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { Base } from "../index.js";
import { ActiveRecord } from "../ar-config.js";
import { AsynchronousQueriesTracker } from "../asynchronous-queries-tracker.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("LoadAsyncTest", () => {
  fixtures(["posts"]);

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
  });

  it.skip("scheduled?", () => {});
  it.skip("null scheduled?", () => {});
  it.skip("load async has many association", () => {});
  it.skip("load async has many through association", () => {});
  it("notification forwarding", async () => {
    const expectedRecords = await Post.where({ author_id: 1 });

    const status: { executed?: boolean; async?: unknown; lock_wait?: unknown } = {};
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.name === "Post Load") {
        status.executed = true;
        status.async = event.payload.async;
        status.lock_wait = event.payload.lock_wait;
      }
    });

    try {
      const deferredPosts = Post.where({ author_id: 1 }).loadAsync();
      const records = await deferredPosts;

      expect(records.map((post) => post.id)).toEqual(expectedRecords.map((post) => post.id));
      const connection = Base.connection as unknown as {
        supportsConcurrentConnections(): boolean;
      };
      expect(status.async).toBe(connection.supportsConcurrentConnections());
      if (connection.supportsConcurrentConnections()) {
        expect(typeof status.lock_wait).toBe("number");
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
  it.skip("contradiction", () => {});
  it.skip("empty?", () => {});
  it.skip("load async pluck with query cache", () => {});
  it.skip("load async count with query cache", () => {});
});

describe("LoadAsyncNullExecutorTest", () => {
  it.skip("scheduled?", () => {});
  it.skip("simple query", () => {});
  it.skip("load async from transaction", () => {});
  it.skip("eager loading query", () => {});
  it.skip("contradiction", () => {});
  it.skip("empty?", () => {});
});

describe("LoadAsyncMultiThreadPoolExecutorTest", () => {
  it.skip("async query executor and configuration", () => {});
  it.skip("scheduled?", () => {});
  it.skip("simple query", () => {});
  it.skip("load async from transaction", () => {});
  it.skip("eager loading query", () => {});
  it.skip("contradiction", () => {});
  it.skip("empty?", () => {});
});

describe("LoadAsyncMixedThreadPoolExecutorTest", () => {
  it.skip("scheduled?", () => {});
  it.skip("simple query", () => {});
});
