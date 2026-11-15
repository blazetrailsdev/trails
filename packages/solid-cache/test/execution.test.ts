import { ActiveSupport, ExecutionWrapper, Notifications } from "@blazetrails/activesupport";
import { assertChanges, assertNoChanges } from "@blazetrails/activesupport/testing/assertions";
import { ActiveRecord, StatementTimeout } from "@blazetrails/activerecord";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolidCache } from "../lib/index.js";
import { useSolidCache, waitForBackgroundTasks } from "./support/test-helper.js";

class ErrorSubscriber {
  readonly errors: [Error, Record<string, unknown>][] = [];

  report(
    error: Error,
    {
      handled,
      severity,
      context,
      source = null,
    }: { handled: boolean; severity: string; context: unknown; source?: string | null },
  ): void {
    this.errors.push([error, { context, handled, level: severity, source }]);
  }
}

describe("SolidCache::ExecutionTest", () => {
  const host = useSolidCache();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("async errors are reported", async () => {
    const cache = host.lookupStore({ expiryBatchSize: 2, shards: null });
    const errorSubscriber = new ErrorSubscriber();
    ActiveSupport.errorReporter.subscribe(errorSubscriber);
    const oldExecutor = SolidCache.executor;
    SolidCache.executor = class extends ExecutionWrapper {};
    try {
      (cache as unknown as { async(block: () => unknown): unknown }).async(() => {
        throw new Error("Boom!");
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(errorSubscriber.errors.length).toBe(1);
      expect(errorSubscriber.errors[0][0].message).toBe("Boom!");
      expect(errorSubscriber.errors[0][1]).toEqual({
        context: {},
        handled: false,
        level: "error",
        source: "application.active_support",
      });
    } finally {
      ActiveSupport.errorReporter.unsubscribe(errorSubscriber);
      SolidCache.executor = oldExecutor;
      host.allStores.splice(0);
    }
  });

  it("active record instrumention instrumented", async () => {
    const instrumentedCache = host.lookupStore();

    let calls = 0;
    const callback = () => {
      calls += 1;
    };
    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await assertChanges(
        () => calls,
        null,
        {},
        () => instrumentedCache.read("foo"),
      );
      await assertChanges(
        () => calls,
        null,
        {},
        () => instrumentedCache.write("foo", "bar"),
      );
    });
  });

  it("active record instrumention uninstrumented", async () => {
    const uninstrumentedCache = host.lookupStore({ activeRecordInstrumentation: false });

    let calls = 0;
    const callback = (...args: unknown[]) => {
      if (/solid_cache_entries/.test(String((args.at(-1) as { sql?: string }).sql))) calls += 1;
    };
    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await assertNoChanges(
        () => calls,
        null,
        {},
        () => uninstrumentedCache.read("foo"),
      );
      await assertNoChanges(
        () => calls,
        null,
        {},
        () => uninstrumentedCache.write("foo", "bar"),
      );
    });
  });

  it("active record instrumention expiry", async () => {
    const instrumentedCache = host.lookupStore({ expiryBatchSize: 2 });
    const uninstrumentedCache = host.lookupStore({
      activeRecordInstrumentation: false,
      expiryBatchSize: 2,
    });
    let calls = 0;
    const sql: unknown[] = [];
    const callback = (...args: unknown[]) => {
      const payloadSql = (args.at(-1) as { sql?: string }).sql;
      sql.push(payloadSql);
      if (/solid_cache_entries/.test(String(payloadSql))) calls += 1;
    };

    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await uninstrumentedCache.write("foo", "bar");
      await uninstrumentedCache.write("foo", "bar");
      await uninstrumentedCache.write("foo", "bar");
      await waitForBackgroundTasks(uninstrumentedCache);

      await assertNoChanges(
        () => calls,
        null,
        {},
        async () => {
          await uninstrumentedCache.write("foo", "bar");
          await uninstrumentedCache.write("foo", "bar");
          await uninstrumentedCache.write("foo", "bar");
          await waitForBackgroundTasks(uninstrumentedCache);
        },
      );
    });

    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await instrumentedCache.write("foo", "bar");
      await instrumentedCache.write("foo", "bar");
      await instrumentedCache.write("foo", "bar");
      await waitForBackgroundTasks(instrumentedCache);

      await assertChanges(
        () => calls,
        null,
        {},
        async () => {
          await instrumentedCache.write("foo", "bar");
          await instrumentedCache.write("foo", "bar");
          await instrumentedCache.write("foo", "bar");
          await waitForBackgroundTasks(instrumentedCache);
        },
      );
    });
  });

  it("no connections uninstrumented", async () => {
    vi.spyOn(
      ActiveRecord.ConnectionAdapters.ConnectionPool.prototype,
      "leaseConnection",
    ).mockRejectedValue(new StatementTimeout());

    const cache = host.lookupStore({ expiresIn: 60, activeRecordInstrumentation: false });

    expect(await cache.write("1", "fsjhgkjfg")).toBeNull();
    expect(await cache.read("1")).toBeNull();
    expect(await cache.increment("1")).toBeNull();
    expect(await cache.decrement("1")).toBeNull();
    expect(await cache.delete("1")).toBe(false);
    expect(await cache.readMulti("1", "2", "3")).toEqual(new Map());
    expect(await cache.writeMulti({ "1": "a", "2": "b", "3": "c" })).toBe(false);
  });

  it("no connections instrumented", async () => {
    vi.spyOn(
      ActiveRecord.ConnectionAdapters.ConnectionPool.prototype,
      "leaseConnection",
    ).mockRejectedValue(new StatementTimeout());

    const cache = host.lookupStore({ expiresIn: 60 });

    expect(await cache.write("1", "fsjhgkjfg")).toBeNull();
    expect(await cache.read("1")).toBeNull();
    expect(await cache.increment("1")).toBeNull();
    expect(await cache.decrement("1")).toBeNull();
    expect(await cache.delete("1")).toBe(false);
    expect(await cache.readMulti("1", "2", "3")).toEqual(new Map());
    expect(await cache.writeMulti({ "1": "a", "2": "b", "3": "c" })).toBe(false);
  });
});
