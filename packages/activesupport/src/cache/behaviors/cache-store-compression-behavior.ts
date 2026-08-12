import { expect, it } from "vitest";
import { Entry } from "../entry.js";
import type { Store, StoreOptions } from "../store.js";

// Mirrors Rails `CacheStoreCompressionBehavior`
// (activesupport/test/cache/behaviors/cache_store_compression_behavior.rb).
// Ruby's `include CacheStoreCompressionBehavior` is spelled here as a function
// the store test file calls inside its own describe, which is the trails
// spelling of a test-behavior mixin.

// Use strings that are guaranteed to compress well, so we can easily tell if
// the compression kicked in or not.
const SMALL_STRING = "0".repeat(100);
const LARGE_STRING = "0".repeat(2 * 1024);

const SMALL_OBJECT = { data: SMALL_STRING };
const LARGE_OBJECT = { data: LARGE_STRING };

/** @internal */
export interface CompressionBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  /** Mirrors `compression_always_disabled_by_default?` (memory_store_test.rb:94). */
  compressionAlwaysDisabledByDefault?: boolean;
}

/** @internal */
export function cacheStoreCompressionBehavior(host: CompressionBehaviorHost): void {
  let cache: Store;

  function computeEntrySizeReduction(value: unknown, withOptions: StoreOptions = {}): number {
    const entry = new Entry(value);

    // Ruby reaches the private hook with `@cache.send(:serialize_entry, ...)`,
    // and calls `#bytesize` on the payload — a String for `Cache::Coder`, a
    // `Cache::Entry` for `MemoryStore::DupCoder`.
    const send = cache as unknown as {
      serializeEntry(entry: Entry, options: StoreOptions): unknown;
    };
    const uncompressed = send.serializeEntry(entry, { ...withOptions, compress: false });
    const actual = send.serializeEntry(entry, withOptions);

    const sizeOf = (payload: unknown): number =>
      payload instanceof Entry
        ? payload.bytesize()
        : new TextEncoder().encode(String(payload)).length;

    return sizeOf(uncompressed) - sizeOf(actual);
  }

  function assertCompress(value: unknown, withOptions?: StoreOptions): void {
    expect(computeEntrySizeReduction(value, withOptions)).toBeGreaterThan(0);
  }

  function assertNotCompress(value: unknown, withOptions?: StoreOptions): void {
    expect(computeEntrySizeReduction(value, withOptions)).toBe(0);
  }

  function assertCompression(compress: boolean | ":all", withOptions?: StoreOptions): void {
    if (compress === ":all") {
      assertCompress(SMALL_STRING, withOptions);
      assertCompress(SMALL_OBJECT, withOptions);
    } else {
      assertNotCompress(SMALL_STRING, withOptions);
      assertNotCompress(SMALL_OBJECT, withOptions);
    }

    if (compress) {
      assertCompress(LARGE_STRING, withOptions);
      assertCompress(LARGE_OBJECT, withOptions);
    } else {
      assertNotCompress(LARGE_STRING, withOptions);
      assertNotCompress(LARGE_OBJECT, withOptions);
    }
  }

  it("compression by default", () => {
    cache = host.lookupStore();
    assertCompression(!host.compressionAlwaysDisabledByDefault);
  });

  it("compression can be disabled", () => {
    cache = host.lookupStore({ compress: false });
    assertCompression(false);
  });

  it(":compress method option overrides initializer option", () => {
    cache = host.lookupStore({ compress: true });
    assertCompression(false, { compress: false });

    cache = host.lookupStore({ compress: false });
    assertCompression(true, { compress: true });
  });

  it("low :compress_threshold triggers compression", () => {
    cache = host.lookupStore({ compress: true, compressThreshold: 1 });
    assertCompression(":all");
  });

  it("high :compress_threshold inhibits compression", () => {
    cache = host.lookupStore({ compress: true, compressThreshold: 1024 * 1024 });
    assertCompression(false);
  });

  it(":compress_threshold method option overrides initializer option", () => {
    cache = host.lookupStore({ compress: true, compressThreshold: 1 });
    assertCompression(false, { compressThreshold: 1024 * 1024 });

    cache = host.lookupStore({ compress: true, compressThreshold: 1024 * 1024 });
    assertCompression(":all", { compressThreshold: 1 });
  });
}
