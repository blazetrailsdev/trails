// trails-only extras for the query cache: assertions on the cached
// `sql.active_record` payload shape that Rails' query_cache_test.rb does not
// cover directly, but that
// vendor/rails/activerecord/lib/active_record/connection_adapters/abstract/query_cache.rb:308-314
// specifies — `type_casted_binds` is a lambda (deferred cast) and `name` is
// passed through unchanged.
import { describe, it, expect } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { Base } from "./base.js";
import { Task } from "./test-helpers/models/task.js";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { QueryCache } from "./query-cache.js";

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
    };

    const payload = connection.cacheNotificationInfo("select 1", "Probe", [probe]);
    expect(casts).toBe(0);

    const casted = (payload.type_casted_binds as () => unknown[])();
    expect(casts).toBe(1);
    expect(casted).toEqual([1]);
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
// query-cache-run-returns-enabled-pools-for-complete). Rails' `QueryCache.run`
// returns the pools it enabled and the executor threads that exact list into
// `complete(pools)`, so a pool skipped by `run` is never touched by `complete`.
describe("run returns enabled targets for complete (trails)", () => {
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

  it("run returns only the targets it enabled", () => {
    const enabled = new FakeTarget();
    const configDisabled = new FakeTarget(true);
    const alreadyEnabled = new FakeTarget();
    alreadyEnabled.queryCacheEnabled = true;

    const result = QueryCache.run([enabled, configDisabled, alreadyEnabled]);

    expect(result).toEqual([enabled]);
    expect(enabled.enabledCount).toBe(1);
    expect(configDisabled.enabledCount).toBe(0);
    expect(alreadyEnabled.enabledCount).toBe(0);
  });

  it("complete only disables/clears the pools run enabled", () => {
    const enabled = new FakeTarget();
    const configDisabled = new FakeTarget(true);
    let hook: { run(): void; complete(): void } | null = null;
    QueryCache.installExecutorHooks({ registerHook: (h) => (hook = h) }, () => [
      enabled,
      configDisabled,
    ]);

    hook!.run();
    hook!.complete();

    expect(enabled.disabledCount).toBe(1);
    expect(enabled.clearedCount).toBe(1);
    expect(configDisabled.disabledCount).toBe(0);
    expect(configDisabled.clearedCount).toBe(0);
  });
});
