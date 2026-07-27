/**
 * trails-specific invariant with no verbatim Rails counterpart.
 *
 * Rails wires `dirties_query_cache` on the public `execute` (query_cache.rb:13),
 * and DDL runs through `execute`, so a schema change inside a `cache` block
 * clears the query cache. trails now routes DDL through that same wired
 * `execute` (schema-statements), while CRUD writes clear at the wired
 * `execInsert`/`execUpdate`/`execDelete` above the unwired `executeMutation`
 * primitive. This test pins the DDL half of that contract: a schema
 * change issued inside an enabled `cache` block clears the cache exactly once,
 * matching Rails' `execute`-based DDL. (Rails' closest test,
 * `test_cache_gets_cleared_after_migration`, warms the cache *outside* a `cache`
 * block and only asserts no stale-schema error — it never observes the clear.)
 */
import { describe, it, expect, afterEach } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { isSqliteRun } from "./support/sqlite-template.js";

registerModel(Post as never);

describe("QueryCache DDL dirties (trails)", () => {
  // `useTransactionalTests: false`: this test issues real DDL (`add_column` /
  // `remove_column`). MySQL implicitly commits on DDL, which would commit the
  // fixture transaction mid-test and leak `posts` rows into the shared worker
  // DB; run non-transactionally so the fixtures are cleaned up by reload instead.
  fixtures(["posts"], { useTransactionalTests: false });

  afterEach(async () => {
    (await Post.leaseConnection()).clearQueryCache();
  });

  it("DDL inside a cache block clears the query cache", async () => {
    const conn = (await Post.leaseConnection()) as never as {
      _queryCache: { clear(): void };
      addColumn(t: string, c: string, ty: string): Promise<void>;
      removeColumn(t: string, c: string): Promise<void>;
    };

    await Post.cache(async () => {
      // Warm the cache so there is something for the DDL to clear. This also
      // ensures the connection's `_queryCache` store is assigned (checkout) and
      // enabled — that is the exact object the dirtying wrapper clears
      // (`this._queryCache.clear()`), so spy on it rather than the
      // execution-context-keyed pool store, which need not be the same object.
      await Post.find(1);
      const store = conn._queryCache;
      const real = store.clear.bind(store);

      let clears = 0;
      store.clear = () => {
        clears++;
        real();
      };
      try {
        // `add_column` is a single `ALTER TABLE … ADD COLUMN` that funnels
        // through the public `execute` on every adapter (unlike sqlite's
        // `change_column`, which takes the table-rebuild path). It must dirty
        // the cache exactly once — like Rails' `execute`-based DDL, where the
        // pre-fix deviation left it untouched (zero clears).
        await conn.addColumn("posts", "queryCacheDdlProbe", "string");
        expect(clears).toBe(1);
      } finally {
        store.clear = real;
        // Restore the canonical `posts` shape.
        await conn.removeColumn("posts", "queryCacheDdlProbe");
      }
    });
  });

  // sqlite3's `removeIndex` and `createVirtualTable` are DDL that Rails issues
  // via `exec_query` (sqlite3_adapter.rb:290, :314) — the wrapped path, so they
  // dirty. They are one regex away from looking like the reflection reads
  // around them (both were briefly mis-routed through the non-dirtying
  // `schemaQuery`), so pin that they still clear.
  it.skipIf(!isSqliteRun())(
    "sqlite removeIndex and createVirtualTable dirty the query cache",
    async () => {
      const conn = (await Post.leaseConnection()) as never as {
        _queryCache: { clear(): void };
        addIndex(t: string, c: string, o?: Record<string, unknown>): Promise<void>;
        removeIndex(t: string, o: Record<string, unknown>): Promise<void>;
        createVirtualTable(t: string, m: string, v: string[]): Promise<void>;
        dropVirtualTable(t: string, m?: string, v?: string[]): Promise<void>;
      };

      // Each arm counts clears independently, so a regression in either one
      // fails on its own rather than being masked by the other.
      const countClears = async (ddl: () => Promise<void>): Promise<number> => {
        const store = conn._queryCache;
        const real = store.clear.bind(store);
        let clears = 0;
        store.clear = () => {
          clears++;
          real();
        };
        try {
          await ddl();
        } finally {
          store.clear = real;
        }
        return clears;
      };

      await conn.addIndex("posts", "title", { name: "index_posts_ddl_probe" });
      await Post.cache(async () => {
        await Post.find(1);
        const indexClears = await countClears(() =>
          conn.removeIndex("posts", { name: "index_posts_ddl_probe" }),
        );
        expect(indexClears).toBeGreaterThan(0);

        // Re-warm: the removeIndex clear emptied the store.
        await Post.find(1);
        const virtualClears = await countClears(() =>
          conn.createVirtualTable("ddl_probe_vtable", "fts5", ["title"]),
        );
        try {
          expect(virtualClears).toBeGreaterThan(0);
        } finally {
          await conn.dropVirtualTable("ddl_probe_vtable", "fts5", ["title"]);
        }
      });
    },
  );
});
