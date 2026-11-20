import { describe, it, expect } from "vitest";

import { lookupStore } from "../../lib/cache.js";
import { ArgumentError } from "../../lib/cache/store.js";
import { MemoryStore } from "../../lib/cache/memory-store.js";
import { FileStore } from "../../lib/cache/file-store.js";
import { RedisCacheStore } from "../../lib/cache/redis-cache-store.js";
import { OrderedOptions } from "../../lib/ordered-options.js";

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

  it("redis cache store with single array object", () => {
    const cacheStore = [":redis_cache_store", { namespace: "foo" }];

    const store = lookupStore(cacheStore);
    expect(store).toBeInstanceOf(RedisCacheStore);
    expect((store as RedisCacheStore).options.namespace).toBe("foo");
  });

  it("redis cache store with ordered options", () => {
    const options = new OrderedOptions();
    options.update({ namespace: "foo" });

    const store = lookupStore(":redis_cache_store", options);
    expect(store).toBeInstanceOf(RedisCacheStore);
    expect((store as RedisCacheStore).options.namespace).toBe("foo");
  });
});
