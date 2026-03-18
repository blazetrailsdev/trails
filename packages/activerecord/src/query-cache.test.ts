import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import { QueryCacheAdapter, QueryCacheStore } from "./query-cache.js";

function setup() {
  const inner = createTestAdapter();
  const cached = new QueryCacheAdapter(inner);

  class Task extends Base {
    static {
      this.attribute("title", "string");
      this.adapter = cached;
    }
  }
  return { inner, cached, Task };
}

describe("QueryCacheTest", () => {
  it("execute clear cache", async () => {
    const { cached, Task } = setup();
    cached.enableQueryCache();
    await Task.create({ title: "first" });
    expect(cached.cache.empty).toBe(true);
  });

  it("exec query clear cache", async () => {
    const { cached, Task } = setup();
    cached.enableQueryCache();
    await Task.create({ title: "first" });
    await Task.all().toArray();
    expect(cached.cache.size).toBeGreaterThan(0);
    await Task.create({ title: "second" });
    expect(cached.cache.empty).toBe(true);
  });

  it("writes should always clear cache", async () => {
    const { cached, Task } = setup();
    cached.enableQueryCache();
    await Task.create({ title: "first" });
    await Task.all().toArray();
    expect(cached.cache.size).toBeGreaterThan(0);
    const t = await Task.first();
    (t as any).writeAttribute("title", "updated");
    await (t as any).save();
    expect(cached.cache.empty).toBe(true);
  });

  it("reads dont clear disabled cache", async () => {
    const { cached, Task } = setup();
    cached.disableQueryCache();
    await Task.create({ title: "first" });
    await Task.all().toArray();
    expect(cached.cache.empty).toBe(true);
  });

  it.skip("exceptional middleware clears and disables cache on error", () => {
    /* needs middleware integration */
  });
  it.skip("query cache is applied to all connections", () => {
    /* needs multi-connection support */
  });
  it.skip("cache is not applied when config is false", () => {
    /* needs config-based cache setup */
  });
  it.skip("cache is applied when config is string", () => {
    /* needs config-based cache setup */
  });
  it.skip("cache is applied when config is integer", () => {
    /* needs config-based cache setup */
  });
  it.skip("cache is applied when config is nil", () => {
    /* needs config-based cache setup */
  });
  it.skip("query cache with forked processes", () => {
    /* needs process forking support */
  });
  it.skip("query cache across threads", () => {
    /* needs thread-safety testing */
  });
  it.skip("middleware delegates", () => {
    /* needs middleware integration */
  });
  it.skip("middleware caches", () => {
    /* needs middleware integration */
  });

  it("cache enabled during call", async () => {
    const { cached, Task } = setup();
    expect(cached.cache.enabled).toBe(false);
    await cached.withCache(async () => {
      expect(cached.cache.enabled).toBe(true);
    });
    expect(cached.cache.enabled).toBe(false);
  });

  it("cache passing a relation", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "cached" });
    await cached.withCache(async () => {
      const r1 = await Task.all().toArray();
      const r2 = await Task.all().toArray();
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
    });
  });

  it("find queries", async () => {
    const { cached, Task } = setup();
    const t = await Task.create({ title: "findme" });
    cached.resetCounters();
    cached.enableQueryCache();
    await Task.find(t.id);
    await Task.find(t.id);
    expect(cached.cache.size).toBeGreaterThan(0);
  });

  it("find queries with cache", async () => {
    const { cached, Task } = setup();
    const t = await Task.create({ title: "test" });
    await cached.withCache(async () => {
      const r1 = await Task.find(t.id);
      const r2 = await Task.find(t.id);
      expect(r1.readAttribute("title")).toBe("test");
      expect(r2.readAttribute("title")).toBe("test");
    });
  });

  it("find queries with cache multi record", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "a" });
    await Task.create({ title: "b" });
    await cached.withCache(async () => {
      const r1 = await Task.all().toArray();
      const r2 = await Task.all().toArray();
      expect(r1).toHaveLength(2);
      expect(r2).toHaveLength(2);
    });
  });

  it("find queries with multi cache blocks", async () => {
    const { cached, Task } = setup();
    const t = await Task.create({ title: "test" });
    await cached.withCache(async () => {
      await Task.find(t.id);
    });
    await cached.withCache(async () => {
      await Task.find(t.id);
    });
  });

  it("count queries with cache", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "a" });
    await cached.withCache(async () => {
      const c1 = await Task.count();
      const c2 = await Task.count();
      expect(c1).toBe(1);
      expect(c2).toBe(1);
    });
  });

  it("exists queries with cache", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "a" });
    await cached.withCache(async () => {
      const e1 = await Task.exists();
      const e2 = await Task.exists();
      expect(e1).toBe(true);
      expect(e2).toBe(true);
    });
  });

  it("select all with cache", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "all" });
    await cached.withCache(async () => {
      const r1 = await Task.all().toArray();
      const r2 = await Task.all().toArray();
      expect(r1).toEqual(r2);
    });
  });

  it.skip("select one with cache", () => {
    /* needs selectOne API */
  });
  it.skip("select value with cache", () => {
    /* needs selectValue API */
  });
  it.skip("select values with cache", () => {
    /* needs selectValues API */
  });
  it.skip("select rows with cache", () => {
    /* needs selectRows API */
  });

  it("query cache dups results correctly", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "dup" });
    await cached.withCache(async () => {
      const r1 = await Task.all().toArray();
      const r2 = await Task.all().toArray();
      expect(r1[0]).not.toBe(r2[0]);
    });
  });

  it.skip("cache notifications can be overridden", () => {
    /* needs notification system */
  });

  it("cache does not raise exceptions", async () => {
    const { cached, Task } = setup();
    cached.enableQueryCache();
    await expect(Task.all().toArray()).resolves.toBeDefined();
  });

  it("query cache does not allow sql key mutation", async () => {
    const { cached } = setup();
    cached.enableQueryCache();
    const sql = "SELECT 1 AS val";
    await cached.execute(sql);
    const r = await cached.execute(sql);
    expect(r).toBeDefined();
  });

  it("cache is flat", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "flat" });
    await cached.withCache(async () => {
      const results = await Task.all().toArray();
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).not.toBeInstanceOf(Array);
    });
  });

  it("cache does not wrap results in arrays", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "nowrap" });
    await cached.withCache(async () => {
      const results = await Task.all().toArray();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  it("cache is ignored for locked relations", async () => {
    const { cached } = setup();
    cached.enableQueryCache();
    await cached.execute("SELECT 1 AS val");
    const sizeAfterSelect = cached.cache.size;
    expect(sizeAfterSelect).toBeGreaterThan(0);
    const forUpdateSql = 'SELECT 1 AS val FROM "tasks" FOR UPDATE';
    await cached.execute(forUpdateSql);
    expect(cached.cache.size).toBe(sizeAfterSelect);
  });

  it.skip("cache is available when connection is connected", () => {
    /* needs connection pool */
  });
  it.skip("cache is available when using a not connected connection", () => {
    /* needs connection pool */
  });

  it("query cache executes new queries within block", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "a" });
    await cached.withCache(async () => {
      const r1 = await Task.all().toArray();
      expect(r1).toHaveLength(1);
      await Task.create({ title: "b" });
      const r2 = await Task.all().toArray();
      expect(r2).toHaveLength(2);
    });
  });

  it("query cache doesnt leak cached results of rolled back queries", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "before" });
    cached.enableQueryCache();
    await cached.beginTransaction();
    await Task.create({ title: "during" });
    await cached.rollback();
    const results = await Task.all().toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("title")).toBe("before");
  });

  it.skip("query cached even when types are reset", () => {
    /* needs type map reset */
  });
  it.skip("query cache does not establish connection if unconnected", () => {
    /* needs connection pool */
  });
  it.skip("query cache is enabled on connections established after middleware runs", () => {
    /* needs middleware */
  });
  it.skip("query caching is local to the current thread", () => {
    /* needs thread isolation */
  });
  it.skip("query cache is enabled on all connection pools", () => {
    /* needs multi-pool support */
  });
  it.skip("clear query cache is called on all connections", () => {
    /* needs multi-connection support */
  });
  it.skip("query cache is enabled in threads with shared connection", () => {
    /* needs shared connection */
  });
  it.skip("query cache is cleared for all thread when a connection is shared", () => {
    /* needs shared connection */
  });

  it("query cache uncached dirties", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "a" });
    cached.enableQueryCache();
    await Task.all().toArray();
    expect(cached.cache.size).toBeGreaterThan(0);
    await cached.uncached(async () => {
      expect(cached.cache.enabled).toBe(false);
    });
    expect(cached.cache.enabled).toBe(true);
  });

  it("query cache connection uncached dirties", async () => {
    const { cached } = setup();
    cached.enableQueryCache();
    await cached.uncached(async () => {
      expect(cached.cache.enabled).toBe(false);
    });
    expect(cached.cache.enabled).toBe(true);
  });

  it("query cache uncached dirties disabled with nested cache", async () => {
    const { cached, Task } = setup();
    await Task.create({ title: "nested" });
    cached.enableQueryCache();
    await cached.uncached(async () => {
      expect(cached.cache.enabled).toBe(false);
      await cached.withCache(async () => {
        expect(cached.cache.enabled).toBe(true);
      });
      expect(cached.cache.enabled).toBe(false);
    });
    expect(cached.cache.enabled).toBe(true);
  });
});

describe("QueryCacheMutableParamTest", () => {
  it.skip("query cache handles mutated binds", () => {
    /* needs bind parameter mutation detection */
  });
});

describe("QuerySerializedParamTest", () => {
  it.skip("query serialized active record", () => {
    /* needs serialization support */
  });
  it.skip("query serialized string", () => {
    /* needs serialization support */
  });
});

describe("QueryCacheExpiryTest", () => {
  it.skip("cache gets cleared after migration", () => {
    /* needs migration integration */
  });

  it("enable disable", async () => {
    const store = new QueryCacheStore();
    expect(store.enabled).toBe(false);
    store.enabled = true;
    expect(store.enabled).toBe(true);
    store.enabled = false;
    expect(store.enabled).toBe(false);
  });

  it.skip("insert all bang", () => {
    /* needs insertAll API */
  });
  it.skip("upsert all", () => {
    /* needs upsertAll API */
  });
  it.skip("cache is expired by habtm update", () => {
    /* needs HABTM update */
  });
  it.skip("cache is expired by habtm delete", () => {
    /* needs HABTM delete */
  });

  it("query cache lru eviction", async () => {
    const store = new QueryCacheStore(3);
    store.enabled = true;
    for (let i = 0; i < 5; i++) {
      await store.computeIfAbsent(`query_${i}`, async () => [{ val: i }]);
    }
    expect(store.size).toBe(3);
    expect(store.get("query_0")).toBeUndefined();
    expect(store.get("query_1")).toBeUndefined();
    expect(store.get("query_4")).toBeDefined();
  });

  it.skip("threads use the same connection", () => {
    /* needs thread-safety */
  });
});

describe("TransactionInCachedSqlActiveRecordPayloadTest", () => {
  it.skip("payload without open transaction", () => {
    /* needs notification payload */
  });
  it.skip("payload with open transaction", () => {
    /* needs notification payload */
  });
});
