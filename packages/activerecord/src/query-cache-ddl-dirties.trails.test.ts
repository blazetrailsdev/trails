/**
 * trails-specific invariant with no verbatim Rails counterpart.
 *
 * Rails wires `dirties_query_cache` on the public `execute` (query_cache.rb:13),
 * and DDL runs through `execute`, so a schema change inside a `cache` block
 * clears the query cache. trails routes DDL through the low-level
 * `executeMutation` (schema-statements), which CRUD writes also funnel through
 * below the wired `execInsert`/`execUpdate`/`execDelete`. `executeMutation` is
 * wired to dirty the cache but guarded (`_writeDirtyDepth`) so nested CRUD does
 * not double-clear. This test pins the DDL half of that contract: a schema
 * change issued inside an enabled `cache` block clears the cache exactly once,
 * matching Rails' `execute`-based DDL. (Rails' closest test,
 * `test_cache_gets_cleared_after_migration`, warms the cache *outside* a `cache`
 * block and only asserts no stale-schema error — it never observes the clear.)
 */
import { describe, it, expect, afterEach } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Base } from "./base.js";
import { Post } from "./test-helpers/models/post.js";

registerModel(Post as never);

describe("QueryCache DDL dirties (trails)", () => {
  fixtures(["posts"]);

  afterEach(async () => {
    (await Post.leaseConnection()).clearQueryCache();
  });

  it("DDL inside a cache block clears the query cache", async () => {
    const store = Base.connectionPool().queryCache as never as { clear(): void };
    const real = store.clear.bind(store);
    const conn = await Post.leaseConnection();

    await Post.cache(async () => {
      // Warm the cache so there is something for the DDL to clear.
      await Post.find(1);

      let clears = 0;
      store.clear = () => {
        clears++;
        real();
      };
      try {
        // `add_column` is a single `ALTER TABLE … ADD COLUMN` that funnels
        // through `executeMutation` on every adapter (unlike sqlite's
        // `change_column`, which takes the table-rebuild path). It must dirty
        // the cache exactly once — like Rails' `execute`-based DDL, where the
        // pre-fix deviation left it untouched (zero clears), and not twice (the
        // nested-CRUD double-clear that the `_writeDirtyDepth` guard prevents).
        await conn.addColumn("posts", "queryCacheDdlProbe", "string");
        expect(clears).toBe(1);
      } finally {
        store.clear = real;
        // Restore the canonical `posts` shape.
        await conn.removeColumn("posts", "queryCacheDdlProbe");
      }
    });
  });
});
