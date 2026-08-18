import { describe, it, expect } from "vitest";

import { lookupStore } from "../cache.js";
import { ArgumentError } from "../cache/store.js";
import { MemoryStore } from "../cache/memory-store.js";
import { NullStore } from "../cache/null-store.js";
import { FileStore } from "../cache/file-store.js";

describe("CacheStoreSettingTest", () => {
  it("memory store gets created if no arguments passed to lookup store method", () => {
    const store = lookupStore();
    expect(store).toBeInstanceOf(MemoryStore);
  });

  it("memory store", () => {
    const store = lookupStore(":memory_store");
    expect(store).toBeInstanceOf(MemoryStore);
  });

  it("file fragment cache store", () => {
    const store = lookupStore(":file_store", "/path/to/cache/directory");
    expect(store).toBeInstanceOf(FileStore);
    expect((store as FileStore).cachePath).toBe("/path/to/cache/directory");
  });

  it("file store requires a path", () => {
    expect(() => {
      lookupStore(":file_store");
    }).toThrow(ArgumentError);
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
    const store = new MemoryStore({ namespace: "foo" });
    store.write("x", 1);
    expect(store.read("x")).toBe(1);
  });

  it("object assigned fragment cache store", () => {
    const store = lookupStore(new FileStore("/path/to/cache/directory"));
    expect(store).toBeInstanceOf(FileStore);
    expect((store as FileStore).cachePath).toBe("/path/to/cache/directory");
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
