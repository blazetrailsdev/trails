import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../memory-store.js";
import { cacheInstrumentationBehavior } from "../behaviors/cache-instrumentation-behavior.js";
import { cacheStoreBehavior } from "../behaviors/cache-store-behavior.js";
import { cacheDeleteMatchedBehavior } from "../behaviors/cache-delete-matched-behavior.js";
import { cacheIncrementDecrementBehavior } from "../behaviors/cache-increment-decrement-behavior.js";
import { cacheStoreCoderBehavior } from "../behaviors/cache-store-coder-behavior.js";
import { cacheStoreCompressionBehavior } from "../behaviors/cache-store-compression-behavior.js";
import { cacheStoreSerializerBehavior } from "../behaviors/cache-store-serializer-behavior.js";
import type { StoreOptions } from "../store.js";
import { Entry } from "../entry.js";
import type { Event } from "../../notifications/instrumenter.js";
import { Notifications } from "../../notifications.js";
import { assert, assertNot, assertSame } from "../../testing/assertions.js";

function withInstrumentation(operation: string, block: () => void): Event[] {
  const eventName = `cache_${operation}.active_support`;
  const events: Event[] = [];
  try {
    Notifications.subscribe(eventName, (event: Event) => events.push(event));
    block();
    return events;
  } finally {
    Notifications.unsubscribe(eventName);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function cachedSizeOf(key: string, value: string): number {
  const probe = new MemoryStore() as unknown as {
    cachedSize(key: string, payload: string): number;
    serializeEntry(entry: Entry): string;
  };
  return probe.cachedSize(key, probe.serializeEntry(new Entry(value, { expiresIn: 60 })));
}

describe("MemoryStoreTest", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ expiresIn: 60 });
  });

  it("increment preserves expiry", async () => {
    const cache = new MemoryStore();
    cache.write("counter", 1, { raw: true, expiresIn: 0.05 });
    expect(cache.read("counter", { raw: true })).toEqual(1);

    await sleep(60);
    expect(cache.read("counter", { raw: true })).toBeNull();

    cache.write("counter", 1, { raw: true, expiresIn: 0.05 });
    cache.increment("counter");
    expect(cache.read("counter", { raw: true })).toEqual(2);
    await sleep(60);
    expect(cache.read("counter", { raw: true })).toBeNull();

    cache.write("counter", 1, { raw: true });
    cache.increment("counter", 1, { expiresIn: 0.05 });
    expect(cache.read("counter", { raw: true })).toEqual(2);
    await sleep(60);
    expect(cache.read("counter2", { raw: true })).toBeNull();
  });

  it("cleanup instrumentation", () => {
    const size = 3;
    for (let i = 0; i < size; i++) store.write(String(i), i);

    const events = withInstrumentation("cleanup", () => {
      store.cleanup();
    });

    expect(events.map((event) => event.name)).toEqual(["cache_cleanup.active_support"]);
    expect(events[0].payload.size).toEqual(size);
    expect(events[0].payload.store).toEqual(store.constructor.name);
  });

  it("nil coder bypasses mutation safeguard", () => {
    const cache = new MemoryStore({ coder: null });
    const value = {};
    cache.write("key", value);

    assertSame(value, cache.read("key"));
  });

  it("namespaced write with unless exist", () => {
    const namespacedCache = new MemoryStore({ expiresIn: 60, namespace: "foo" });

    expect(namespacedCache.write("1", "aaaaaaaaaa")).toEqual(true);
    expect(namespacedCache.write("1", "aaaaaaaaaa", { unlessExist: true })).toEqual(false);
    namespacedCache.write("1", null);
    expect(namespacedCache.write("1", "aaaaaaaaaa", { unlessExist: true })).toEqual(false);
  });

  it("write expired value with unless exist", async () => {
    expect(store.write("1", "aaaa", { expiresIn: 0.05 })).toEqual(true);
    await sleep(60);
    expect(store.write("1", "bbbb", { expiresIn: 0.05, unlessExist: true })).toEqual(true);
  });

  it("write with unless exist", () => {
    expect(store.write("1", "aaaaaaaaaa")).toEqual(true);
    expect(store.write("1", "aaaaaaaaaa", { unlessExist: true })).toEqual(false);
    store.write("1", null);
    expect(store.write("1", "aaaaaaaaaa", { unlessExist: true })).toEqual(false);
  });

  cacheStoreBehavior({ lookupStore: (options?: StoreOptions) => new MemoryStore(options) });

  cacheStoreCoderBehavior({ lookupStore: (options?: StoreOptions) => new MemoryStore(options) });

  cacheStoreCompressionBehavior({
    lookupStore: (options?: StoreOptions) => new MemoryStore(options),
    compressionAlwaysDisabledByDefault: true,
  });

  cacheStoreSerializerBehavior({
    lookupStore: (options?: StoreOptions) => new MemoryStore(options),
  });

  cacheDeleteMatchedBehavior({ lookupStore: (options?: StoreOptions) => new MemoryStore(options) });

  cacheIncrementDecrementBehavior({
    lookupStore: (options?: StoreOptions) => new MemoryStore(options),
  });

  cacheInstrumentationBehavior({
    lookupStore: (options?: StoreOptions) => new MemoryStore(options),
    storeName: "MemoryStore",
  });
});

describe("MemoryStore increment/decrement amount coercion", () => {
  let cache: MemoryStore;

  beforeEach(() => {
    cache = new MemoryStore();
  });

  it("increment raises on a non-integer amount when seeding a missing key", () => {
    expect(() => cache.increment("foo", NaN)).toThrow();
    expect(() => cache.increment("foo", Infinity)).toThrow();
    expect(cache.read("foo")).toBeNull();
  });

  it("decrement raises on a non-integer amount when seeding a missing key", () => {
    expect(() => cache.decrement("foo", NaN)).toThrow();
    expect(() => cache.decrement("foo", Infinity)).toThrow();
    expect(cache.read("foo")).toBeNull();
  });

  it("increment seeds with the integer amount but returns the raw amount", () => {
    expect(cache.increment("frac", 1.5)).toBe(1.5);
    expect(Number(cache.read("frac"))).toBe(1);
  });

  it("increment adds the raw amount on the hit path", () => {
    cache.write("frac", 1, { raw: true });
    expect(cache.increment("frac", 2.5)).toBe(3.5);
  });
});

describe("MemoryStore delete_matched namespacing", () => {
  it("scopes delete_matched to the configured namespace", () => {
    const cache = new MemoryStore({ namespace: "ns" });
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.deleteMatched(/oo/);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
  });
});

describe("MemoryStore increment instrumentation", () => {
  it("instruments with the raw, unnormalized name under a namespace", async () => {
    const store = new MemoryStore({ namespace: "ns" });
    store.write("counter", 0);
    const events: Event[] = [];
    await Notifications.subscribed(
      (event: Event) => events.push(event),
      "cache_increment.active_support",
      () => {
        store.increment("counter");
      },
    );
    expect(events[0].payload.key).toBe("counter");
    expect(store.read("counter")).toBe(1);
  });
});

describe("MemoryStorePruningTest", () => {
  let recordSize: number;
  let store: MemoryStore;

  beforeEach(() => {
    recordSize = cachedSizeOf("1", "aaaaaaaaaa");
    store = new MemoryStore({ expiresIn: 60, size: recordSize * 10 + 1 });
  });

  it("prune size", () => {
    store.write("1", "aaaaaaaaaa");
    store.write("2", "bbbbbbbbbb");
    store.write("3", "cccccccccc");
    store.write("4", "dddddddddd");
    store.write("5", "eeeeeeeeee");
    store.read("2");
    store.read("4");
    store.prune(recordSize * 3);
    assert(store.exist("5"));
    assert(store.exist("4"));
    assertNot(store.exist("3"), "no entry");
    assert(store.exist("2"));
    assertNot(store.exist("1"), "no entry");
  });

  it("prune size on write", () => {
    const values = "abcdefghij";
    for (let i = 1; i <= 10; i++) store.write(String(i), values[i - 1].repeat(10));
    store.read("2");
    store.read("4");
    store.write("11", "llllllllll");
    assert(store.exist("11"));
    assert(store.exist("10"));
    assert(store.exist("9"));
    assert(store.exist("8"));
    assert(store.exist("7"));
    assertNot(store.exist("6"), "no entry");
    assertNot(store.exist("5"), "no entry");
    assert(store.exist("4"));
    assertNot(store.exist("3"), "no entry");
    assert(store.exist("2"));
    assertNot(store.exist("1"), "no entry");
  });

  it("prune size on write based on key length", () => {
    const values = "abcdefghi";
    for (let i = 1; i <= 9; i++) store.write(String(i), values[i - 1].repeat(10));
    const longKey = "*".repeat(2 * recordSize);
    store.write(longKey, "llllllllll");
    assert(store.exist(longKey));
    assert(store.exist("9"));
    assert(store.exist("8"));
    assert(store.exist("7"));
    assert(store.exist("6"));
    assertNot(store.exist("5"), "no entry");
    assertNot(store.exist("4"), "no entry");
    assertNot(store.exist("3"), "no entry");
    assertNot(store.exist("2"), "no entry");
    assertNot(store.exist("1"), "no entry");
  });

  it("pruning is capped at a max time", () => {
    const slow = store as unknown as { deleteEntry(key: string, options: object): boolean };
    const deleteEntry = slow.deleteEntry.bind(store);
    slow.deleteEntry = (key: string, options: object) => {
      const until = Date.now() + 10;
      while (Date.now() < until) {}
      return deleteEntry(key, options);
    };
    store.write("1", "aaaaaaaaaa");
    store.write("2", "bbbbbbbbbb");
    store.write("3", "cccccccccc");
    store.write("4", "dddddddddd");
    store.write("5", "eeeeeeeeee");
    store.prune(30, 0.001);
    assert(store.exist("5"));
    assert(store.exist("4"));
    assert(store.exist("3"));
    assert(store.exist("2"));
    assertNot(store.exist("1"), "no entry");
  });

  it("cache not mutated", () => {
    const item = { foo: "bar" };
    store.write("test_key", item);
    const read = store.read("test_key") as { foo: string };
    read.foo = "xyz";
    expect((store.read("test_key") as { foo: string }).foo).toBe("bar");
  });

  it("cache different object ids hash", () => {
    const item = { foo: "bar" };
    store.write("test_key", item);
    const r1 = store.read("test_key");
    const r2 = store.read("test_key");
    expect(r1).not.toBe(item);
    expect(r1).not.toBe(r2);
  });

  it("cache different object ids string", () => {
    const item = { toS: "my_string" };
    store.write("test_key", item);
    expect(store.read("test_key")).not.toBe(item);
    expect(store.read("test_key")).not.toBe(store.read("test_key"));
  });
});

describe("CacheStoreRaceConditionTtlTest", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("fetch with race condition ttl", async () => {
    store.write("foo", "bar", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 30));
    const result = store.fetch("foo", { raceConditionTtl: 0.2 }, () => "new");
    expect(result).toBe("new");
    expect(store.read("foo")).toBe("new");
  });

  it("fetch with race condition ttl serves stale to concurrent readers", async () => {
    store.write("foo", "stale", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 30));
    let seenDuringRegen: unknown;
    store.fetch("foo", { raceConditionTtl: 0.5 }, () => {
      seenDuringRegen = store.read("foo");
      return "fresh";
    });
    expect(seenDuringRegen).toBe("stale");
    expect(store.read("foo")).toBe("fresh");
  });

  it("fetch without race condition ttl deletes expired entry", async () => {
    store.write("foo", "bar", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 30));
    const result = store.fetch("foo", () => "new");
    expect(result).toBe("new");
  });

  it("race condition ttl beyond window deletes expired entry", async () => {
    store.write("foo", "bar", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 200));
    const result = store.fetch("foo", { raceConditionTtl: 0.05 }, () => "regen");
    expect(result).toBe("regen");
  });

  it("fetch_multi honors entry expiration", async () => {
    store.write("foo", "old", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 40));
    const result = store.fetchMulti("foo", "bar", (key) => `${key}-generated`);
    expect(result).toEqual({ foo: "foo-generated", bar: "bar-generated" });
    expect(store.read("foo")).toBe("foo-generated");
  });

  it("fetch_multi honors version mismatch", () => {
    store.write("foo", "old", { version: "v1" });
    const result = store.fetchMulti("foo", { version: "v2" }, (key) => `${key}-generated`);
    expect(result).toEqual({ foo: "foo-generated" });
  });
});

describe("MemoryStore coder fidelity", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("round-trips Date values", () => {
    const date = new Date("2026-06-19T14:36:26.123Z");
    store.write("d", date);
    const result = store.read("d");
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getTime()).toBe(date.getTime());
  });

  it("round-trips undefined distinct from null", () => {
    store.write("u", undefined);
    expect(store.read("u")).toBeUndefined();
    store.write("n", null);
    expect(store.read("n")).toBeNull();
  });

  it("round-trips bigint values", () => {
    store.write("b", 9007199254740993n);
    expect(store.read("b")).toBe(9007199254740993n);
  });

  it("round-trips non-finite numbers", () => {
    store.write("nan", NaN);
    expect(store.read("nan")).toBeNaN();
    store.write("inf", Infinity);
    expect(store.read("inf")).toBe(Infinity);
  });

  it("deep-clone isolates stored value from later mutation", () => {
    const obj = { nested: { count: 1 } };
    store.write("obj", obj);
    obj.nested.count = 99;
    const result = store.read("obj") as typeof obj;
    expect(result.nested.count).toBe(1);
  });

  it("deep-clone isolates reads from each other", () => {
    store.write("obj", { nested: { count: 1 } });
    const r1 = store.read("obj") as { nested: { count: number } };
    const r2 = store.read("obj") as { nested: { count: number } };
    expect(r1).not.toBe(r2);
    r1.nested.count = 42;
    expect(r2.nested.count).toBe(1);
  });
});
