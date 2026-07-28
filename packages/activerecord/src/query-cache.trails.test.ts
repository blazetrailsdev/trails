// trails-only extras for the query cache: assertions on the cached
// `sql.active_record` payload shape that Rails' query_cache_test.rb does not
// cover directly, but that
// vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb:308-314
// specifies — `type_casted_binds` is a lambda (deferred cast) and `name` is
// passed through unchanged.
import { describe, it, expect } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Base } from "./base.js";
import { Task } from "./test-helpers/models/task.js";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { QueryCache } from "./query-cache.js";
import { Store } from "./connection-adapters/abstract/query-cache.js";
import { assertNoQueries } from "./testing/query-assertions.js";

registerModel(Task as never);

type SqlPayload = {
  cached?: boolean;
  name?: unknown;
  binds?: unknown[];
  type_casted_binds?: unknown;
};

async function capture(fn: () => Promise<void>): Promise<SqlPayload[]> {
  const payloads: SqlPayload[] = [];
  const sub = Notifications.subscribe("sql.active_record", (e) => {
    payloads.push((e as NotificationEvent & { payload: SqlPayload }).payload);
  });
  try {
    await fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
  return payloads;
}

describe("cacheNotificationInfo payload (trails)", () => {
  fixtures(["tasks"]);

  it("stores type_casted_binds lazily", async () => {
    const payloads = await capture(async () => {
      await Task.cache(async () => {
        await Task.find(1);
        await Task.find(1);
      });
    });

    const cached = payloads.filter((p) => p.cached);
    expect(cached.length).toBe(1);
    const lazy = cached[0].type_casted_binds;
    expect(typeof lazy).toBe("function");
    // Assert the thunk casts the payload's OWN binds rather than hardcoding a
    // value: how many binds a find(1) carries is adapter-dependent and
    // legitimately so — Rails' to_sql_and_binds (database_statements.rb:32-42)
    // leaves binds empty when prepared_statements is off, which is the MySQL
    // default, so the slot is `[]` there and `[1]` on SQLite/PG. The exact cast
    // is pinned by "defers the cast until the slot is read", which supplies its
    // own bind and is adapter-independent.
    expect((lazy as () => unknown[])()).toHaveLength((cached[0].binds ?? []).length);
  });

  it("defers the cast until the slot is read", async () => {
    // A thunk alone does not prove deferral — an eager `(() => alreadyCast)`
    // wrapper is also a function. Drive cacheNotificationInfo with a bind whose
    // valueForDatabase getter counts reads, so the assertion fails if the cast
    // moves back ahead of the slot read (query_cache.rb:311).
    let casts = 0;
    const probe = {
      get valueForDatabase() {
        casts++;
        return 1;
      },
    };

    const connection = (await Base.leaseConnection()) as unknown as {
      cacheNotificationInfo(
        sql: string,
        name: string | null | undefined,
        binds: unknown[],
      ): SqlPayload;
      typeCastedBinds(binds: unknown[]): unknown[];
    };

    const payload = connection.cacheNotificationInfo("select 1", "Probe", [probe]);
    expect(casts).toBe(0);

    const casted = (payload.type_casted_binds as () => unknown[])();
    expect(casts).toBe(1);
    // The slot is filled by the adapter-dispatched `typeCastedBinds`
    // (abstract/quoting.rb:224), so the exact JS type is the adapter's own:
    // SQLite's `type_cast` returns BigInt for whole numbers to force
    // SQLITE_INTEGER binding, while PG/MySQL return the Number. Pin the numeric
    // *value* (adapter-independent) rather than only comparing against
    // `typeCastedBinds` again, which would pass even if the cast were wrong on
    // both sides.
    expect(casted).toHaveLength(1);
    expect(Number(casted[0])).toBe(1);
    expect(casted).toEqual(connection.typeCastedBinds([1]));
  });

  it("passes name through unchanged", async () => {
    const payloads = await capture(async () => {
      await Task.cache(async () => {
        await Task.find(1);
        await Task.find(1);
      });
    });

    const cached = payloads.filter((p) => p.cached);
    expect(cached.length).toBe(1);
    expect(cached[0].name).toBe("Task Load");
  });

  it("does not coerce a nameless query to SQL", async () => {
    const connection = (await Base.leaseConnection()) as unknown as {
      cache<T>(fn: () => T | Promise<T>): Promise<T>;
      selectAll(sql: string): Promise<unknown>;
    };

    const payloads = await capture(async () => {
      await connection.cache(async () => {
        await connection.selectAll("select 1");
        await connection.selectAll("select 1");
      });
    });

    // query_cache.rb:313 is `name: name` — a nameless select_all yields a
    // nameless cached payload, not the "SQL" default that `log`'s signature
    // supplies on the uncached path.
    const cached = payloads.filter((p) => p.cached);
    expect(cached.length).toBe(1);
    expect(cached[0].name).toBeUndefined();
  });
});

// Covers the run→complete pool threading (0023-surfaced-deviations:
// query-cache-run-returns-enabled-pools-for-complete). Ruby's `Array#each`
// returns its receiver, so Rails' `QueryCache.run` returns the whole
// `reject(&:query_cache_enabled)` array — config-disabled pools included — and
// the executor threads that exact list into `complete(pools)`. The point of
// the fix is that `complete` acts on the list *run* observed, not one it
// re-resolves independently.
describe("run returns not-already-enabled targets for complete (trails)", () => {
  class FakeTarget {
    queryCacheEnabled = false;
    disabled: boolean;
    enabledCount = 0;
    disabledCount = 0;
    clearedCount = 0;
    constructor(disabledByConfig = false) {
      this.disabled = disabledByConfig;
    }
    get queryCacheDisabled(): boolean {
      return this.disabled;
    }
    enableQueryCacheBang(): void {
      this.enabledCount++;
      this.queryCacheEnabled = true;
    }
    disableQueryCacheBang(): void {
      this.disabledCount++;
      this.queryCacheEnabled = false;
    }
    clearQueryCache(): void {
      this.clearedCount++;
    }
  }

  it("run returns the not-already-enabled targets without enabling config-disabled ones", () => {
    const enabled = new FakeTarget();
    const configDisabled = new FakeTarget(true);
    const alreadyEnabled = new FakeTarget();
    alreadyEnabled.queryCacheEnabled = true;

    const result = QueryCache.run([enabled, configDisabled, alreadyEnabled]);

    // Mirrors Rails' `reject(&:query_cache_enabled)` receiver: the already
    // enabled pool is dropped, the config-disabled pool stays in the returned
    // list (it is `next`-skipped, not rejected) but is never enabled.
    expect(result).toEqual([enabled, configDisabled]);
    expect(enabled.enabledCount).toBe(1);
    expect(configDisabled.enabledCount).toBe(0);
    expect(alreadyEnabled.enabledCount).toBe(0);
  });

  it("complete disables/clears every target run returned, config-disabled included", () => {
    const enabled = new FakeTarget();
    const configDisabled = new FakeTarget(true);
    let hook: {
      run(): FakeTarget[];
      complete(pools: FakeTarget[]): void;
    } | null = null;
    QueryCache.installExecutorHooks({ registerHook: (h) => (hook = h as never) }, () => [
      enabled,
      configDisabled,
    ]);

    const state = hook!.run();
    hook!.complete(state);

    // Rails threads run's whole receiver into complete, so disable!/clear run
    // on the config-disabled pool too — inert (it was never enabled) but a
    // faithful mirror of query_cache.rb:44-49.
    expect(enabled.disabledCount).toBe(1);
    expect(enabled.clearedCount).toBe(1);
    expect(configDisabled.disabledCount).toBe(1);
    expect(configDisabled.clearedCount).toBe(1);
  });

  it("threads each execution's own run result to its complete", () => {
    // Rails keeps per-execution hook_state and passes run's return to complete
    // as an argument (execution_wrapper.rb:25-37): overlapping/nested executions
    // must not clobber each other's enabled-pool list. Interleave two runs
    // against different pool sets before either completes.
    const outer = new FakeTarget();
    const inner = new FakeTarget();
    let pools: FakeTarget[] = [outer];
    let hook: {
      run(): FakeTarget[];
      complete(pools: FakeTarget[]): void;
    } | null = null;
    QueryCache.installExecutorHooks({ registerHook: (h) => (hook = h as never) }, () => pools);

    const outerState = hook!.run(); // enables outer
    pools = [inner];
    const innerState = hook!.run(); // enables inner
    hook!.complete(innerState);
    hook!.complete(outerState);

    expect(outerState).toEqual([outer]);
    expect(innerState).toEqual([inner]);
    expect(outer.disabledCount).toBe(1);
    expect(inner.disabledCount).toBe(1);
  });
});

// Rails' "query cache lru eviction" test drives `@max_size` through a public
// per-connection setter that trails does not expose (it stays skipped in the
// mirrored file). These construct the Store directly to pin the eviction gate
// `@max_size && @map.size >= @max_size` (query_cache.rb:75): a null max size is
// unbounded (never evicts), an integer caps the map and evicts the oldest.
describe("Store max size eviction gate (trails)", () => {
  const fill = async (store: Store, keys: string[]): Promise<void> => {
    for (const key of keys) {
      await store.computeIfAbsent(key, () => Promise.resolve([{ key }]));
    }
  };

  it("a null max size is unbounded and never evicts", async () => {
    const store = new Store(null, null);
    store.enabled = true;
    await fill(
      store,
      Array.from({ length: 200 }, (_, i) => `k${i}`),
    );
    expect(store.size).toBe(200);
  });

  it("an integer max size caps the map and evicts the oldest entry", async () => {
    const store = new Store(null, 2);
    store.enabled = true;
    await fill(store, ["a", "b", "c"]);
    expect(store.size).toBe(2);
    // "a" was the oldest and gets shifted out; "b"/"c" remain.
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toEqual([{ key: "b" }]);
    expect(store.get("c")).toEqual([{ key: "c" }]);
  });
});

// Rails routes schema reflection through `internal_exec_query`, a method
// `dirties_query_cache` never wraps (database_statements.rb:546-559), so
// reflection structurally cannot evict the cache. trails previously reproduced
// that with a `name === "SCHEMA"` check inside the dirtying wrapper; these pin
// the structural property instead, so re-introducing a name check (or routing
// `schemaQuery` back through the wrapped `execute`) fails here.
describe("schema reflection does not dirty the query cache (trails)", () => {
  fixtures(["tasks"]);

  it("schemaQuery leaves cached results in place", async () => {
    await Task.cache(async () => {
      await Task.find(1);
      const conn = await Base.leaseConnection();
      const cachedBefore = conn.queryCache?.size ?? 0;
      expect(cachedBefore).toBeGreaterThan(0);

      // A real reflection call, through the same public API every adapter's
      // schema statements use — portable across sqlite3/postgresql/mysql2.
      await conn.columns("tasks");

      expect(conn.queryCache?.size).toBe(cachedBefore);
      await assertNoQueries(false, async () => {
        await Task.find(1);
      });
    });
  });

  it("schemaQuery bypasses the wrapped execute entirely", async () => {
    const conn = (await Base.leaseConnection()) as unknown as {
      execute: (...a: unknown[]) => unknown;
      schemaQuery: (sql: string) => Promise<unknown>;
    };
    const original = conn.execute;
    let executeCalls = 0;
    conn.execute = function (...args: unknown[]) {
      executeCalls++;
      return original.apply(this, args);
    };
    try {
      await conn.schemaQuery("SELECT 1");
    } finally {
      conn.execute = original;
    }
    expect(executeCalls).toBe(0);
  });
});
