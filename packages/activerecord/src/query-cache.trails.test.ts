import { describe, it, expect } from "vitest";
import { registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Base } from "./base.js";
import { Task } from "./test-helpers/models/task.js";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { Attribute, Types } from "@blazetrails/activemodel";
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
    expect((lazy as () => unknown[])()).toHaveLength((cached[0].binds ?? []).length);
  });

  it("defers the cast until the slot is read", async () => {
    let casts = 0;
    const countingType = new Types.IntegerType();
    countingType.serialize = (value: unknown) => {
      casts++;
      return value;
    };
    const probe = Attribute.withCastValue("id", 1, countingType);

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

    const cached = payloads.filter((p) => p.cached);
    const uncached = payloads.filter((p) => !p.cached);
    expect(cached.length).toBe(1);
    expect(uncached.length).toBe(1);
    expect(cached[0].name).toBeNull();
    expect(uncached[0].name).toBe(cached[0].name);
  });
});

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
    expect(store.get("a")).toBeUndefined();
    expect(store.get("b")).toEqual([{ key: "b" }]);
    expect(store.get("c")).toEqual([{ key: "c" }]);
  });

  it("a hit refreshes the entry so the shift evicts a colder key", async () => {
    const store = new Store(null, 2);
    store.enabled = true;
    await fill(store, ["a", "b"]);
    await store.computeIfAbsent("a", () => Promise.reject(new Error("miss")));
    await fill(store, ["c"]);
    expect(store.get("a")).toEqual([{ key: "a" }]);
    expect(store.get("b")).toBeUndefined();
  });

  it("a concurrent miss on the same key does not overwrite the stored value", async () => {
    const store = new Store(null, null);
    store.enabled = true;
    let resolveSecond: (rows: Record<string, unknown>[]) => void = () => {};
    const second = new Promise<Record<string, unknown>[]>((resolve) => {
      resolveSecond = resolve;
    });
    const first = store.computeIfAbsent("a", () => Promise.resolve([{ key: "first" }]));
    const later = store.computeIfAbsent("a", () => second);
    await first;
    resolveSecond([{ key: "second" }]);
    expect(await later).toEqual([{ key: "first" }]);
    expect(store.get("a")).toEqual([{ key: "first" }]);
  });
});

describe("schema reflection does not dirty the query cache (trails)", () => {
  fixtures(["tasks"]);

  it("internalExecQuery leaves cached results in place", async () => {
    await Task.cache(async () => {
      await Task.find(1);
      const conn = await Base.leaseConnection();
      const cachedBefore = conn.queryCache?.size ?? 0;
      expect(cachedBefore).toBeGreaterThan(0);

      await conn.columns("tasks");

      expect(conn.queryCache?.size).toBe(cachedBefore);
      await assertNoQueries(false, async () => {
        await Task.find(1);
      });
    });
  });

  it("internalExecQuery bypasses the wrapped execute entirely", async () => {
    const conn = (await Base.leaseConnection()) as unknown as {
      execute: (...a: unknown[]) => unknown;
      internalExecQuery: (sql: string, name?: string | null) => Promise<unknown>;
    };
    const original = conn.execute;
    let executeCalls = 0;
    conn.execute = function (...args: unknown[]) {
      executeCalls++;
      return original.apply(this, args);
    };
    try {
      await conn.internalExecQuery("SELECT 1", "SCHEMA");
    } finally {
      conn.execute = original;
    }
    expect(executeCalls).toBe(0);
  });
});
