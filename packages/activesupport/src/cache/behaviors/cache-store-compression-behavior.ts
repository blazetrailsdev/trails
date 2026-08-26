import { afterEach, beforeEach, expect, it } from "vitest";
import { Entry } from "../entry.js";
import { coder } from "../coder.js";
import { getFormatVersion, setFormatVersion } from "../format-version-slot.js";
import { deflate, inflate } from "../../gzip.js";
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

// Ruby names `Marshal` and `Zlib` directly; trails' equivalents are the
// fidelity coder (cache/coder.ts) framed as a cache coder, and the gzip pair
// `Store#initialize` itself installs as the default `:compressor`.
const MARSHAL_CODER = {
  dump: (entry: Entry): string => coder.dump(entry.pack()),
  load: (payload: string): Entry => Entry.unpack(coder.load(payload) as unknown[]),
};
const ZLIB = { deflate, inflate };

/** @internal */
export interface CompressionBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  /** Mirrors `compression_always_disabled_by_default?` (memory_store_test.rb:94). */
  compressionAlwaysDisabledByDefault?: boolean;
}

export function cacheStoreCompressionBehavior(host: CompressionBehaviorHost): void {
  let cache: Store;

  // Stands in for the including test class's `setup` (`@cache = lookup_store`,
  // e.g. file_store_test.rb:30-32), which the cases that never call
  // `lookup_store` themselves rely on.
  beforeEach(() => {
    cache = host.lookupStore();
  });

  afterEach(() => {
    setFormatVersion(7.0);
  });

  // Ruby `ActiveSupport::Cache.with(format_version:)` (Object#with), which
  // restores the previous value once the block returns.
  function withFormat<T>(formatVersion: number, block: () => T): T {
    const previous = getFormatVersion();
    setFormatVersion(formatVersion);
    try {
      return block();
    } finally {
      setFormatVersion(previous);
    }
  }

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

    // Ruby's payload is a String either way, so `#bytesize` is unambiguous. A JS
    // string carries no encoding, and the two shapes count differently (see
    // Entry#bytesize, entry.rb:60-69): a serializer dump is UTF-8, while a
    // deflated payload is the binary string `gzip.ts` returns, one char per
    // byte. A payload that differs from the uncompressed one is the compressed
    // shape.
    const sizeOf = (payload: unknown, compressed = false): number =>
      payload instanceof Entry
        ? payload.bytesize()
        : compressed
          ? String(payload).length
          : new TextEncoder().encode(String(payload)).length;

    return sizeOf(uncompressed) - sizeOf(actual, actual !== uncompressed);
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

  it("compression works with cache format version 7.0 (using Marshal70WithFallback)", () => {
    cache = withFormat(7.0, () => host.lookupStore({ compress: true }));
    assertCompression(true);
  });

  it("compression works with cache format version >= 7.1 (using Cache::Coder)", () => {
    cache = withFormat(7.1, () => host.lookupStore({ compress: true }));
    assertCompression(true);
  });

  it("compression is disabled with custom coder", () => {
    cache = withFormat(7.1, () => host.lookupStore({ coder: MARSHAL_CODER }));
    assertCompression(false);
  });

  it("compression works with custom serializer", () => {
    cache = withFormat(7.1, () => host.lookupStore({ compress: true, serializer: coder }));
    assertCompression(true);
  });

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

  it("compression ignores nil", () => {
    assertNotCompress(null);
    assertNotCompress(null, { compress: true, compressThreshold: 1 });
  });

  it("compression ignores incompressible data", () => {
    assertNotCompress("", { compress: true, compressThreshold: 1 });
    // Ruby's `[*0..127].pack("C*")`.
    assertNotCompress(Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)).join(""), {
      compress: true,
      compressThreshold: 1,
    });
  });

  it("compressor can be specified", () => {
    const lossyCompressor = {
      deflate(_dumped: string): string {
        return "yolo";
      },
      inflate(compressed: string): string | undefined {
        return compressed === "yolo" ? coder.dump("lossy!") : undefined;
      },
    };

    cache = withFormat(7.1, () =>
      host.lookupStore({ compress: true, compressor: lossyCompressor, serializer: coder }),
    );
    const key = crypto.randomUUID();

    cache.write(key, LARGE_OBJECT);
    expect(cache.read(key)).toBe("lossy!");
  });

  it("compressor can be nil", () => {
    cache = withFormat(7.1, () => host.lookupStore({ compressor: null }));
    assertCompression(false);
  });

  it("specifying a compressor raises when cache format version < 7.1", () => {
    withFormat(7.0, () => {
      expect(() => host.lookupStore({ compressor: ZLIB })).toThrow(/compressor/i);
    });
  });

  it("specifying a compressor raises when also specifying a coder", () => {
    withFormat(7.1, () => {
      expect(() => host.lookupStore({ compressor: ZLIB, coder: MARSHAL_CODER })).toThrow(
        /compressor/i,
      );
    });
  });
}
