// Phase 1 proof: the QueryCache mixin's `selectAll` override + `dirtiesQueryCache`
// wiring caches SELECT results in the live adapter path (no QueryCacheAdapter
// wrapper). The verbatim-named query_cache_test.rb cases are migrated onto the
// mixin in Phase 3; these descriptive tests just prove the wiring is live.
import { describe, it, expect } from "vitest";
import { createTestAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { Result } from "./result.js";
import {
  Store,
  makeCachedSelectAll,
  dirtiesQueryCache,
} from "./connection-adapters/abstract/query-cache.js";

const TEST_SCHEMA = { tasks: { title: "string" } } as const;

describe("makeCachedSelectAll (unit)", () => {
  function makeHost(store: Store) {
    return { _queryCache: store } as unknown as { _queryCache: Store };
  }

  it("serves a repeated query from the cache instead of re-running the original", async () => {
    const store = new Store();
    store.enabled = true;
    let calls = 0;
    const base = async () => {
      calls++;
      return Result.fromRowHashes([{ id: 1, title: "first" }]);
    };
    const cached = makeCachedSelectAll(base as never);
    const host = makeHost(store);

    const r1 = await cached.call(host as never, "SELECT * FROM tasks");
    const r2 = await cached.call(host as never, "SELECT * FROM tasks");

    expect(calls).toBe(1);
    expect(r1.toArray()).toEqual([{ id: 1, title: "first" }]);
    expect(r2.toArray()).toEqual([{ id: 1, title: "first" }]);
    expect(store.size).toBe(1);
  });

  it("delegates to the original when the cache is disabled", async () => {
    const store = new Store();
    store.enabled = false;
    let calls = 0;
    const base = async () => {
      calls++;
      return Result.fromRowHashes([{ id: calls }]);
    };
    const cached = makeCachedSelectAll(base as never);
    const host = makeHost(store);

    await cached.call(host as never, "SELECT * FROM tasks");
    await cached.call(host as never, "SELECT * FROM tasks");

    expect(calls).toBe(2);
    expect(store.size).toBe(0);
  });

  it("does not cache locked (FOR UPDATE) queries", async () => {
    const store = new Store();
    store.enabled = true;
    let calls = 0;
    const base = async () => {
      calls++;
      return Result.fromRowHashes([{ id: calls }]);
    };
    const cached = makeCachedSelectAll(base as never);
    const host = makeHost(store);

    await cached.call(host as never, "SELECT * FROM tasks FOR UPDATE");
    await cached.call(host as never, "SELECT * FROM tasks FOR UPDATE");

    expect(calls).toBe(2);
    expect(store.size).toBe(0);
  });

  it("keys distinct binds separately", async () => {
    const store = new Store();
    store.enabled = true;
    let calls = 0;
    const base = async (_sql: string, _name?: string | null, binds?: unknown[]) => {
      calls++;
      return Result.fromRowHashes([{ id: binds?.[0] }]);
    };
    const cached = makeCachedSelectAll(base as never);
    const host = makeHost(store);

    await cached.call(host as never, "SELECT * FROM tasks WHERE id = ?", null, [1]);
    await cached.call(host as never, "SELECT * FROM tasks WHERE id = ?", null, [2]);
    await cached.call(host as never, "SELECT * FROM tasks WHERE id = ?", null, [1]);

    expect(calls).toBe(2);
    expect(store.size).toBe(2);
  });
});

describe("dirtiesQueryCache (unit)", () => {
  it("clears the cache before delegating when dirties is set", async () => {
    class Writer {
      _queryCache = new Store();
      calls = 0;
      doWrite() {
        this.calls++;
        return this.calls;
      }
    }
    dirtiesQueryCache(Writer, "doWrite");

    const w = new Writer();
    w._queryCache.enabled = true;
    w._queryCache.dirties = true;
    await w._queryCache.computeIfAbsent("k", async () => [{ a: 1 }]);
    expect(w._queryCache.size).toBe(1);

    const ret = w.doWrite();

    expect(ret).toBe(1);
    expect(w._queryCache.empty).toBe(true);
  });

  it("leaves the cache intact when dirties is false", async () => {
    class Writer {
      _queryCache = new Store();
      doWrite() {}
    }
    dirtiesQueryCache(Writer, "doWrite");

    const w = new Writer();
    w._queryCache.enabled = true;
    w._queryCache.dirties = false;
    await w._queryCache.computeIfAbsent("k", async () => [{ a: 1 }]);

    w.doWrite();

    expect(w._queryCache.size).toBe(1);
  });
});

describe("QueryCache mixin live adapter path", () => {
  it("caches selectAll results and dirties them on writes", async () => {
    const a = createTestAdapter() as unknown as {
      _queryCache: Store | null;
      queryCache: Store | null;
      selectAll(sql: string): Promise<Result>;
      execInsert(sql: string): Promise<unknown>;
    };
    await defineSchema(a as never, TEST_SCHEMA);
    // A second connection on the same shared-cache database performs the
    // out-of-band setup write whose row must NOT invalidate `a`'s cache.
    const b = createTestAdapter();

    // Install an enabled store directly so the test targets the selectAll
    // override + dirtiesQueryCache wiring on the real adapter, independent of
    // the pool-checkout enable/disable surface (covered by its own tests).
    const store = new Store();
    store.enabled = true;
    store.dirties = true;
    a._queryCache = store;
    expect(a.queryCache?.enabled).toBe(true);

    await b.executeMutation("INSERT INTO tasks (title) VALUES ('one')");
    const r1 = await a.selectAll("SELECT * FROM tasks ORDER BY id");
    expect(r1.length).toBe(1);
    expect(a.queryCache?.size).toBe(1);

    // Out-of-band insert via `b` — `a`'s cached result stays stale, proving
    // the second selectAll is a cache hit, not a fresh query.
    await b.executeMutation("INSERT INTO tasks (title) VALUES ('two')");
    const r2 = await a.selectAll("SELECT * FROM tasks ORDER BY id");
    expect(r2.length).toBe(1);

    // A write through `a`'s wrapped exec path dirties the cache
    // (dirtiesQueryCache wiring on execInsert).
    await a.execInsert("INSERT INTO tasks (title) VALUES ('three')");
    expect(a.queryCache?.empty).toBe(true);

    const r3 = await a.selectAll("SELECT * FROM tasks ORDER BY id");
    expect(r3.length).toBe(3);
  });
});
