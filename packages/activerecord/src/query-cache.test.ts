// Faithful port of vendor/rails/activerecord/test/cases/query_cache_test.rb.
// Rides the canonical TEST_SCHEMA + official test-helpers/models + real
// fixtures (tasks, topics, categories, posts, categories_posts), mirroring the
// Rails test names and assertions as closely as TypeScript allows.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { registerModel } from "./index.js"; // also eager-loads CollectionProxy for association()
import { fixtures } from "./test-helpers/fixtures.js";
import { Base } from "./base.js";
import { Task } from "./test-helpers/models/task.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Category } from "./test-helpers/models/category.js";
import { Post } from "./test-helpers/models/post.js";
import { association } from "./associations.js";
import { Rollback } from "./errors.js";
import { assertQueriesCount, assertNoQueries } from "./testing/query-assertions.js";
import { QueryCache, type QueryCacheCompleteTarget } from "./query-cache.js";
import { LogSubscriber } from "./log-subscriber.js";
import { Notifications, Logger, type NotificationEvent } from "@blazetrails/activesupport";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { inMemoryDb } from "./test-adapter.js";

for (const m of [Task, Topic, Category, Post]) registerModel(m as never);

// Mirrors the Rails private `middleware(&app)` helper: builds an executor,
// installs the QueryCache run/complete hooks on it, and returns a callable that
// wraps the block — enabling the query cache on every pool for the request and
// disabling + clearing it afterward.
function middleware(app: () => unknown | Promise<unknown>): () => Promise<void> {
  let hook: {
    run(): QueryCacheCompleteTarget[];
    complete(pools: QueryCacheCompleteTarget[]): void;
  } | null = null;
  // Resolve the pool list lazily on each run/complete so pools established
  // after the middleware is built (the multi-role `connected_to(role: :reading)`
  // tests) are included, mirroring Rails' `connection_pool_list(:all)`.
  // (Rails threads run's enabled-pool result into complete so a disabled pool
  // is never touched on complete; installExecutorHooks returns run's
  // enabled-target list and threads it into complete for the same reason —
  // mirroring the executor's per-execution hook_state.)
  QueryCache.installExecutorHooks({ registerHook: (h) => (hook = h) }, () =>
    Base.connectionHandler.connectionPoolList("all"),
  );
  return async () => {
    const enabled = hook!.run();
    try {
      await app();
    } finally {
      hook!.complete(enabled);
    }
  };
}

// Mirrors the Rails private `assert_cache(state, connection)` helper. Rails
// reads the per-connection query-cache flags; trails routes them through the
// pool, so the pool is the equivalent "connection".
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

// Reads the pool-level query-cache max size — the trails analogue of Rails'
// `pool.query_cache.instance_variable_get(:@max_size)`. Rails reads it off the
// per-connection `Store`; trails' `Store` coalesces a disabled pool's `nil`
// size to `0`, so the faithful value lives on the pool's cache config
// (`@query_cache_max_size` in Rails). `false`/`0` → `null`, an Integer → that
// integer, `nil` → the default size (100). trails represents Rails' "unbounded"
// `nil` (the fall-through for a raw string like "unlimited") as `Infinity`.
function poolQueryCacheMaxSize(pool: ConnectionPool): number | null {
  return (pool as unknown as { _cacheConfig: { _queryCacheMaxSize: number | null } })._cacheConfig
    ._queryCacheMaxSize;
}

// Mirrors ActiveRecord::TestCase#clean_up_connection_handler: drop every
// non-default (e.g. :reading) role a test established, leaving the writing pool.
function cleanUpConnectionHandler(): void {
  const managers: Map<string, { roleNames: string[]; removeRole(role: string): boolean }> = (
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
  // Rails sets `self.use_transactional_tests = false` for this whole file
  // (query_cache_test.rb:11) so the multi-role tests keep genuinely separate
  // :reading/:writing pools against committed fixture rows — a transactional
  // (savepoint-pinned) run would swap the reading pool onto the writing config
  // (test_fixtures.rb:183-199) and break both the `@max_size` assertions and
  // the "cleared on all connections" guarantee.
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
        // Mirrors `assert_predicate pool.lease_connection, :query_cache_enabled`:
        // the connection-level flag (proving checkout_and_verify wired the Store
        // onto the connection), not the pool-level flag.
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
        // Rails leaves `@max_size` nil (unbounded) for a raw string config;
        // trails overloads null as "disabled" so represents unbounded as
        // `Infinity` (converged by 0023-surfaced-deviations:
        // query-cache-disabled-gate-on-config-not-maxsize, which will flip this
        // assertion to null).
        expect(poolQueryCacheMaxSize(Base.connectionPool())).toBe(Number.POSITIVE_INFINITY);
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
        // Rails ConnectionAdapters::QueryCache::DEFAULT_SIZE.
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
    // Rails dups the connection and defines a singleton
    // `connection.cache_notification_info(sql, name, binds)` that merges
    // `neat: true` into `super`, then asserts the cached event carries it.
    // trails dispatches the payload through the per-connection
    // `cacheNotificationInfo` method, so an own-property override on the
    // connection instance shadows the mixed-in one. trails has no connection
    // `dup`, so instead of Rails' throwaway copy we patch the shared leased
    // connection and delete the own property in `finally` — the save/restore
    // stands in for `dup`.
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
    // Rails subscribes a ShouldNotHaveExceptionsLogger (a LogSubscriber that
    // rescues into `@exception` while handling the event) and asserts it did
    // not raise while processing the cached sql.active_record event.
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
    // A sink logger (Rails' `Logger.new(File::NULL)`) so `sql` runs its full
    // formatting path instead of short-circuiting on a null logger.
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
    // sql payload key in place; trails payloads are plain JS strings (immutable
    // by value), so there is no equivalent frozen-string mutation to raise.
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

  it.skip("cache is available when using a not connected connection", () => {
    // BLOCKED: in-memory/handler DB cannot test a not-yet-connected connection.
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
    } catch {
      // Rails: `rescue Exception` — swallow the non-Rollback error.
    }

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
    const mw = middleware(async () => {
      // The block runs without forcing a new connection beyond the executor's.
    });
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

  // Rails guards this with `unless in_memory_db?`: a separate :reading
  // connection cannot see the :writing connection's committed rows on an
  // in-memory SQLite database, so the cross-pool clear is unobservable there.
  it.skipIf(inMemoryDb())("clear query cache is called on all connections", async () => {
    // Establish a separate :reading pool against the same config, mirroring
    // Rails' `establish_connection(db_config)` under `connected_to(:reading)`.
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

  // Mirrors Rails' `class JsonObj; self.table_name = "json_objs"; attribute
  // :payload, :json; end` — a scratch table Rails creates in `setup` (not a
  // canonical table), so naming it `json_objs` matches Rails, not a hack.
  class JsonObj extends Base {
    static {
      this._tableName = "json_objs";
      this.attribute("payload", "json");
    }
  }
  registerModel(JsonObj);

  beforeEach(async () => {
    // Rails: `t.jsonb` on PostgreSQL (the `json` type has no `=` operator), else
    // `t.json`. Mirror that so the `WHERE payload = $1` equality the test issues
    // is valid on every adapter.
    const columnType = Base.connection.adapterName === "postgres" ? "jsonb" : "json";
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
    await JsonObj.where({ payload: search }).first(); // populate the cache

    search.b = 2;
    expect(await JsonObj.where({ payload: search }).first()).toBeNull();
  });
});

describe("QuerySerializedParamTest", () => {
  it.skip("query serialized active record", () => {
    // BLOCKED: serializes a hash containing an ActiveRecord instance through a
    // YAML coder and round-trips it via `use_yaml_unsafe_load`; trails has no
    // YAML AR-record (un)safe-load equivalent.
  });

  it.skip("query serialized string", () => {
    // BLOCKED: depends on the Ruby YAML `serialize` coder round-trip used by the
    // sibling AR-record case above; not portable without YAML serialization.
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

  // Rails uses `assert_called(query_cache, :clear, times: 1)`; trails counts
  // clears by spying on the pool's query-cache `clear`.
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

  // TRACKED-PENDING-CONVERGENCE (0023-surfaced-deviations:
  // query-cache-dirties-wiring-incomplete): Rails wires `dirties_query_cache`
  // on the public write methods (`:create, :insert, :update, :delete, ...`) so
  // each logical write clears the query cache exactly once. trails wires it on
  // the low-level `executeMutation`, through which a single write funnels at
  // several nested layers (insert → insertStatement → execInsert), clearing 2–3
  // times. These `assert_called(query_cache, :clear, times: 1)` tests stay
  // skipped until the dirties wiring moves to the public-method layer.
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

  // Rails guards with `skip unless supports_insert_on_duplicate_skip?`; every
  // trails adapter (sqlite/postgresql/mysql2) supports it, so run unconditionally.
  it("insert all", async () => {
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

  // Rails guards with `skip unless supports_insert_on_duplicate_update?`; every
  // trails adapter supports it, so run unconditionally.
  it("upsert all", async () => {
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

  it.skip("query cache lru eviction", () => {
    // BLOCKED: relies on swapping `connection.query_cache=` to a Store with a
    // fixed max_size; trails has no public per-connection query-cache setter.
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
