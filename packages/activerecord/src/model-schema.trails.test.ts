import { describe, it, expect, vi } from "vitest";
import { Base } from "./index.js";

import { fixtures } from "./test-fixtures.js";
import { assertNoQueriesMatch } from "./testing/query-assertions.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

describe("the async schema load warms the shared cache and replaces a synthesized view", () => {
  fixtures([]);
  it("populates the shared schema cache when loading on a cold cache", async () => {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("declared_field", "string", { default: "v" });
      }
    }
    const conn = await Post.leaseConnection();
    await conn.internalSchemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");
    expect(conn.internalSchemaCache.getCachedColumnsHash("posts")).toBeUndefined();

    await Post.create({ title: "hello", body: "b" });

    expect(conn.internalSchemaCache.getCachedColumnsHash("posts")).toBeDefined();
  });

  it("a warm-cache load invalidates a columnNames memo taken off the synthesized fallback", async () => {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("declared_field", "string", { default: "v" });
      }
    }
    const conn = await Post.leaseConnection();
    await conn.internalSchemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");

    const cold = Post.columnNames();
    expect(cold).not.toContain("tags_count");

    await Post.loadSchema();
    expect(Post.columnNames()).toContain("tags_count");
  });

  it("a second save on a cold-cache declared-attribute model issues no schema-introspection query", async () => {
    class Post extends Base {
      declare title: string;
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("declared_field", "string", { default: "v" });
      }
    }
    const conn = await Post.leaseConnection();
    await conn.internalSchemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");

    const post = await Post.create({ title: "first", body: "b" });
    post.title = "second";
    await assertNoQueriesMatch(
      /pragma_table_info|PRAGMA table_info|information_schema/i,
      true,
      async () => {
        await post.save();
      },
    );
  });
});

describe("a sequence lookup in flight does not overwrite a later writer", () => {
  fixtures([]);
  it("keeps a sequence name set while resetSequenceName is pending", async () => {
    class Post extends Base {}
    const pending = Post.resetSequenceName();
    Post.sequenceName = "posts_nonstd_seq";
    await pending;

    expect(await Post.sequenceName).toBe("posts_nonstd_seq");
  });

  it("asks the adapter again after a lookup that answered nil", async () => {
    class Post extends Base {}
    const withConnection = vi.spyOn(Post, "withConnection").mockResolvedValue(null);
    try {
      expect(await Post.sequenceName).toBeNull();
      expect(await Post.sequenceName).toBeNull();
      expect(withConnection).toHaveBeenCalledTimes(2);
    } finally {
      withConnection.mockRestore();
    }
  });

  it("memoizes the name a lookup answered", async () => {
    class Post extends Base {}
    const withConnection = vi.spyOn(Post, "withConnection").mockResolvedValue("posts_id_seq");
    try {
      expect(await Post.sequenceName).toBe("posts_id_seq");
      expect(await Post.sequenceName).toBe("posts_id_seq");
      expect(withConnection).toHaveBeenCalledTimes(1);
    } finally {
      withConnection.mockRestore();
    }
  });

  it("retries after a lookup that rejected", async () => {
    class Post extends Base {}
    const withConnection = vi
      .spyOn(Post, "withConnection")
      .mockRejectedValueOnce(new Error("connection lost"));
    try {
      await expect(Post.sequenceName).rejects.toThrow("connection lost");
      await expect(Post.sequenceName).resolves.toEqual(await Post.resetSequenceName());
    } finally {
      withConnection.mockRestore();
    }
  });

  it("keeps a sequence name set before a pending lookup rejects", async () => {
    class Post extends Base {}
    const withConnection = vi
      .spyOn(Post, "withConnection")
      .mockRejectedValueOnce(new Error("connection lost"));
    try {
      const pending = Post.resetSequenceName();
      Post.sequenceName = "posts_nonstd_seq";
      await expect(pending).rejects.toThrow("connection lost");

      expect(await Post.sequenceName).toBe("posts_nonstd_seq");
    } finally {
      withConnection.mockRestore();
    }
  });

  it("drops a lookup made for the previous table name", async () => {
    class Post extends Base {}
    const pending = Post.resetSequenceName();
    Post.tableName = "comments";
    await pending;

    expect(Object.getOwnPropertyDescriptor(Post, "_sequenceName")!.value).toBeNull();
  });
});
