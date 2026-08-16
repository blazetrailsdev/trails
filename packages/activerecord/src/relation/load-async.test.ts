/**
 * Mirrors: activerecord/test/cases/relation/load_async_test.rb
 *
 * Only `test_notification_forwarding` is enrolled. Every other case here
 * asserts thread-pool sizing, `scheduled?` interleaving across threads, or a
 * mutex `lock_wait` measured between threads — none observable on a
 * single-threaded event loop, and still recorded in
 * scripts/parity/unported-files/unscoped.ts.
 */
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
    // Rails' test suite runs with an async_query_executor configured; trails
    // has no Executor hook to open the session yet, so open one here exactly
    // as `AsynchronousQueriesTracker.run` would
    // (asynchronous_queries_tracker.rb:32-40).
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

  it.skip("scheduled?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("null scheduled?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async has many association", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async has many through association", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  // Rails also asserts `Thread.current.object_id` is unchanged
  // (load_async_test.rb:107, :112) — the point being that the notification is
  // republished on the *foreground* thread. There is only one thread here, so
  // the assertion has no JS counterpart and is dropped rather than faked.
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
        // Rails: `assert_instance_of Float, status[:lock_wait]` — every JS
        // number is a Float.
        expect(typeof status.lock_wait).toBe("number");
      } else {
        expect(status.lock_wait).toBeUndefined();
      }
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });
  it.skip("simple query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async from transaction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async instrumentation is thread safe", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("eager loading query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("contradiction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("empty?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async pluck with query cache", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async count with query cache", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
});

describe("LoadAsyncNullExecutorTest", () => {
  it.skip("scheduled?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("simple query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async from transaction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("eager loading query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("contradiction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("empty?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
});

describe("LoadAsyncMultiThreadPoolExecutorTest", () => {
  it.skip("async query executor and configuration", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("scheduled?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("simple query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("load async from transaction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("eager loading query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("contradiction", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("empty?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
});

describe("LoadAsyncMixedThreadPoolExecutorTest", () => {
  it.skip("scheduled?", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
  it.skip("simple query", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — future_result
  });
});
