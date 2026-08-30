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
    const conn = Post.connection;
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
    const conn = Post.connection;
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
    const conn = Post.connection;
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
