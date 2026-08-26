/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, vi } from "vitest";
import { Base } from "./index.js";

import { fixtures } from "./test-fixtures.js";
import { assertNoQueriesMatch } from "./testing/query-assertions.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

// A model declared entirely via `attribute()` under AR_NO_AUTO_SCHEMA never
// reflects its schema, so the shared schema cache is cold and `load_schema!`
// falls back to a `columns_hash` synthesized from those declarations alone.
// Rails never has this state — `columns_hash` is a blocking DB read
// (model_schema.rb:437-441) — so the async load has to drop the synthesized
// view once the cache is warm. There is no upstream Rails counterpart.
describe("the async schema load warms the shared cache and replaces a synthesized view", () => {
  fixtures([]);
  it("populates the shared schema cache when loading on a cold cache", async () => {
    class Post extends Base {
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

    // the load reflected through the shared cache, so it is now warm
    expect(conn.internalSchemaCache.getCachedColumnsHash("posts")).toBeDefined();
  });

  it("a warm-cache load invalidates a columnNames memo taken off the synthesized fallback", async () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("declared_field", "string", { default: "v" });
      }
    }
    const conn = Post.connection;
    await conn.internalSchemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");

    // Cold cache: loadSchema's synthesized fallback sets `_schemaLoaded` from
    // the declared attributes, so this memoizes the synthesized list.
    const cold = Post.columnNames();
    expect(cold).not.toContain("tags_count");

    // The async load warms the shared cache and reloads from it — the memo must
    // be dropped with the synthesized view, not keep serving the pre-warm list.
    await Post.loadSchema();
    expect(Post.columnNames()).toContain("tags_count");
  });

  it("a second save on a cold-cache declared-attribute model issues no schema-introspection query", async () => {
    class Post extends Base {
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
