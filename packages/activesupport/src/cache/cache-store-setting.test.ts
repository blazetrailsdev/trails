import { describe, it, expect } from "vitest";

import { lookupStore } from "../cache.js";
import { ArgumentError } from "../cache/store.js";
import { MemoryStore } from "../cache/memory-store.js";
import { FileStore } from "../cache/file-store.js";
import { MemCacheStore } from "../cache/mem-cache-store.js";
import { RedisCacheStore } from "../cache/redis-cache-store.js";
import { OrderedOptions } from "../ordered-options.js";
import { TopLevel } from "../namespaces.js";
import { assertCalledWith, assertNotCalled } from "../testing/method-call-assertions.js";

class DalliClient {
  static new(): DalliClient {
    return new DalliClient();
  }
}

class ConnectionPool {
  static new(): ConnectionPool {
    return new ConnectionPool();
  }
}

TopLevel.Dalli = { Client: DalliClient } as never;
TopLevel.ConnectionPool = ConnectionPool as never;

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
    assertCalledWith(DalliClient, "new", [["localhost"], { compress: false }], {}, () => {
      const store = lookupStore(":mem_cache_store", "localhost", { pool: false });
      expect(store).toBeInstanceOf(MemCacheStore);
    });
  });

  it("mem cache fragment cache store with not dalli client", () => {
    assertNotCalled(DalliClient, "new", null, () => {
      const memcache = new (class {})();
      expect(() => {
        lookupStore(":mem_cache_store", memcache);
      }).toThrow(ArgumentError);
    });
  });

  it("mem cache fragment cache store with multiple servers", () => {
    assertCalledWith(
      DalliClient,
      "new",
      [["localhost", "192.168.1.1"], { compress: false }],
      {},
      () => {
        const store = lookupStore(":mem_cache_store", "localhost", "192.168.1.1", { pool: false });
        expect(store).toBeInstanceOf(MemCacheStore);
      },
    );
  });

  it("mem cache fragment cache store with options", () => {
    assertCalledWith(
      DalliClient,
      "new",
      [["localhost", "192.168.1.1"], { timeout: 10, compress: false }],
      {},
      () => {
        const store = lookupStore(":mem_cache_store", "localhost", "192.168.1.1", {
          namespace: "foo",
          timeout: 10,
          pool: false,
        });
        expect(store).toBeInstanceOf(MemCacheStore);
        expect((store as MemCacheStore).options.namespace).toBe("foo");
      },
    );
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
    Object.assign(options, { namespace: "foo" });

    const store = lookupStore(":redis_cache_store", options);
    expect(store).toBeInstanceOf(RedisCacheStore);
    expect((store as RedisCacheStore).options.namespace).toBe("foo");
  });
});
