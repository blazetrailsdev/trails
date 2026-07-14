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
    // The cast is deferred: the slot holds the thunk itself, and a subscriber
    // that never reads it never pays for the cast. Calling it yields the same
    // binds the eager cast used to produce.
    const lazy = cached[0].type_casted_binds;
    expect(typeof lazy).toBe("function");
    expect((lazy as () => unknown[])()).toEqual([1]);
    expect((lazy as () => unknown[])()).toEqual([1]);
  });

  it("passes name through unchanged", async () => {
    const payloads = await capture(async () => {
      await Task.cache(async () => {
        await Task.find(1);
        await Task.find(1);
      });
    });

    const cached = payloads.filter((p) => p.cached);
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
