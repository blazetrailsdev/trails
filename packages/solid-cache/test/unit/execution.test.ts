import { ConnectionPool, StatementTimeout } from "@blazetrails/activerecord";
import { ActiveSupport, ExecutionWrapper, Notifications } from "@blazetrails/activesupport";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolidCache } from "../../lib/index.js";
import { useSolidCache, waitForBackgroundTasks } from "../support/test-helper.js";

class ErrorSubscriber {
  readonly errors: [Error, unknown][] = [];

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
      (cache as unknown as { async(block: () => unknown): void }).async(() => {
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
      SolidCache.executor = oldExecutor;
      ActiveSupport.errorReporter.unsubscribe(errorSubscriber);
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
      let before = calls;
      await instrumentedCache.read("foo");
      expect(calls).not.toBe(before);
      before = calls;
      await instrumentedCache.write("foo", "bar");
      expect(calls).not.toBe(before);
    });
  });

  it("active record instrumention uninstrumented", async () => {
    const uninstrumentedCache = host.lookupStore({ activeRecordInstrumentation: false });

    let calls = 0;
    const callback = (...args: unknown[]) => {
      if (/solid_cache_entries/.test((args.at(-1) as { sql: string }).sql)) calls += 1;
    };
    await Notifications.subscribed(callback, "sql.active_record", async () => {
      let before = calls;
      await uninstrumentedCache.read("foo");
      expect(calls).toBe(before);
      before = calls;
      await uninstrumentedCache.write("foo", "bar");
      expect(calls).toBe(before);
    });
  });

  it("active record instrumention expiry", async () => {
    const instrumentedCache = host.lookupStore({ expiryBatchSize: 2 });
    const uninstrumentedCache = host.lookupStore({
      activeRecordInstrumentation: false,
      expiryBatchSize: 2,
    });
    let calls = 0;
    const sql: string[] = [];
    const callback = (...args: unknown[]) => {
      sql.push((args.at(-1) as { sql: string }).sql);
      if (/solid_cache_entries/.test((args.at(-1) as { sql: string }).sql)) calls += 1;
    };
    const writeThrice = async (cache: typeof instrumentedCache) => {
      await cache.write("foo", "bar");
      await cache.write("foo", "bar");
      await cache.write("foo", "bar");
      await waitForBackgroundTasks(cache);
    };

    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await writeThrice(uninstrumentedCache);

      const before = calls;
      await writeThrice(uninstrumentedCache);
      expect(calls).toBe(before);
    });

    await Notifications.subscribed(callback, "sql.active_record", async () => {
      await writeThrice(instrumentedCache);

      const before = calls;
      await writeThrice(instrumentedCache);
      expect(calls).not.toBe(before);
    });
  });

  for (const [name, options] of [
    ["no connections uninstrumented", { activeRecordInstrumentation: false }],
    ["no connections instrumented", {}],
  ] as const) {
    it(name, async () => {
      vi.spyOn(ConnectionPool.prototype, "leaseConnection").mockRejectedValue(
        new StatementTimeout(),
      );

      const cache = host.lookupStore({ expiresIn: 60, ...options });

      expect(await cache.write("1", "fsjhgkjfg")).toBeNull();
      expect(await cache.read("1")).toBeNull();
      expect(await cache.increment("1")).toBeNull();
      expect(await cache.decrement("1")).toBeNull();
      expect(await cache.delete("1")).toBe(false);
      expect(await cache.readMulti("1", "2", "3")).toEqual(new Map());
      expect(await cache.writeMulti({ "1": "a", "2": "b", "3": "c" })).toBe(false);
    });
  }
});
