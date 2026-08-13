import { beforeEach, expect, it, vi } from "vitest";
import type { Store, StoreOptions } from "../store.js";

// Mirrors Rails `CacheStoreBehavior`
// (activesupport/test/cache/behaviors/cache_store_behavior.rb) — "the base
// functionality that should be identical across all cache stores". Ruby's
// `include CacheStoreBehavior` is spelled here as a function the store test
// file calls inside its own describe, the trails spelling of a test-behavior
// mixin (see cache-store-compression-behavior.ts).

/** @internal */
export interface CacheStoreBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

/** @internal */
export function cacheStoreBehavior(host: CacheStoreBehaviorHost): void {
  let cache: Store;

  // Stands in for the including test class's `setup` (`@cache = lookup_store`,
  // e.g. memory_store_test.rb:27-29).
  beforeEach(() => {
    cache = host.lookupStore();
  });

  it("should read and write strings", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, "bar")).toBe(true);
    expect(cache.read(key)).toBe("bar");
  });

  it("fetch without cache miss", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    // Ruby `assert_not_called(@cache, :write)`.
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, () => "baz")).toBe("bar");
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with cache miss", () => {
    const key = crypto.randomUUID();
    // Ruby `assert_called_with(@cache, :write, [key, "baz", @cache.options])`.
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, () => "baz")).toBe("baz");
      expect(write).toHaveBeenCalledWith(key, "baz", cache.options);
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with forced cache miss", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    const read = vi.spyOn(cache, "read");
    const write = vi.spyOn(cache, "write");
    try {
      cache.fetch(key, { force: true }, () => "bar");
      expect(read).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith(key, "bar", { ...cache.options, force: true });
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("fetch with cached nil", () => {
    const key = crypto.randomUUID();
    cache.write(key, null);
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, () => "baz")).toBeNull();
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("exist", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    expect(cache.exist(key)).toBe(true);
    expect(cache.exist(crypto.randomUUID())).toBe(false);
  });
}
