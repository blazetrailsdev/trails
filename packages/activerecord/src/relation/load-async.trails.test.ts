import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { asyncQueryExecutor, setAsyncQueryExecutor } from "../active-record.js";
import { Post } from "../test-helpers/models/post.js";
import { fixtures } from "../test-helpers/use-fixtures.js";

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

  const heldLock = async (connection: Awaited<ReturnType<typeof Post.leaseConnection>>) => {
    let release!: () => void;
    const held = connection.lock.synchronize(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    return async () => {
      release();
      await held;
    };
  };

  it("loads a relation scheduled while the connection's lock is held", async () => {
    const connection = await Post.leaseConnection();
    const expected = (await Post.where({ author_id: 2 }).order({ id: "asc" })).map((p) => p.id);
    expect(expected.length).toBe(3);

    const release = await heldLock(connection);
    const posts = Post.where({ author_id: 2 }).order({ id: "asc" }).loadAsync();
    await release();

    expect((await posts).map((p) => p.id)).toEqual(expected);
  });

  it("issues one statement when a reader arrives before the scheduled load runs", async () => {
    const connection = await Post.leaseConnection();
    const names: unknown[] = [];
    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      names.push(event.payload.name);
    });
    try {
      const release = await heldLock(connection);
      const posts = Post.where({ author_id: 2 }).loadAsync();
      const reader = posts.records();
      await release();

      expect((await reader).length).toBe(3);
      await connection.lock.synchronize(() => undefined);
    } finally {
      Notifications.unsubscribe(subscriber);
    }

    expect(names).toEqual(["Post Load"]);
  });

  it("leaves a relation unloaded and raises on the reader when its load rejects", async () => {
    const connection = await Post.leaseConnection();
    const posts = Post.where("no_such_column = 1").loadAsync();

    await expect(posts.records()).rejects.toThrow(/no_such_column/);
    await connection.lock.synchronize(() => undefined);
    await Promise.resolve();

    expect(posts.isLoaded).toBe(false);
  });
});

for (const executor of ["configured", "null"] as const) {
  describe(`load_async on several relations, ${executor} executor (trails-only)`, () => {
    fixtures(["posts"]);

    let oldConfig: ReturnType<typeof asyncQueryExecutor>;

    beforeEach(() => {
      oldConfig = asyncQueryExecutor();
      if (executor === "null") setAsyncQueryExecutor(null);
    });

    afterEach(() => {
      setAsyncQueryExecutor(oldConfig);
    });

    const posts = (authorId: number) => Post.where({ author_id: authorId }).order({ id: "asc" });
    const ids = async (authorId: number) => (await posts(authorId)).map((post) => post.id);

    it("three scheduled relations all carry their rows", async () => {
      const expected = [await ids(1), await ids(2), await ids(3)];
      expect(expected.map((rows) => rows.length)).toEqual([5, 3, 2]);

      const scheduled = [posts(1).loadAsync(), posts(2).loadAsync(), posts(3).loadAsync()];
      const loaded: unknown[][] = [];
      for (const relation of scheduled) {
        loaded.push((await relation).map((post) => post.id));
      }

      expect(loaded).toEqual(expected);
    });

    it("three scheduled relations carry their rows when consumed in reverse order", async () => {
      const expected = [await ids(1), await ids(2), await ids(3)];

      const scheduled = [posts(1).loadAsync(), posts(2).loadAsync(), posts(3).loadAsync()];
      const loaded: unknown[][] = [];
      for (const index of [2, 1, 0]) {
        loaded[index] = (await scheduled[index]).map((post) => post.id);
      }

      expect(loaded).toEqual(expected);
    });

    it("a load_async after an earlier one was consumed still returns rows", async () => {
      const expected = [await ids(1), await ids(2), await ids(3)];

      const loaded: unknown[][] = [];
      for (const authorId of [1, 2, 3]) {
        loaded.push((await posts(authorId).loadAsync()).map((post) => post.id));
      }

      expect(loaded).toEqual(expected);
    });
  });
}
