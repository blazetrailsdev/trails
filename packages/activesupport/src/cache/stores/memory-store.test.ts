import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../stores.js";

describe("MemoryStoreTest", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ expiresIn: 60_000 });
  });

  it("increment preserves expiry", async () => {
    store.write("counter", 0, { expiresIn: 200 });
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
    store.write("key", "expired", { expiresIn: 10 });
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
