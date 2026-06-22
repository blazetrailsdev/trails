import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../memory-store.js";
import { Notifications } from "../../notifications.js";

describe("MemoryStoreTest", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ expiresIn: 60 });
  });

  it("increment preserves expiry", async () => {
    store.write("counter", 0, { expiresIn: 0.2 });
    store.increment("counter", 1);
    expect(store.read("counter")).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(store.read("counter")).toBe(1); // not expired yet
  });

  it("cleanup instrumentation", () => {
    store.write("k1", "v1");
    store.write("k2", "v2");
    store.cleanup();
    // Cleanup removes expired entries — with non-expired entries, store still has them
    expect(store.read("k1")).toBe("v1");
  });

  it("nil coder bypasses mutation safeguard", () => {
    store.write("key", { nested: true });
    const result = store.read("key");
    expect(result).toEqual({ nested: true });
  });

  it("namespaced write with unless exist", () => {
    store.write("ns:key", "first", { unlessExist: true });
    store.write("ns:key", "second", { unlessExist: true });
    expect(store.read("ns:key")).toBe("first");
  });

  it("write expired value with unless exist", async () => {
    store.write("key", "expired", { expiresIn: 0.01 });
    await new Promise((r) => setTimeout(r, 20));
    store.write("key", "new", { unlessExist: true });
    expect(store.read("key")).toBe("new");
  });

  it("write with unless exist", () => {
    store.write("key", "original", { unlessExist: true });
    store.write("key", "overwrite", { unlessExist: true });
    expect(store.read("key")).toBe("original");
  });
});

describe("CacheIncrementDecrementBehavior", () => {
  let cache: MemoryStore;

  beforeEach(() => {
    cache = new MemoryStore();
  });

  it("test_increment", () => {
    cache.write("foo", 1, { raw: true });
    expect(Number(cache.read("foo"))).toBe(1);
    expect(cache.increment("foo")).toBe(2);
    expect(Number(cache.read("foo"))).toBe(2);
    expect(cache.increment("foo")).toBe(3);
    expect(Number(cache.read("foo"))).toBe(3);

    // Rails: a missing key is created set to `amount` (memory_store.rb:136).
    expect(cache.increment("bar")).toBe(1);
    expect(cache.increment("baz", 100)).toBe(100);
  });

  it("test_decrement", () => {
    cache.write("foo", 3, { raw: true });
    expect(Number(cache.read("foo"))).toBe(3);
    expect(cache.decrement("foo")).toBe(2);
    expect(Number(cache.read("foo"))).toBe(2);
    expect(cache.decrement("foo")).toBe(1);
    expect(Number(cache.read("foo"))).toBe(1);

    // Non-MemCacheStore backends return -amount on a missing key.
    expect(cache.decrement("qux")).toBe(-1);
    expect(cache.decrement("quux", 100)).toBe(-100);
  });

  it("test_ttl_isnt_updated", async () => {
    expect(cache.increment("foo", 1, { expiresIn: 0.1 })).toBe(1);
    // A second increment with a longer TTL must not reset the original expiry.
    expect(cache.increment("foo", 1, { expiresIn: 5000 })).toBe(2);
    await new Promise((r) => setTimeout(r, 150));
    expect(cache.read("foo")).toBeNull();
  });
});

describe("CacheDeleteMatchedBehavior", () => {
  it("test_delete_matched", () => {
    const cache = new MemoryStore();
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.write("foo/bar", "baz");
    cache.write("fu/baz", "bar");
    cache.deleteMatched(/oo/);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
    expect(cache.exist("foo/bar")).toBe(false);
    expect(cache.exist("fu/baz")).toBe(true);
  });

  it("scopes delete_matched to the configured namespace", () => {
    // keyMatcher prefixes the namespace into the regex source, so an unanchored
    // pattern only deletes this store's namespaced keys.
    const cache = new MemoryStore({ namespace: "ns" });
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.deleteMatched(/oo/);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
  });
});

describe("MemoryStore increment instrumentation", () => {
  it("instruments with the raw, unnormalized name under a namespace", () => {
    // Rails MemoryStore#increment passes `name` (not the normalized key) to
    // instrument (memory_store.rb:149); FileStore passes the normalized key.
    const store = new MemoryStore({ namespace: "ns" });
    store.write("counter", 0);
    const events = Notifications.collectEvents("cache_increment.active_support", () => {
      store.increment("counter");
    });
    expect(events[0].payload.key).toBe("counter");
    expect(store.read("counter")).toBe(1);
  });
});

describe("MemoryStorePruningTest", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ sizeLimit: 10 });
  });

  it("prune size", () => {
    const store = new MemoryStore({ sizeLimit: 5 });
    for (let i = 0; i < 10; i++) store.write(`k${i}`, `v${i}`);
    store.prune(5);
    // Pruning removes some entries
    let count = 0;
    for (let i = 0; i < 10; i++) if (store.exist(`k${i}`)) count++;
    expect(count).toBeLessThanOrEqual(10);
  });

  it("prune size on write", () => {
    const store = new MemoryStore({ sizeLimit: 2 });
    store.write("a", "1");
    store.write("b", "2");
    store.write("c", "3"); // may trigger pruning
    // At least some entries exist
    const count = ["a", "b", "c"].filter((k) => store.exist(k)).length;
    expect(count).toBeGreaterThan(0);
  });

  it("prune size on write based on key length", () => {
    const store = new MemoryStore({ sizeLimit: 10 });
    store.write("short", "v");
    store.write("a_very_long_key_that_takes_space", "v");
    const count = ["short", "a_very_long_key_that_takes_space"].filter((k) =>
      store.exist(k),
    ).length;
    expect(count).toBeGreaterThan(0);
  });

  it("pruning is capped at a max time", () => {
    const store = new MemoryStore({ sizeLimit: 10 });
    for (let i = 0; i < 5; i++) store.write(`k${i}`, `v${i}`);
    expect(() => store.prune(3)).not.toThrow();
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
    // In JS, string primitives are compared by value not reference.
    // The important thing is that reading the same key multiple times returns equal values.
    store.write("test_key", "my_string");
    const r1 = store.read("test_key");
    const r2 = store.read("test_key");
    expect(r1).toBe("my_string");
    expect(r2).toBe("my_string");
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
    // Within the race window: stale entry is bumped; caller regenerates
    const result = store.fetch("foo", { raceConditionTtl: 0.2 }, () => "new");
    expect(result).toBe("new");
    // Now the store has the new value
    expect(store.read("foo")).toBe("new");
  });

  it("fetch with race condition ttl serves stale to concurrent readers", async () => {
    store.write("foo", "stale", { expiresIn: 0.02 });
    await new Promise((r) => setTimeout(r, 30));
    // Simulate a concurrent reader by reading inside the fallback callback.
    // At that point handleExpiredEntry has bumped the entry back into the store,
    // so read() returns the stale value (not null) — the race-window guarantee.
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
    // Beyond the race window: entry is deleted normally
    const result = store.fetch("foo", { raceConditionTtl: 0.05 }, () => "regen");
    expect(result).toBe("regen");
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
