/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, vi } from "vitest";
import { Base } from "./index.js";
import { reconcileVirtualAttributes } from "./model-schema.js";

import { fixtures } from "./test-helpers/fixtures.js";
import { assertNoQueriesMatch } from "./testing/query-assertions.js";

vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");

// A model declared entirely via `attribute()` under AR_NO_AUTO_SCHEMA never
// reflects its schema, so the shared schema cache is cold. The write path's
// `reconcileVirtualAttributes(reflect: true)` resolves the real columns to flag
// virtual attributes; doing so through the shared schema cache (rather than a
// raw `connection.columns`) memoizes the reflection so later cold-cache work is
// query-free. There is no upstream Rails counterpart — this guards a trails-only
// cold-cache write-path optimization.
describe("virtual attribute reconciliation warms the schema cache", () => {
  fixtures([]);
  it("populates the shared schema cache when reconciling on a cold cache", async () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("virtual_field", "string", { default: "v" });
      }
    }
    const conn = Post.connection;
    await conn.schemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");
    expect(conn.schemaCache.getCachedColumnsHash("posts")).toBeUndefined();

    await Post.create({ title: "hello", body: "b" });

    // reconcile reflected through the shared cache, so it is now warm
    expect(conn.schemaCache.getCachedColumnsHash("posts")).toBeDefined();
  });

  it("warm-cache reconciliation invalidates a columnNames memo taken off the synthesized fallback", async () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("virtual_field", "string", { default: "v" });
      }
    }
    const conn = Post.connection;
    await conn.schemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");

    // Cold cache: loadSchema's synthesized fallback sets `_schemaLoaded` from
    // the declared attributes, so this memoizes the synthesized list.
    const cold = Post.columnNames();
    expect(cold).not.toContain("tags_count");

    // The write path's reconciliation warms the shared cache and clears
    // `_schemaLoaded` without a `_schemaRevision` bump — the memo must be
    // dropped with it, not keep serving the pre-warm synthesized list until
    // some later `loadSchema` happens to bump the revision.
    await reconcileVirtualAttributes.call(Post as never, true);
    expect(Post.columnNames()).toContain("tags_count");
  });

  it("a second save on a cold-cache virtual-attribute model issues no schema-introspection query", async () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("virtual_field", "string", { default: "v" });
      }
    }
    const conn = Post.connection;
    await conn.schemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");

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
