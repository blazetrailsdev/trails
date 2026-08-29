import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { itIfSupports } from "./support/supports.js";
import { Base } from "./base.js";
import { Task } from "./test-helpers/models/task.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Category } from "./test-helpers/models/category.js";
import { Post } from "./test-helpers/models/post.js";
import { association } from "./associations.js";
import { Rollback } from "./errors.js";
import { assertQueriesCount, assertNoQueries } from "./testing/query-assertions.js";
import { QueryCache } from "./query-cache.js";
import { Store } from "./connection-adapters/abstract/query-cache.js";
import { LogSubscriber } from "./log-subscriber.js";
import {
  Notifications,
  Logger,
  Executor,
  type NotificationEvent,
} from "@blazetrails/activesupport";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { inMemoryDb } from "./support/adapter-helper.js";

for (const m of [Task, Topic, Category, Post]) registerModel(m as never);

function middleware(app: () => unknown | Promise<unknown>): () => Promise<void> {
  const executor = class extends Executor {};
  QueryCache.installExecutorHooks(executor);
  return async () => {
    const state = executor.runBang();
    try {
      await app();
    } finally {
      state.completeBang();
    }
  };
}

function assertCache(
  state: "off" | "clean" | "dirty",
  pool: ConnectionPool = Base.connectionPool(),
): void {
  switch (state) {
    case "off":
      expect(pool.queryCacheEnabled).toBe(false);
      expect(pool.queryCache.empty).toBe(true);
      break;
    case "clean":
      expect(pool.queryCacheEnabled).toBe(true);
      expect(pool.queryCache.empty).toBe(true);
      break;
    case "dirty":
      expect(pool.queryCacheEnabled).toBe(true);
      expect(pool.queryCache.empty).toBe(false);
      break;
  }
}

function poolQueryCacheMaxSize(pool: ConnectionPool): number | null {
  return (pool as unknown as { _cacheConfig: { _queryCacheMaxSize: number | null } })._cacheConfig
    ._queryCacheMaxSize;
}

function cleanUpConnectionHandler(): void {
  const managers: Map<string, { roleNames: string[]; removeRole(role: string): unknown }> = (
    Base.connectionHandler as unknown as {
      _connectionNameToPoolManager: Map<string, never>;
    }
  )._connectionNameToPoolManager as never;
  for (const [, poolManager] of managers) {
    for (const role of [...poolManager.roleNames]) {
      if (role !== Base.defaultRole) poolManager.removeRole(role);
    }
  }
}

describe("QueryCacheTest", () => {
  fixtures(["tasks", "topics", "categories", "posts", "categoriesPosts"], {
    useTransactionalTests: false,
  });

  afterEach(async () => {
    Task.connectionPool().clearQueryCache();
    Base.connectionPool().disableQueryCacheBang();
    cleanUpConnectionHandler();
  });

  it("execute clear cache", async () => {
    assertCache("off");

    const mw = middleware(async () => {
      await Post.first();
      expect(Base.connectionPool().queryCache.size).toBe(1);
      await (await Post.leaseConnection()).execute("SELECT 1");
      expect(Base.connectionPool().queryCache.size).toBe(0);
    });
    await mw();

    assertCache("off");
  });

  it("exec query clear cache", async () => {
    assertCache("off");

    const mw = middleware(async () => {
      await Post.first();
      expect(Base.connectionPool().queryCache.size).toBe(1);
      await (await Post.leaseConnection()).execQuery("SELECT 1");
      expect(Base.connectionPool().queryCache.size).toBe(0);
    });
    await mw();

    assertCache("off");
  });

  it("writes should always clear cache", async () => {
    assertCache("off");

    const mw = middleware(async () => {
      await Post.first();
      const queryCache = Base.connectionPool().queryCache;
      expect(queryCache.size).toBe(1);
      await Post.uncached(async () => {
        await Post.create({ title: "a new post", body: "and a body" });
      });
      expect(Base.connectionPool().queryCache.size).toBe(0);
    });
    await mw();

    assertCache("off");
  });

  it("reads dont clear disabled cache", async () => {
    assertCache("off");

    const mw = middleware(async () => {
      await Post.first();
      const queryCache = Base.connectionPool().queryCache;
      expect(queryCache.size).toBe(1);
      await Post.uncached(async () => {
        await Post.count();
      });
      expect(Base.connectionPool().queryCache.size).toBe(1);
    });
    await mw();

    assertCache("off");
  });

  it("exceptional middleware clears and disables cache on error", async () => {
    assertCache("off");

    const mw = middleware(async () => {
      await Task.find(1);
      await Task.find(1);
      const queryCache = Base.connectionPool().queryCache;
      expect(queryCache.size).toBe(1);
      throw new Error("lol borked");
    });
    await expect(mw()).rejects.toThrow("lol borked");

    assertCache("off");
  });

  it("query cache is applied to all connections", async () => {
    const dbConfig = Base.connectionPool().dbConfig;
    await Base.connectedTo({ role: "reading" }, async () => {
      await Base.establishConnection(dbConfig);
    });

    const mw = middleware(async () => {
      for (const pool of Base.connectionHandler.connectionPoolList("all")) {
        expect((await pool.leaseConnection()).queryCacheEnabled).toBe(true);
      }
    });

    await mw();
  });

  it("cache is not applied when config is false", async () => {
    const dbConfig = Base.connectionPool().dbConfig;
    await Base.connectedTo({ role: "reading" }, async () => {
      await Base.establishConnection({ ...dbConfig.configurationHash, queryCache: false });
    });

    const mw = middleware(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        assertCache("off");
        expect(poolQueryCacheMaxSize(Base.connectionPool())).toBeNull();
      });
    });

    await mw();
  });

  it("cache is applied when config is string", async () => {
    const dbConfig = Base.connectionPool().dbConfig;
    await Base.connectedTo({ role: "reading" }, async () => {
      await Base.establishConnection({ ...dbConfig.configurationHash, queryCache: "unlimited" });
    });

    const mw = middleware(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        assertCache("clean");
        expect(poolQueryCacheMaxSize(Base.connectionPool())).toBeNull();
      });
    });

    await mw();
  });

  it("cache is applied when config is integer", async () => {
    const dbConfig = Base.connectionPool().dbConfig;
    await Base.connectedTo({ role: "reading" }, async () => {
      await Base.establishConnection({ ...dbConfig.configurationHash, queryCache: 42 });
    });

    const mw = middleware(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        assertCache("clean");
        expect(poolQueryCacheMaxSize(Base.connectionPool())).toBe(42);
      });
    });

    await mw();
  });

  it("cache is applied when config is nil", async () => {
    const dbConfig = Base.connectionPool().dbConfig;
    await Base.connectedTo({ role: "reading" }, async () => {
      await Base.establishConnection({ ...dbConfig.configurationHash, queryCache: null });
    });

    const mw = middleware(async () => {
      await Base.connectedTo({ role: "reading" }, async () => {
        assertCache("clean");
        expect(poolQueryCacheMaxSize(Base.connectionPool())).toBe(100);
      });
    });

    await mw();
  });

  it.skip("query cache with forked processes", () => {
    // PERMANENT-SKIP: Ruby-only (Process.fork) — gvl.
  });
  it.skip("query cache across threads", () => {
    // PERMANENT-SKIP: Ruby-only (Thread) — gvl.
  });

  it("middleware delegates", async () => {
    let called = false;
    const mw = middleware(async () => {
      called = true;
      return [200, {}, null];
    });
    await mw();
    expect(called).toBe(true);
  });

  it("middleware caches", async () => {
    const mw = middleware(async () => {
      await Task.find(1);
      await Task.find(1);
      const queryCache = Base.connectionPool().queryCache;
      expect(queryCache.size).toBe(1);
      return [200, {}, null];
    });
    await mw();
  });

  it("cache enabled during call", async () => {
    assertCache("off");

    const mw = middleware(async () => {
      assertCache("clean");
      return [200, {}, null];
    });
    await mw();
  });

  it("cache passing a relation", async () => {
    const post = await Post.first();
    await Post.cache(async () => {
      const query = association(post as never, "categories").select("post_id");
      const result = await (await Post.leaseConnection()).selectAll(query as never);
      expect(result).toBeDefined();
      expect(typeof result.toArray).toBe("function");
    });
  });

  it("find queries", async () => {
    await assertQueriesCount(2, false, async () => {
      await Task.find(1);
      await Task.find(1);
    });
  });

  it("find queries with cache", async () => {
    await Task.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Task.find(1);
        await Task.find(1);
      });
    });
  });

  it("find queries with cache multi record", async () => {
    await Task.cache(async () => {
      await assertQueriesCount(2, false, async () => {
        await Task.find(1);
        await Task.find(1);
        await Task.find(2);
      });
    });
  });

  it("find queries with multi cache blocks", async () => {
    await Task.cache(async () => {
      await Task.cache(async () => {
        await assertQueriesCount(2, false, async () => {
          await Task.find(1);
          await Task.find(2);
        });
      });
      await assertNoQueries(false, async () => {
        await Task.find(1);
        await Task.find(1);
        await Task.find(2);
      });
    });
  });

  it("count queries with cache", async () => {
    await Task.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Task.count();
        await Task.count();
      });
    });
  });

  it("exists queries with cache", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Post.exists();
        await Post.exists();
      });
    });
  });

  it("select all with cache", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await (await Post.leaseConnection()).selectAll(Post.all() as never);
        await (await Post.leaseConnection()).selectAll(Post.all() as never);
      });
    });
  });

  it("select one with cache", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await (await Post.leaseConnection()).selectOne(Post.all() as never);
        await (await Post.leaseConnection()).selectOne(Post.all() as never);
      });
    });
  });

  it("select value with cache", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await (await Post.leaseConnection()).selectValue(Post.all() as never);
        await (await Post.leaseConnection()).selectValue(Post.all() as never);
      });
    });
  });

  it("select values with cache", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await (await Post.leaseConnection()).selectValues(Post.all() as never);
        await (await Post.leaseConnection()).selectValues(Post.all() as never);
      });
    });
  });

  it("select rows with cache", async () => {
    await Post.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await (await Post.leaseConnection()).selectRows(Post.all() as never);
        await (await Post.leaseConnection()).selectRows(Post.all() as never);
      });
    });
  });

  it("query cache dups results correctly", async () => {
    await Task.cache(async () => {
      const now = new Date().toISOString();
      const task = (await Task.find(1)) as never as { starting: unknown; reload(): Promise<void> };
      expect(task.starting).not.toBe(now);
      task.starting = now;
      await task.reload();
      expect(task.starting).not.toBe(now);
    });
  });

  it("cache notifications can be overridden", async () => {
    const events: NotificationEvent[] = [];
    const sub = Notifications.subscribe("sql.active_record", (e) => events.push(e));

    const connection = (await Base.leaseConnection()) as unknown as {
      cacheNotificationInfo(
        sql: string,
        name: string | null | undefined,
        binds: unknown[],
      ): Record<string, unknown>;
      cache<T>(fn: () => T | Promise<T>): Promise<T>;
      selectAll(sql: string): Promise<unknown>;
    };
    const original = connection.cacheNotificationInfo;
    connection.cacheNotificationInfo = function (sql, name, binds) {
      return { ...original.call(this, sql, name, binds), neat: true };
    };

    try {
      await connection.cache(async () => {
        await connection.selectAll("select 1");
        await connection.selectAll("select 1");
      });
    } finally {
      Notifications.unsubscribe(sub);
      delete (connection as { cacheNotificationInfo?: unknown }).cacheNotificationInfo;
    }

    expect(events[events.length - 1].payload["neat"]).toBe(true);
  });

  it("cache does not raise exceptions", async () => {
    class ShouldNotHaveExceptionsLogger extends LogSubscriber {
      events: NotificationEvent[] = [];
      exception = false;
      override sql(event: NotificationEvent): void {
        this.events.push(event);
        try {
          super.sql(event);
        } catch {
          this.exception = true;
        }
      }
    }

    const savedLogger = Base.logger;
    Base.logger = new Logger({ write: () => {} }) as never;
    const logger = new ShouldNotHaveExceptionsLogger();
    const sub = Notifications.subscribe("sql.active_record", (e) => logger.sql(e));
    try {
      await Base.cache(async () => {
        await assertQueriesCount(1, false, async () => {
          await Task.find(1);
          await Task.find(1);
        });
      });
    } finally {
      Notifications.unsubscribe(sub);
      Base.logger = savedLogger;
    }

    expect(logger.exception).toBe(false);
  });

  it.skip("query cache does not allow sql key mutation", () => {
    // BLOCKED: relies on Ruby FrozenError when a subscriber mutates the frozen
  });

  it("cache is flat", async () => {
    await Task.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Topic.find(1);
        await Topic.find(1);
      });
    });

    await Base.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Task.find(1);
        await Task.find(1);
      });
    });
  });

  it("cache does not wrap results in arrays", async () => {
    await Task.cache(async () => {
      const value = await (
        await Task.leaseConnection()
      ).selectValue("SELECT count(*) AS count_all FROM tasks");
      expect(Number(value)).toBe(2);
    });
  });

  it("cache is ignored for locked relations", async () => {
    const task = (await Task.find(1)) as never as { lockBang(): Promise<unknown> };

    await Task.cache(async () => {
      await assertQueriesCount(2, false, async () => {
        await task.lockBang();
        await task.lockBang();
      });
    });
  });

  it("cache is available when connection is connected", async () => {
    await Task.cache(async () => {
      await assertQueriesCount(1, false, async () => {
        await Task.find(1);
        await Task.find(1);
      });
    });
  });

  it.skipIf(inMemoryDb())("cache is available when using a not connected connection", async () => {
    const dbConfig = Base.connectionDbConfig();
    const originalConnection = Base.removeConnection();

    await Base.establishConnection(dbConfig);
    expect(Task.connectedQ()).toBe(false);

    try {
      await Task.cache(async () => {
        await assertQueriesCount(1, false, async () => {
          await Task.find(1);
        });
        await assertNoQueries(false, async () => {
          await Task.find(1);
        });
      });
    } finally {
      await Base.establishConnection(originalConnection);
    }
  });

  it("query cache executes new queries within block", async () => {
    (await Base.leaseConnection()).enableQueryCacheBang();

    await assertQueriesCount(1, false, async () => {
      expect(await Post.where({ title: "test" }).then((r) => r.length)).toBe(0);
    });

    await assertNoQueries(false, async () => {
      expect(await Post.where({ title: "test" }).then((r) => r.length)).toBe(0);
    });

    await (
      await Base.leaseConnection()
    ).uncached(async () => {
      await assertQueriesCount(1, false, async () => {
        expect(await Post.where({ title: "test" }).then((r) => r.length)).toBe(0);
      });
    });
  });

  it("query cache doesnt leak cached results of rolled back queries", async () => {
    (await Base.leaseConnection()).enableQueryCacheBang();
    const post = await Post.first();

    await Post.transaction(async () => {
      await post!.update({ title: "rollback" });
      expect((await Post.where({ title: "rollback" })).length).toBe(1);
      throw new Rollback();
    });

    expect((await Post.where({ title: "rollback" })).length).toBe(0);

    await (
      await Base.leaseConnection()
    ).uncached(async () => {
      expect((await Post.where({ title: "rollback" })).length).toBe(0);
    });

    try {
      await Post.transaction(async () => {
        await post!.update({ title: "rollback" });
        expect((await Post.where({ title: "rollback" })).length).toBe(1);
        throw new Error("broken");
      });
    } catch {}

    expect((await Post.where({ title: "rollback" })).length).toBe(0);

    await (
      await Base.leaseConnection()
    ).uncached(async () => {
      expect((await Post.where({ title: "rollback" })).length).toBe(0);
    });
  });

  it("query cached even when types are reset", async () => {
    await Task.cache(async () => {
      await Task.find(1);

      (Task as never as { resetColumnInformation(): void }).resetColumnInformation();

      await assertNoQueries(false, async () => {
        await Task.find(1);
      });
    });
  });

  it("query cache does not establish connection if unconnected", async () => {
    const mw = middleware(async () => {});
    await mw();
  });

  it("query cache is enabled on connections established after middleware runs", async () => {
    const mw = middleware(async () => {
      expect((await Base.leaseConnection()).queryCacheEnabled).toBe(true);
    });
    await mw();
    expect((await Base.leaseConnection()).queryCacheEnabled).toBe(false);
  });

  it.skip("query caching is local to the current thread", () => {
    // PERMANENT-SKIP: Ruby-only (Thread) — gvl.
  });

  it("query cache is enabled on all connection pools", async () => {
    const mw = middleware(async () => {
      expect(Base.connectionPool().queryCacheEnabled).toBe(true);
    });
    await mw();
  });

  it.skipIf(inMemoryDb())("clear query cache is called on all connections", async () => {
    const dbConfig = Base.connectionPool().dbConfig;
    await Base.connectedTo({ role: "reading" }, async () => {
      await Base.establishConnection(dbConfig);
    });

    const mw = middleware(async () => {
      let topic: Topic | null = null;
      await Base.connectedTo({ role: "reading" }, async () => {
        topic = await Topic.first();
      });

      expect(topic).not.toBeNull();

      await Base.connectedTo({ role: "writing" }, async () => {
        topic!.title = "Topic title";
        await topic!.save();
      });

      expect(topic!.title).toBe("Topic title");

      await Base.connectedTo({ role: "reading" }, async () => {
        const fresh = await Topic.first();
        expect(fresh!.title).toBe("Topic title");
      });
    });

    await mw();
  });

  it.skip("query cache is enabled in threads with shared connection", () => {
    // PERMANENT-SKIP: Ruby-only (Thread) — gvl.
  });
  it.skip("query cache is cleared for all thread when a connection is shared", () => {
    // PERMANENT-SKIP: Ruby-only (Thread) — gvl.
  });

  it("query cache uncached dirties", async () => {
    const mw = middleware(async () => {
      await Post.first();
      const before = Base.connectionPool().queryCache.size;
      await Post.uncached(
        async () => {
          await Post.create({ title: "a new post", body: "and a body" });
        },
        { dirties: false },
      );
      expect(Base.connectionPool().queryCache.size).toBe(before);

      expect(Base.connectionPool().queryCache.size).toBe(1);
      await Post.uncached(
        async () => {
          await Post.create({ title: "a new post", body: "and a body" });
        },
        { dirties: true },
      );
      expect(Base.connectionPool().queryCache.size).toBe(0);
    });
    await mw();
  });

  it("query cache connection uncached dirties", async () => {
    const mw = middleware(async () => {
      await Post.first();
      const before = Base.connectionPool().queryCache.size;
      await (
        await Post.leaseConnection()
      ).uncached(
        async () => {
          await Post.create({ title: "a new post", body: "and a body" });
        },
        { dirties: false },
      );
      expect(Base.connectionPool().queryCache.size).toBe(before);

      expect(Base.connectionPool().queryCache.size).toBe(1);
      await (
        await Post.leaseConnection()
      ).uncached(
        async () => {
          await Post.create({ title: "a new post", body: "and a body" });
        },
        { dirties: true },
      );
      expect(Base.connectionPool().queryCache.size).toBe(0);
    });
    await mw();
  });

  it("query cache uncached dirties disabled with nested cache", async () => {
    const mw = middleware(async () => {
      await Post.first();
      expect(Base.connectionPool().queryCache.size).toBe(1);
      await Post.uncached(
        async () => {
          await Post.cache(async () => {
            await Post.create({ title: "a new post", body: "and a body" });
          });
        },
        { dirties: false },
      );
      expect(Base.connectionPool().queryCache.size).toBe(0);

      await Post.first();
      expect(Base.connectionPool().queryCache.size).toBe(1);
      await (
        await Post.leaseConnection()
      ).uncached(
        async () => {
          await (
            await Post.leaseConnection()
          ).cache(async () => {
            await Post.create({ title: "a new post", body: "and a body" });
          });
        },
        { dirties: false },
      );
      expect(Base.connectionPool().queryCache.size).toBe(0);
    });
    await mw();
  });
});

describe("QueryCacheMutableParamTest", () => {
  fixtures({}, { useTransactionalTests: false });

  class JsonObj extends Base {
    static {
      this._tableName = "json_objs";
      this.attribute("id", "integer");
      this.attribute("payload", "json");
    }
  }
  registerModel(JsonObj);

  beforeEach(async () => {
    const columnType = Base.connection.typeRegistryKey === "postgres" ? "jsonb" : "json";
    await Base.connection.createTable("json_objs", { force: true }, (t) => {
      (t as unknown as { column(name: string, type: string): void }).column("payload", columnType);
    });
    (await Base.leaseConnection()).enableQueryCacheBang();
  });

  afterEach(async () => {
    (await Base.leaseConnection()).disableQueryCacheBang();
    await Base.connection.dropTable("json_objs", { ifExists: true });
  });

  it("query cache handles mutated binds", async () => {
    await JsonObj.create({ payload: { a: 1 } });

    const search: { a: number; b?: number } = { a: 1 };
    await JsonObj.where({ payload: search }).first();

    search.b = 2;
    expect(await JsonObj.where({ payload: search }).first()).toBeNull();
  });
});

describe("QuerySerializedParamTest", () => {
  it.skip("query serialized active record", () => {
    // BLOCKED: serializes a hash containing an ActiveRecord instance through a
  });

  it.skip("query serialized string", () => {
    // BLOCKED: depends on the Ruby YAML `serialize` coder round-trip used by the
  });
});

describe("QueryCacheExpiryTest", () => {
  fixtures(["tasks", "posts", "categories", "categoriesPosts"]);

  afterEach(async () => {
    (await Task.leaseConnection()).clearQueryCache();
  });

  it("cache gets cleared after migration", async () => {
    await Post.find(1);
    await (await Post.leaseConnection()).changeColumn("posts", "title", "string", { limit: 80 });
    await expect(Post.find(1)).resolves.toBeDefined();
    await (await Post.leaseConnection()).changeColumn("posts", "title", "string");
  });

  async function assertClears(times: number, fn: () => Promise<void>): Promise<void> {
    const store = Base.connectionPool().queryCache as never as { clear(): void };
    const real = store.clear.bind(store);
    let clears = 0;
    store.clear = () => {
      clears++;
      real();
    };
    try {
      await fn();
    } finally {
      store.clear = real;
    }
    expect(clears).toBe(times);
  }

  it("find", async () => {
    await assertClears(1, async () => {
      expect(Task.connectionPool().queryCacheEnabled).toBe(false);
      await Task.cache(async () => {
        expect(Task.connectionPool().queryCacheEnabled).toBe(true);
        await Task.find(1);

        await Task.uncached(async () => {
          expect(Task.connectionPool().queryCacheEnabled).toBe(false);
          await Task.find(1);
        });

        expect(Task.connectionPool().queryCacheEnabled).toBe(true);
      });
      expect(Task.connectionPool().queryCacheEnabled).toBe(false);
    });
  });

  it("enable disable", async () => {
    await assertClears(1, async () => {
      await Task.cache(async () => {});
    });

    await assertClears(1, async () => {
      await Task.cache(async () => {
        await Task.cache(async () => {});
      });
    });
  });

  it("update", async () => {
    await Task.cache(async () => {
      await assertClears(1, async () => {
        const task = (await Task.find(1)) as never as {
          starting: unknown;
          save(): Promise<unknown>;
        };
        task.starting = new Date().toISOString();
        await task.save();
      });
    });
  });

  it("destroy", async () => {
    await Task.cache(async () => {
      await assertClears(1, async () => {
        await ((await Task.find(1)) as never as { destroy(): Promise<unknown> }).destroy();
      });
    });
  });

  it("insert", async () => {
    await Task.cache(async () => {
      await assertClears(1, async () => {
        await Task.create();
      });
    });
  });

  itIfSupports("insert_on_duplicate_skip", "insert all", async () => {
    await Task.cache(async () => {
      await assertClears(1, async () => {
        await Task.insert({ starting: new Date().toISOString() });
      });

      await assertClears(1, async () => {
        await Task.insertAll([{ starting: new Date().toISOString() }]);
      });
    });
  });

  it("insert all bang", async () => {
    await Task.cache(async () => {
      await assertClears(1, async () => {
        await Task.insertBang({ starting: new Date().toISOString() });
      });

      await assertClears(1, async () => {
        await Task.insertAllBang([{ starting: new Date().toISOString() }]);
      });
    });
  });

  itIfSupports("insert_on_duplicate_update", "upsert all", async () => {
    await Task.cache(async () => {
      await assertClears(1, async () => {
        await Task.upsert({ starting: new Date().toISOString() });
      });

      await assertClears(1, async () => {
        await Task.upsertAll([{ starting: new Date().toISOString() }]);
      });
    });
  });

  it("cache is expired by habtm update", async () => {
    await Base.cache(async () => {
      await assertClears(1, async () => {
        const c = await Category.first();
        const p = await Post.first();
        await (
          p as never as { categories: { concat(...c: unknown[]): Promise<unknown> } }
        ).categories.concat(c);
      });
    });
  });

  it("cache is expired by habtm delete", async () => {
    await Base.cache(async () => {
      await assertClears(1, async () => {
        const p = (await Post.find(1)) as never as {
          categories: { count(): Promise<number>; deleteAll(): Promise<unknown> };
        };
        expect(await p.categories.count()).toBeGreaterThan(0);
        await p.categories.deleteAll();
      });
    });
  });

  it("query cache lru eviction", async () => {
    const store = new Store({ value: 0 }, 2);
    store.enabled = true;

    const connection = await Post.leaseConnection();
    const oldStore = connection.queryCache;
    connection.queryCache = store;
    try {
      await Post.cache(async () => {
        await assertQueriesCount(2, false, async () => {
          await connection.selectAll("SELECT 1");
          await connection.selectAll("SELECT 2");
          await connection.selectAll("SELECT 1");
        });

        await assertQueriesCount(1, false, async () => {
          await connection.selectAll("SELECT 3");
          await connection.selectAll("SELECT 3");
        });

        await assertNoQueries(false, async () => {
          await connection.selectAll("SELECT 1");
        });

        await assertQueriesCount(1, false, async () => {
          await connection.selectAll("SELECT 2");
        });
      });
    } finally {
      connection.queryCache = oldStore;
    }
  });

  it.skip("threads use the same connection", () => {
    // PERMANENT-SKIP: Ruby-only (Thread) — gvl.
  });
});

describe("TransactionInCachedSqlActiveRecordPayloadTest", () => {
  fixtures(["tasks"], {
    usesTransaction: ["payload with open transaction"],
  });

  it("payload without open transaction", async () => {
    let asserted = false;
    const sub = Notifications.subscribe("sql.active_record", (e) => {
      const payload = (e as { payload?: { cached?: boolean; transaction?: unknown } }).payload;
      if (payload?.cached) {
        expect(payload.transaction).toBeNull();
        asserted = true;
      }
    });
    try {
      await Task.cache(async () => {
        await Task.count();
        await Task.count();
      });
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(asserted).toBe(true);
  });

  it("payload with open transaction", async () => {
    let asserted = false;
    let expectedTransaction: unknown = null;
    const sub = Notifications.subscribe("sql.active_record", (e) => {
      const payload = (e as { payload?: { cached?: boolean; transaction?: unknown } }).payload;
      if (payload?.cached) {
        expect(payload.transaction).toBe(expectedTransaction);
        asserted = true;
      }
    });
    try {
      await Task.transaction(async (transaction: unknown) => {
        expectedTransaction = transaction;
        await Task.cache(async () => {
          await Task.count();
          await Task.count();
        });
      });
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(asserted).toBe(true);
  });
});
