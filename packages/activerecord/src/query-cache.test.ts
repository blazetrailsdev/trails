import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { adapterType, createTestAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { QueryCache, QueryCacheAdapter, QueryCacheStore as Store } from "./query-cache.js";
import { QueryCacheStore as RootQueryCacheStore } from "./index.js";
import { Store as AbstractStore } from "./connection-adapters/abstract/query-cache.js";
import {
  ConnectionPool,
  withExecutionContext,
} from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "./connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "./connection-adapters/pool-config.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "./database-configurations/database-config.js";

function makeMiddleware(
  app: () => Promise<void>,
  adapters: QueryCacheAdapter[],
): () => Promise<void> {
  let hook: { run(): void; complete(): void } | null = null;
  QueryCache.installExecutorHooks(
    {
      registerHook: (h) => {
        hook = h;
      },
    },
    adapters,
  );
  return async () => {
    hook!.run();
    try {
      return await app();
    } finally {
      hook!.complete();
    }
  };
}

function makePoolWithQCache(
  queryCache: DatabaseConfigOptions["queryCache"] | undefined,
): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database: "test.db",
    pool: 2,
    reapingFrequency: null,
    queryCache,
  });
  const pc = new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default");
  return new ConnectionPool(pc);
}

const TEST_SCHEMA = { tasks: { title: "string" } } as const;

async function setup() {
  const inner = createTestAdapter();
  await defineSchema(inner, TEST_SCHEMA);
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
    const { cached, Task } = await setup();
    cached.enableQueryCache();
    await Task.create({ title: "first" });
    expect(cached.cache.empty).toBe(true);
  });

  it("exec query clear cache", async () => {
    const { cached, Task } = await setup();
    cached.enableQueryCache();
    await Task.create({ title: "first" });
    await Task.all().toArray();
    expect(cached.cache.size).toBeGreaterThan(0);
    await Task.create({ title: "second" });
    expect(cached.cache.empty).toBe(true);
  });

  it("writes should always clear cache", async () => {
    const { cached, Task } = await setup();
    cached.enableQueryCache();
    await Task.create({ title: "first" });
    await Task.all().toArray();
    expect(cached.cache.size).toBeGreaterThan(0);
    const t = await Task.first();
    (t as any).title = "updated";
    await (t as any).save();
    expect(cached.cache.empty).toBe(true);
  });

  it("reads dont clear disabled cache", async () => {
    const { cached, Task } = await setup();
    cached.disableQueryCache();
    await Task.create({ title: "first" });
    await Task.all().toArray();
    expect(cached.cache.empty).toBe(true);
  });

  it("exceptional middleware clears and disables cache on error", async () => {
    const { cached, Task } = await setup();
    expect(cached.cache.enabled).toBe(false);
    const mw = makeMiddleware(async () => {
      await Task.create({ title: "row" });
      await Task.all().toArray();
      await Task.all().toArray();
      expect(cached.cache.size).toBeGreaterThan(0);
      throw new Error("lol borked");
    }, [cached]);
    await expect(mw()).rejects.toThrow("lol borked");
    expect(cached.cache.enabled).toBe(false);
    expect(cached.cache.empty).toBe(true);
  });

  it("query cache is applied to all connections", async () => {
    const inner = createTestAdapter();
    const a1 = new QueryCacheAdapter(inner);
    const a2 = new QueryCacheAdapter(inner);
    const mw = makeMiddleware(async () => {
      expect(a1.cache.enabled).toBe(true);
      expect(a2.cache.enabled).toBe(true);
    }, [a1, a2]);
    await mw();
  });

  it("cache is not applied when config is false", () => {
    const pool = makePoolWithQCache(false);
    QueryCache.run([pool]);
    expect(pool.queryCacheEnabled).toBe(false);
    expect(pool.queryCache.empty).toBe(true);
  });

  it("cache is applied when config is string", () => {
    const pool = makePoolWithQCache("unlimited");
    QueryCache.run([pool]);
    expect(pool.queryCacheEnabled).toBe(true);
    expect(pool.queryCache.empty).toBe(true);
    const maxSize = (pool.queryCache as unknown as { _maxSize: number })._maxSize;
    expect(maxSize).toBe(Number.POSITIVE_INFINITY);
  });

  it("cache is applied when config is integer", () => {
    const pool = makePoolWithQCache(42);
    QueryCache.run([pool]);
    expect(pool.queryCacheEnabled).toBe(true);
    const maxSize = (pool.queryCache as unknown as { _maxSize: number })._maxSize;
    expect(maxSize).toBe(42);
  });

  it("cache is applied when config is nil", () => {
    const pool = makePoolWithQCache(null);
    QueryCache.run([pool]);
    expect(pool.queryCacheEnabled).toBe(true);
    expect(pool.queryCache.empty).toBe(true);
  });

  it.skip("query cache with forked processes", () => {
    // BLOCKED: GVL — Ruby threads/fork; candidate for unported-files.ts
  });
  it.skip("query cache across threads", () => {
    // BLOCKED: GVL — Ruby threads/fork; candidate for unported-files.ts
  });

  it("middleware delegates", async () => {
    const { cached } = await setup();
    let called = false;
    const mw = makeMiddleware(async () => {
      called = true;
    }, [cached]);
    await mw();
    expect(called).toBe(true);
  });

  it("middleware caches", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "row" });
    const mw = makeMiddleware(async () => {
      await Task.all().toArray();
      await Task.all().toArray();
      expect(cached.cache.size).toBe(1);
    }, [cached]);
    await mw();
  });

  it("cache enabled during call", async () => {
    const { cached, Task } = await setup();
    expect(cached.cache.enabled).toBe(false);
    await cached.withCache(async () => {
      expect(cached.cache.enabled).toBe(true);
    });
    expect(cached.cache.enabled).toBe(false);
  });

  it("cache passing a relation", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "cached" });
    await cached.withCache(async () => {
      const r1 = await Task.all().toArray();
      const r2 = await Task.all().toArray();
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
    });
  });

  it("find queries", async () => {
    const { cached, Task } = await setup();
    const t = await Task.create({ title: "findme" });
    cached.resetCounters();
    cached.enableQueryCache();
    await Task.find(t.id);
    await Task.find(t.id);
    expect(cached.cache.size).toBeGreaterThan(0);
  });

  it("find queries with cache", async () => {
    const { cached, Task } = await setup();
    const t = await Task.create({ title: "test" });
    await cached.withCache(async () => {
      cached.resetCounters();
      const r1 = await Task.find(t.id);
      const hitsAfterFirst = cached.cacheHits;
      const r2 = await Task.find(t.id);
      expect(r1.title).toBe("test");
      expect(r2.title).toBe("test");
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst);
    });
  });

  it("find queries with cache multi record", async () => {
    const { cached, Task } = await setup();
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
    const { cached, Task } = await setup();
    const t = await Task.create({ title: "test" });
    await cached.withCache(async () => {
      await Task.find(t.id);
    });
    await cached.withCache(async () => {
      await Task.find(t.id);
    });
  });

  it("count queries with cache", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "a" });
    await cached.withCache(async () => {
      const c1 = await Task.count();
      const c2 = await Task.count();
      expect(c1).toBe(1);
      expect(c2).toBe(1);
    });
  });

  it("exists queries with cache", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "a" });
    await cached.withCache(async () => {
      const e1 = await Task.exists();
      const e2 = await Task.exists();
      expect(e1).toBe(true);
      expect(e2).toBe(true);
    });
  });

  it("select all with cache", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "all" });
    await cached.withCache(async () => {
      cached.resetCounters();
      await Task.all().toArray();
      const hitsAfterFirst = cached.cacheHits;
      await Task.all().toArray();
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst);
    });
  });

  it("select one with cache", async () => {
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('sel_one')");
    await cached.withCache(async () => {
      cached.resetCounters();
      const sql = 'SELECT * FROM "tasks" LIMIT 1';
      const r1 = await cached.selectOne(sql);
      const hitsAfterFirst = cached.cacheHits;
      const r2 = await cached.selectOne(sql);
      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst);
    });
  });

  it("select value with cache", async () => {
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('sel_val')");
    await cached.withCache(async () => {
      cached.resetCounters();
      const sql = 'SELECT title FROM "tasks" LIMIT 1';
      const v1 = await cached.selectValue(sql);
      const hitsAfterFirst = cached.cacheHits;
      const v2 = await cached.selectValue(sql);
      expect(v1).toBe("sel_val");
      expect(v2).toBe("sel_val");
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst);
    });
  });

  it("select values with cache", async () => {
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('a')");
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('b')");
    await cached.withCache(async () => {
      cached.resetCounters();
      const sql = 'SELECT title FROM "tasks" ORDER BY title';
      const v1 = await cached.selectValues(sql);
      const hitsAfterFirst = cached.cacheHits;
      const v2 = await cached.selectValues(sql);
      expect(v1).toEqual(["a", "b"]);
      expect(v2).toEqual(["a", "b"]);
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst);
    });
  });

  it("select rows with cache", async () => {
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('row1')");
    await cached.withCache(async () => {
      cached.resetCounters();
      const sql = 'SELECT * FROM "tasks" LIMIT 1';
      const r1 = await cached.selectRows(sql);
      const hitsAfterFirst = cached.cacheHits;
      const r2 = await cached.selectRows(sql);
      expect(Array.isArray(r1[0])).toBe(true);
      expect(r1).toEqual(r2);
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst);
    });
  });

  it("query cache dups results correctly", async () => {
    const { cached } = await setup();
    cached.enableQueryCache();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('dup')");
    const sql = 'SELECT * FROM "tasks"';
    const r1 = await cached.execute(sql);
    const r2 = await cached.execute(sql);
    expect(r1[0]).not.toBe(r2[0]);
    expect(r1[0]).toEqual(r2[0]);
  });

  it("cache notifications can be overridden", async () => {
    // Rails: cached hits emit sql.active_record with cached:true so callers can
    // distinguish cache hits from real queries in instrumentation subscribers.
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('notif')");
    const events: unknown[] = [];
    const { Notifications } = await import("@blazetrails/activesupport");
    const sub = Notifications.subscribe("sql.active_record", (event) => {
      events.push(event);
    });
    const sql = 'SELECT * FROM "tasks"';
    try {
      await cached.withCache(async () => {
        await cached.selectAll(sql);
        await cached.selectAll(sql); // second call → cache hit
      });
    } finally {
      Notifications.unsubscribe(sub);
    }
    // Filter by sql and connection to avoid false positives from concurrent tests
    // (Notifications is a process-global singleton).
    const cachedEvent = (events as any[]).find(
      (e: any) =>
        e?.payload?.cached === true && e?.payload?.sql === sql && e?.payload?.connection === cached,
    );
    expect(cachedEvent).toBeDefined();
  });

  it("cache does not raise exceptions", async () => {
    const { cached, Task } = await setup();
    cached.enableQueryCache();
    await expect(Task.all().toArray()).resolves.toBeDefined();
  });

  it("cache works with prepended sql comments", async () => {
    const { cached } = await setup();
    cached.enableQueryCache();
    const sql = "/*app:MyApp*/ SELECT 1 AS val";
    await cached.execute(sql);
    expect(cached.cache.size).toBeGreaterThan(0);
    cached.resetCounters();
    await cached.execute(sql);
    expect(cached.cacheHits).toBe(1);
  });

  it("query cache does not allow sql key mutation", async () => {
    const { cached } = await setup();
    cached.enableQueryCache();
    const sql = "SELECT 1 AS val";
    await cached.execute(sql);
    const r = await cached.execute(sql);
    expect(r).toBeDefined();
  });

  it("cache is flat", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "flat" });
    await cached.withCache(async () => {
      const results = await Task.all().toArray();
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).not.toBeInstanceOf(Array);
    });
  });

  it("cache does not wrap results in arrays", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "nowrap" });
    await cached.withCache(async () => {
      const results = await Task.all().toArray();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  it.skip("cache is ignored for locked relations", async () => {
    const { cached } = await setup();
    cached.enableQueryCache();
    await cached.execute("SELECT 1 AS val");
    const sizeAfterSelect = cached.cache.size;
    expect(sizeAfterSelect).toBeGreaterThan(0);
    const forUpdateSql = 'SELECT 1 AS val FROM "tasks" FOR UPDATE';
    await cached.execute(forUpdateSql);
    expect(cached.cache.size).toBe(sizeAfterSelect);
  });

  it("cache is available when connection is connected", async () => {
    const { cached, Task } = await setup();
    await Task.create({ title: "row" });
    await cached.withCache(async () => {
      await Task.all().toArray();
      await Task.all().toArray();
      expect(cached.cache.size).toBe(1);
    });
  });
  it.skip("cache is available when using a not connected connection", () => {
    // BLOCKED: in-memory DB cannot test lazy (not-yet-connected) connections
  });

  it("query cache executes new queries within block", async () => {
    const { cached, Task } = await setup();
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
    const { cached, Task } = await setup();
    await Task.create({ title: "before" });
    cached.enableQueryCache();
    await cached.beginTransaction();
    await Task.create({ title: "during" });
    await cached.rollback();
    const results = await Task.all().toArray();
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("before");
  });

  it.skip("query cached even when types are reset", () => {
    // BLOCKED: query-cache — resetColumnInformation not implemented
  });

  it("query cache does not establish connection if unconnected", async () => {
    await withExecutionContext(async () => {
      const pool = makePoolWithQCache(undefined);
      expect(pool.connections).toHaveLength(0);
      pool.enableQueryCacheBang();
      expect(pool.connections).toHaveLength(0);
      pool.disableQueryCacheBang();
      expect(pool.connections).toHaveLength(0);
    });
  });

  it("query cache is enabled on connections established after middleware runs", async () => {
    await withExecutionContext(async () => {
      const pool = makePoolWithQCache(undefined);
      pool.enableQueryCacheBang();
      const conn = pool.checkout();
      expect((conn as unknown as { _queryCache: { enabled: boolean } })._queryCache.enabled).toBe(
        true,
      );
      pool.checkin(conn);
      pool.disableQueryCacheBang();
      const conn2 = pool.checkout();
      expect((conn2 as unknown as { _queryCache: { enabled: boolean } })._queryCache.enabled).toBe(
        false,
      );
      pool.checkin(conn2);
    });
  });

  it.skip("query caching is local to the current thread", () => {
    // BLOCKED: GVL — Ruby threads/fork; candidate for unported-files.ts
  });

  it("query cache is enabled on all connection pools", async () => {
    await withExecutionContext(async () => {
      const p1 = makePoolWithQCache(undefined);
      const p2 = makePoolWithQCache(undefined);
      [p1, p2].forEach((p) => p.enableQueryCacheBang());
      for (const pool of [p1, p2]) {
        expect(pool.queryCacheEnabled).toBe(true);
        const conn = pool.checkout();
        expect((conn as unknown as { _queryCache: { enabled: boolean } })._queryCache.enabled).toBe(
          true,
        );
        pool.checkin(conn);
      }
      [p1, p2].forEach((p) => p.disableQueryCacheBang());
    });
  });

  it("clear query cache is called on all connections", async () => {
    await withExecutionContext(async () => {
      const p1 = makePoolWithQCache(undefined);
      const p2 = makePoolWithQCache(undefined);
      [p1, p2].forEach((p) => p.enableQueryCacheBang());
      const qc1 = p1.queryCache;
      const qc2 = p2.queryCache;
      await qc1.computeIfAbsent("SELECT 1", async () => [{ val: 1 }]);
      await qc2.computeIfAbsent("SELECT 1", async () => [{ val: 1 }]);
      expect(qc1.size).toBe(1);
      expect(qc2.size).toBe(1);
      p1.clearQueryCache();
      p2.clearQueryCache();
      expect(qc1.empty).toBe(true);
      expect(qc2.empty).toBe(true);
    });
  });
  it.skip("query cache is enabled in threads with shared connection", () => {
    // BLOCKED: GVL — Ruby threads/fork; candidate for unported-files.ts
  });
  it.skip("query cache is cleared for all thread when a connection is shared", () => {
    // BLOCKED: GVL — Ruby threads/fork; candidate for unported-files.ts
  });

  it("query cache uncached dirties", async () => {
    const { cached, Task } = await setup();
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
    const { cached } = await setup();
    cached.enableQueryCache();
    await cached.uncached(async () => {
      expect(cached.cache.enabled).toBe(false);
    });
    expect(cached.cache.enabled).toBe(true);
  });

  it("query cache uncached dirties disabled with nested cache", async () => {
    const { cached, Task } = await setup();
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

describe("QueryCacheStore public re-export", () => {
  it("is the same class via both the package root and the query-cache deep import", () => {
    // Guards the re-export + alias surface against regressions: consumers
    // reaching for `QueryCacheStore` from either `@blazetrails/activerecord`
    // or `@blazetrails/activerecord/query-cache.js` should hit the
    // canonical `Store` class in abstract/query-cache.ts.
    expect(Store).toBe(AbstractStore);
    expect(RootQueryCacheStore).toBe(AbstractStore);
  });
});

describe("QueryCacheMutableParamTest", () => {
  it("query cache handles mutated binds", async () => {
    // Rails: mutating a bind array after a query is cached must not corrupt the
    // cached result or produce wrong results on later calls.
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('bind_task')");
    await cached.withCache(async () => {
      cached.resetCounters();
      const binds = ["bind_task"];
      const sql = 'SELECT * FROM "tasks" WHERE title = ?';
      const r1 = await cached.execute(sql, binds);
      expect(r1).toHaveLength(1);
      const hitsAfterFirst = cached.cacheHits;

      // Mutate the original array — this changes the cache key, so the next call
      // must not find a cache hit and must return 0 rows (the mutated value does not exist).
      binds[0] = "nonexistent";
      const r2 = await cached.execute(sql, binds);
      expect(r2).toHaveLength(0);
      expect(cached.cacheHits).toBe(hitsAfterFirst); // no hit — different key

      // Re-query with the original bind value — the previously cached entry must
      // still be intact (mutation did not corrupt it).
      const hitsAfterMutated = cached.cacheHits;
      const r3 = await cached.execute(sql, ["bind_task"]);
      expect(r3).toHaveLength(1);
      expect(r1[0]).toEqual(r3[0]);
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterMutated); // cache hit restored
    });
  });
});

describe("QuerySerializedParamTest", () => {
  it("query serialized active record", async () => {
    // Rails parity: repeated lookups scoped to the same primary-key value
    // produce a cache hit and return identical results. (Rails supports passing
    // an AR record directly via id_for_database; here we use the primitive id,
    // which is the value the ORM ultimately binds for both cases.)
    const { cached, Task } = await setup();
    const t = await Task.create({ title: "serialized_ar" });
    await cached.withCache(async () => {
      cached.resetCounters();
      const r1 = await Task.where({ id: t.id }).toArray();
      expect(r1).toHaveLength(1);
      expect(r1[0]?.id).toBe(t.id);
      const hitsAfterFirst = cached.cacheHits;
      const r2 = await Task.where({ id: t.id }).toArray();
      expect(r2).toHaveLength(1);
      expect(r2[0]?.id).toBe(t.id);
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst); // cache hit
    });
  });

  it("query serialized string", async () => {
    // Verifies that identical string bind values produce identical cache keys —
    // the cache key is derived from value equality, so two separate but equal
    // strings hit the same cache entry.
    const { cached } = await setup();
    await cached.executeMutation("INSERT INTO tasks (title) VALUES ('str_serial')");
    await cached.withCache(async () => {
      cached.resetCounters();
      const sql = 'SELECT * FROM "tasks" WHERE title = ?';
      // Two separately constructed string values with the same content must share a cache key.
      const bind1 = "str_serial";
      const bind2 = `${"str"}_serial`; // constructed separately, same value
      const r1 = await cached.execute(sql, [bind1]);
      expect(r1).toHaveLength(1);
      const hitsAfterFirst = cached.cacheHits;
      const r2 = await cached.execute(sql, [bind2]);
      expect(r2).toHaveLength(1);
      expect(cached.cacheHits).toBeGreaterThan(hitsAfterFirst); // value equality → cache hit
    });
  });
});

describe("QueryCacheExpiryTest", () => {
  it.skipIf(adapterType === "sqlite")("cache gets cleared after migration", async () => {
    const inner = createTestAdapter();
    const cached = new QueryCacheAdapter(inner);
    const { Migration } = await import("./migration.js");
    class SetupMig extends Migration {
      async up() {
        await this.createTable("qc_mig_tasks", (t) => {
          t.string("title");
        });
      }
      async down() {}
    }
    await new SetupMig().run(cached, "up");
    cached.enableQueryCache();
    await cached.execute(`SELECT * FROM ${cached.quoteTableName("qc_mig_tasks")}`);
    expect(cached.cache.size).toBeGreaterThan(0);
    class ChangeMig extends Migration {
      async up() {
        await this.changeColumn("qc_mig_tasks", "title", "text");
      }
      async down() {}
    }
    await new ChangeMig().run(cached, "up");
    expect(cached.cache.empty).toBe(true);
  });

  it("enable disable", async () => {
    const store = new Store();
    expect(store.enabled).toBe(false);
    store.enabled = true;
    expect(store.enabled).toBe(true);
    store.enabled = false;
    expect(store.enabled).toBe(false);
  });

  it.skip("insert all bang", () => {
    // BLOCKED: connection-pool — per-thread query-cache architecture not wired (>300 LOC prereq)
  });
  it.skip("upsert all", () => {
    // BLOCKED: connection-pool — per-thread query-cache architecture not wired (>300 LOC prereq)
  });
  it.skip("cache is expired by habtm update", () => {
    // BLOCKED: connection-pool — per-thread query-cache architecture not wired (>300 LOC prereq)
  });
  it.skip("cache is expired by habtm delete", () => {
    // BLOCKED: connection-pool — per-thread query-cache architecture not wired (>300 LOC prereq)
  });

  it("store checkVersion clears cache on version increment", async () => {
    const version = { value: 0 };
    const store = new Store(version, 10);
    store.enabled = true;
    await store.computeIfAbsent("key1", async () => [{ val: 1 }]);
    expect(store.size).toBe(1);
    version.value++;
    // lazy: cache clears on next access
    expect(store.size).toBe(0);
    expect(store.get("key1")).toBeUndefined();
    await store.computeIfAbsent("key1", async () => [{ val: 2 }]);
    expect(store.size).toBe(1);
  });

  it("query cache lru eviction", async () => {
    const store = new Store(null, 3);
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
    // BLOCKED: GVL — Ruby threads/fork; candidate for unported-files.ts
  });
});

describe("TransactionInCachedSqlActiveRecordPayloadTest", () => {
  it("payload without open transaction", async () => {
    const { cached } = await setup();
    cached.enableQueryCache();
    const sql = "SELECT 1 AS val";
    const events: unknown[] = [];
    const { Notifications } = await import("@blazetrails/activesupport");
    const sub = Notifications.subscribe("sql.active_record", (e) => events.push(e));
    try {
      await cached.execute(sql);
      await cached.execute(sql); // cache hit
    } finally {
      Notifications.unsubscribe(sub);
    }
    const hit = (events as any[]).find(
      (e) =>
        e?.payload?.cached === true && e?.payload?.sql === sql && e?.payload?.connection === cached,
    );
    expect(hit).toBeDefined();
    expect(hit.payload.transaction).toBeNull();
  });

  it("payload with open transaction", async () => {
    const { cached } = await setup();
    cached.enableQueryCache();
    const sql = "SELECT 1 AS val";
    const events: unknown[] = [];
    const { Notifications } = await import("@blazetrails/activesupport");
    const sub = Notifications.subscribe("sql.active_record", (e) => events.push(e));
    try {
      await cached.beginTransaction();
      await cached.execute(sql);
      await cached.execute(sql); // cache hit
      await cached.commit();
    } finally {
      Notifications.unsubscribe(sub);
    }
    const hit = (events as any[]).find(
      (e) =>
        e?.payload?.cached === true && e?.payload?.sql === sql && e?.payload?.connection === cached,
    );
    expect(hit).toBeDefined();
    expect(hit.payload.transaction).not.toBeNull();
  });
});

describe("QueryCache executor hooks", () => {
  it("run enables query cache on all adapters", () => {
    const inner = createTestAdapter();
    const a1 = new QueryCacheAdapter(inner);
    const a2 = new QueryCacheAdapter(inner);
    expect(a1.cache.enabled).toBe(false);
    expect(a2.cache.enabled).toBe(false);
    QueryCache.run([a1, a2]);
    expect(a1.cache.enabled).toBe(true);
    expect(a2.cache.enabled).toBe(true);
  });

  it("run enables query cache on pools, skipping enabled or config-disabled pools", () => {
    const makePool = (enabled: boolean, disabled: boolean) => {
      let calls = 0;
      const pool = {
        queryCacheEnabled: enabled,
        queryCacheDisabled: disabled,
        enableQueryCacheBang() {
          calls++;
        },
        get enableCalls() {
          return calls;
        },
      };
      return pool;
    };
    const fresh = makePool(false, false);
    const alreadyEnabled = makePool(true, false);
    const configDisabled = makePool(false, true);
    QueryCache.run([fresh, alreadyEnabled, configDisabled]);
    expect(fresh.enableCalls).toBe(1);
    expect(alreadyEnabled.enableCalls).toBe(0);
    expect(configDisabled.enableCalls).toBe(0);
  });

  it("complete disables and clears query cache", async () => {
    const inner = createTestAdapter();
    const adapter = new QueryCacheAdapter(inner);
    adapter.enableQueryCache();
    await adapter.cache.computeIfAbsent("SELECT 1", async () => [{ id: 1 }]);
    expect(adapter.cache.size).toBe(1);
    QueryCache.complete([adapter]);
    expect(adapter.cache.enabled).toBe(false);
    expect(adapter.cache.size).toBe(0);
  });

  it("forwards Quoting methods to inner adapter", () => {
    const inner = createTestAdapter();
    const adapter = new QueryCacheAdapter(inner);
    expect(adapter.quoteIdentifier("users")).toBe(
      (inner as unknown as { quoteIdentifier(n: string): string }).quoteIdentifier("users"),
    );
    expect(adapter.quoteTableName("public.users")).toBe(
      (inner as unknown as { quoteTableName(n: string): string }).quoteTableName("public.users"),
    );
    expect(adapter.quoteColumnName("id")).toBe(
      (inner as unknown as { quoteColumnName(n: string): string }).quoteColumnName("id"),
    );
    expect(adapter.quoteDefaultExpression("foo")).toBe(
      (inner as unknown as { quoteDefaultExpression(v: unknown): string }).quoteDefaultExpression(
        "foo",
      ),
    );
    expect(adapter.quoteTableNameForAssignment("posts", "title")).toBe(
      (
        inner as unknown as {
          quoteTableNameForAssignment(t: string, a: string): string;
        }
      ).quoteTableNameForAssignment("posts", "title"),
    );
    expect(adapter.castBoundValue(42)).toBe(
      (inner as unknown as { castBoundValue(v: unknown): unknown }).castBoundValue(42),
    );
    expect(adapter.sanitizeAsSqlComment("/* hello */")).toBe(
      (inner as unknown as { sanitizeAsSqlComment(v: unknown): string }).sanitizeAsSqlComment(
        "/* hello */",
      ),
    );
  });

  it("Quoting forwarders throw a descriptive error when inner does not implement them", () => {
    const stub = { adapterName: "stub" } as unknown as ConstructorParameters<
      typeof QueryCacheAdapter
    >[0];
    const adapter = new QueryCacheAdapter(stub);
    expect(() => adapter.quoteIdentifier("x")).toThrow(/quoteIdentifier/);
    expect(() => adapter.quoteTableName("x")).toThrow(/quoteTableName/);
    expect(() => adapter.quoteColumnName("x")).toThrow(/quoteColumnName/);
    expect(() => adapter.quoteDefaultExpression("x")).toThrow(/quoteDefaultExpression/);
  });

  it("new Quoting forwarders use Rails-default fallbacks when inner lacks them", () => {
    const stub = {
      adapterName: "stub",
      quoteTableName: (n: string) => `"${n}"`,
      quoteColumnName: (n: string) => `"${n}"`,
    } as unknown as ConstructorParameters<typeof QueryCacheAdapter>[0];
    const adapter = new QueryCacheAdapter(stub);
    // castBoundValue: abstract Rails default is identity
    expect(adapter.castBoundValue(99)).toBe(99);
    expect(adapter.castBoundValue("hello")).toBe("hello");
    expect(adapter.castBoundValue(null)).toBeNull();
    // quoteTableNameForAssignment: abstract Rails default is quoteTableName("table.attr")
    // The stub's quoteTableName wraps the full string, yielding "posts.title"
    expect(adapter.quoteTableNameForAssignment("posts", "title")).toBe('"posts.title"');
    // sanitizeAsSqlComment: strips surrounding comment markers, escapes internal ones
    expect(adapter.sanitizeAsSqlComment("/* hint */")).toBe("hint");
    expect(adapter.sanitizeAsSqlComment("safe comment")).toBe("safe comment");
    expect(adapter.sanitizeAsSqlComment("a */ b")).toBe("a * / b");
  });

  it("installExecutorHooks wires run/complete to executor", () => {
    const inner = createTestAdapter();
    const adapter = new QueryCacheAdapter(inner);
    let hook: { run(): void; complete(): void } | null = null;
    const executor = {
      registerHook(h: { run(): void; complete(): void }) {
        hook = h;
      },
    };
    QueryCache.installExecutorHooks(executor, [adapter]);
    expect(hook).not.toBeNull();
    hook!.run();
    expect(adapter.cache.enabled).toBe(true);
    hook!.complete();
    expect(adapter.cache.enabled).toBe(false);
  });
});
