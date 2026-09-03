import { afterEach, beforeEach, expect, it } from "vitest";
import { Entry } from "../entry.js";
import { coder } from "../coder.js";
import { getFormatVersion, setFormatVersion } from "../format-version-slot.js";
import { deflate, inflate } from "../../gzip.js";
import type { Store, StoreOptions } from "../store.js";

const SMALL_STRING = "0".repeat(100);
const LARGE_STRING = "0".repeat(2 * 1024);

const SMALL_OBJECT = { data: SMALL_STRING };
const LARGE_OBJECT = { data: LARGE_STRING };

const MARSHAL_CODER = {
  dump: (entry: Entry): string => coder.dump(entry.pack()),
  load: (payload: string): Entry => Entry.unpack(coder.load(payload) as unknown[]),
};
const ZLIB = { deflate, inflate };

/** @internal */
export interface CompressionBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  compressionAlwaysDisabledByDefault?: boolean;
}

export function cacheStoreCompressionBehavior(host: CompressionBehaviorHost): void {
  let cache: Store;

  beforeEach(() => {
    cache = host.lookupStore();
  });

  afterEach(() => {
    setFormatVersion(7.0);
  });

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

    const send = cache as unknown as {
      serializeEntry(entry: Entry, options: StoreOptions): unknown;
    };
    const uncompressed = send.serializeEntry(entry, { ...withOptions, compress: false });
    const actual = send.serializeEntry(entry, withOptions);

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
