import { describe, it, expect } from "vitest";

import { lookupStore } from "../cache.js";
import { ArgumentError } from "../cache/store.js";
import { MemoryStore } from "../cache/memory-store.js";
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

  it.skip("mem cache fragment cache store", () => {
    // BLOCKED: cache-lookup-store-has-no-mem-cache-or-redis-store
  });

  it.skip("mem cache fragment cache store with not dalli client", () => {
    // BLOCKED: cache-lookup-store-has-no-mem-cache-or-redis-store
  });

  it.skip("mem cache fragment cache store with multiple servers", () => {
    // BLOCKED: cache-lookup-store-has-no-mem-cache-or-redis-store
  });

  it.skip("mem cache fragment cache store with options", () => {
    // BLOCKED: cache-lookup-store-has-no-mem-cache-or-redis-store
  });

  it("object assigned fragment cache store", () => {
    const store = lookupStore(new FileStore("/path/to/cache/directory"));
    expect(store).toBeInstanceOf(FileStore);
    expect((store as FileStore).cachePath).toBe("/path/to/cache/directory");
  });

  it.skip("redis cache store with single array object", () => {
    // BLOCKED: cache-lookup-store-has-no-mem-cache-or-redis-store
  });

  it.skip("redis cache store with ordered options", () => {
    // BLOCKED: cache-lookup-store-has-no-mem-cache-or-redis-store
  });
});
