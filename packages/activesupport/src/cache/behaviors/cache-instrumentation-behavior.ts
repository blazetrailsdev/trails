import { beforeEach, expect, it } from "vitest";
import { Notifications } from "../../notifications.js";
import type { Event } from "../../notifications/instrumenter.js";
import type { Store, StoreOptions } from "../store.js";

// Mirrors Rails `CacheInstrumentationBehavior`
// (activesupport/test/cache/behaviors/cache_instrumentation_behavior.rb).
// Ruby's `include CacheInstrumentationBehavior` is spelled here as a function
// the store test file calls inside its own describe, the trails spelling of a
// test-behavior mixin (see cache-store-compression-behavior.ts).

/** @internal */
export interface CacheInstrumentationBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  /** Ruby reads the store name off `@cache.class.name`. */
  storeName: string;
}

/** @internal */
export function cacheInstrumentationBehavior(host: CacheInstrumentationBehaviorHost): void {
  let cache: Store;

  beforeEach(() => {
    cache = host.lookupStore();
  });

  function withInstrumentation(method: string, block: () => void): Event[] {
    const eventName = `cache_${method}.active_support`;

    const events: Event[] = [];
    try {
      Notifications.subscribe(eventName, (event) => events.push(event));
      block();
      return events;
    } finally {
      Notifications.unsubscribe(eventName);
    }
  }

  function normalizedKey(key: string, options?: StoreOptions): string {
    // Ruby `@cache.send(:normalize_key, key, options)`.
    return (
      cache as unknown as { normalizeKey(key: string, options?: StoreOptions): string }
    ).normalizeKey(key, options);
  }

  it("write multi instrumentation", () => {
    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();
    const value1 = crypto.randomUUID();
    const value2 = crypto.randomUUID();
    const writes = { [key1]: value1, [key2]: value2 };

    const events = withInstrumentation("write_multi", () => {
      cache.writeMulti(writes);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_write_multi.active_support"]);
    expect(events[0].payload.super_operation).toBeUndefined();
    expect(events[0].payload.key).toEqual({
      [normalizedKey(key1)]: value1,
      [normalizedKey(key2)]: value2,
    });
  });

  it("instrumentation with fetch multi as super operation", () => {
    const key1 = crypto.randomUUID();
    cache.write(key1, crypto.randomUUID());

    const key2 = crypto.randomUUID();

    const events = withInstrumentation("read_multi", () => {
      cache.fetchMulti(key2, key1, (key: string) => key + key);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_read_multi.active_support"]);
    expect(events[0].payload.super_operation).toBe("fetch_multi");
    expect(events[0].payload.key).toEqual([normalizedKey(key2), normalizedKey(key1)]);
    expect(events[0].payload.hits).toEqual([normalizedKey(key1)]);
    expect(events[0].payload.store).toBe(host.storeName);
  });

  it("fetch multi instrumentation order of operations", () => {
    const operations: string[] = [];
    const callback = (event: Event): void => {
      operations.push(event.name);
    };

    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();

    const subscription = Notifications.subscribe(
      /^cache_(read_multi|write_multi)\.active_support$/,
      callback,
    );
    try {
      cache.fetchMulti(key1, key2, (key: string) => key + key);
    } finally {
      Notifications.unsubscribe(subscription);
    }

    expect(operations).toEqual([
      "cache_read_multi.active_support",
      "cache_write_multi.active_support",
    ]);
  });

  it("read multi instrumentation", () => {
    const key1 = crypto.randomUUID();
    cache.write(key1, crypto.randomUUID());

    const key2 = crypto.randomUUID();

    const events = withInstrumentation("read_multi", () => {
      cache.readMulti(key2, key1);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_read_multi.active_support"]);
    expect(events[0].payload.key).toEqual([normalizedKey(key2), normalizedKey(key1)]);
    expect(events[0].payload.hits).toEqual([normalizedKey(key1)]);
    expect(events[0].payload.store).toBe(host.storeName);
  });

  it("read instrumentation", () => {
    const key = crypto.randomUUID();
    cache.write(key, crypto.randomUUID());

    const events = withInstrumentation("read", () => {
      cache.read(key);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_read.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey(key));
    expect(events[0].payload.hit).toBe(true);
    expect(events[0].payload.store).toBe(host.storeName);
  });

  it("write instrumentation", () => {
    const key = crypto.randomUUID();

    const events = withInstrumentation("write", () => {
      cache.write(key, crypto.randomUUID());
    });

    expect(events.map((e) => e.name)).toEqual(["cache_write.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey(key));
    expect(events[0].payload.store).toBe(host.storeName);
  });

  it("delete instrumentation", () => {
    const key = crypto.randomUUID();

    const options = { namespace: "foo" };
    const events = withInstrumentation("delete", () => {
      cache.delete(key, options);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_delete.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey(key, options));
    expect(events[0].payload.store).toBe(host.storeName);
    expect(events[0].payload.namespace).toBe("foo");
  });

  it("delete multi instrumentation", () => {
    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();

    const options = { namespace: "foo" };
    const events = withInstrumentation("delete_multi", () => {
      cache.deleteMulti([key2, key1], options);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_delete_multi.active_support"]);
    expect(events[0].payload.key).toEqual([
      normalizedKey(key2, options),
      normalizedKey(key1, options),
    ]);
    expect(events[0].payload.store).toBe(host.storeName);
  });

  it("increment instrumentation", () => {
    const key1 = crypto.randomUUID();
    cache.write(key1, 0);

    const events = withInstrumentation("increment", () => {
      cache.increment(key1);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_increment.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey(key1));
    expect(events[0].payload.store).toBe(host.storeName);
  });

  it("decrement instrumentation", () => {
    const key1 = crypto.randomUUID();
    cache.write(key1, 0);

    const events = withInstrumentation("decrement", () => {
      cache.decrement(key1);
    });

    expect(events.map((e) => e.name)).toEqual(["cache_decrement.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey(key1));
    expect(events[0].payload.store).toBe(host.storeName);
  });
}
