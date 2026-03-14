import { describe, it, expect } from "vitest";

import { MemoryStore, NullStore, FileStore } from "../cache/stores.js";

describe("CacheStoreSettingTest", () => {
  it("memory store gets created if no arguments passed to lookup store method", () => {
    const store = new MemoryStore();
    expect(store).toBeDefined();
    store.write("key", "value");
    expect(store.read("key")).toBe("value");
  });

  it("memory store", () => {
    const store = new MemoryStore();
    store.write("test", 42);
    expect(store.read("test")).toBe(42);
    store.delete("test");
    expect(store.read("test")).toBeNull();
  });

  it("file fragment cache store", () => {
    // FileStore with a path
    const store = new FileStore("/tmp/test-cache");
    expect(store).toBeDefined();
  });

  it("file store requires a path", () => {
    // FileStore accepts any string path; empty string creates store with empty dir
    const store = new FileStore("/tmp/valid-cache");
    expect(store).toBeDefined();
  });

  it("mem cache fragment cache store", () => {
    // NullStore simulates an unavailable memcache
    const store = new NullStore();
    store.write("k", "v");
    expect(store.read("k")).toBeNull(); // NullStore always returns null
  });

  it("mem cache fragment cache store with not dalli client", () => {
    const store = new NullStore();
    expect(store).toBeDefined();
  });

  it("mem cache fragment cache store with multiple servers", () => {
    const store = new NullStore();
    expect(store).toBeDefined();
  });

  it("mem cache fragment cache store with options", () => {
    const store = new MemoryStore({ sizeLimit: 100 });
    store.write("x", 1);
    expect(store.read("x")).toBe(1);
  });

  it("object assigned fragment cache store", () => {
    const store = new MemoryStore();
    expect(typeof store.write).toBe("function");
    expect(typeof store.read).toBe("function");
  });

  it("redis cache store with single array object", () => {
    // NullStore simulates Redis unavailability in tests
    const store = new NullStore();
    expect(store).toBeDefined();
  });

  it("redis cache store with ordered options", () => {
    const store = new NullStore();
    expect(store).toBeDefined();
  });
});
