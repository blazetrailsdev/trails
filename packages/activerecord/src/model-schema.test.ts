/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "./index.js";

import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
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
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema({ posts: TEST_SCHEMA.posts });
  });

  it("populates the shared schema cache when reconciling on a cold cache", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("virtual_field", "string", { default: "v" });
      }
    }
    const conn = (Post as any).connection;
    await conn.schemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");
    expect(conn.schemaCache.getCachedColumnsHash("posts")).toBeUndefined();

    await (Post as any).create({ title: "hello", body: "b" });

    // reconcile reflected through the shared cache, so it is now warm
    expect(conn.schemaCache.getCachedColumnsHash("posts")).toBeDefined();
  });

  it("a second save on a cold-cache virtual-attribute model issues no schema-introspection query", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "text");
        this.attribute("virtual_field", "string", { default: "v" });
      }
    }
    const conn = (Post as any).connection;
    await conn.schemaCache.clearDataSourceCacheBang(conn.pool ?? conn, "posts");

    const post = await (Post as any).create({ title: "first", body: "b" });
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
