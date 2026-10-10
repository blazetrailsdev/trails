import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { asyncQueryExecutor, setAsyncQueryExecutor } from "../active-record.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-fixtures.js";

describe("load_async on the null executor (trails-only)", () => {
  fixtures(["posts"]);

  let oldConfig: ReturnType<typeof asyncQueryExecutor>;

  beforeEach(() => {
    oldConfig = asyncQueryExecutor();
    setAsyncQueryExecutor(null);
  });

  afterEach(() => {
    setAsyncQueryExecutor(oldConfig);
  });

  it("loads when the caller already holds the connection's lock", async () => {
    const connection = await Post.leaseConnection();
    const posts = await connection.lock.synchronize(() => Post.where({ author_id: 1 }).loadAsync());

    expect(posts.length).toBeGreaterThan(0);
  });

  it("holds the lock ahead of a statement issued after it returns", async () => {
    const connection = await Post.leaseConnection();
    const names: unknown[] = [];
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      names.push(event.payload.name);
    });
    try {
      const posts = Post.where({ author_id: 1 }).loadAsync();
      await connection.selectValue("SELECT 1", "Later");
      await posts;
    } finally {
      Notifications.unsubscribe(subscriber);
    }

    expect(names).toEqual(["Post Load", "Later"]);
  });
});
