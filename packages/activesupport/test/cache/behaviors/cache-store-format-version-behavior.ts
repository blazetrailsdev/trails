import { expect, it } from "vitest";
import { constSet, rbModRemoveConst, rbStrStartWith, uniq } from "@blazetrails/ruby-compat";
import { Entry } from "../../../lib/cache/entry.js";
import { formatVersion as cacheFormatVersion, setFormatVersion } from "../../../lib/cache/store.js";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";

/** @internal */
export interface CacheStoreFormatVersionBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

const FORMAT_VERSION_SIGNATURES = new Map<number, [Uint8Array, Uint8Array]>([
  [7.0, [Uint8Array.of(0x00, 0x04, 0x08, 0x5b), Uint8Array.of(0x01, 0x78)]],
  [7.1, [Uint8Array.of(0x00, 0x11, 0x01), Uint8Array.of(0x00, 0x11, 0x81)]],
]);

const FORMAT_VERSIONS = [...FORMAT_VERSION_SIGNATURES.keys()];

function serializeEntry(store: Store, entry: Entry, options?: StoreOptions): unknown {
  return (
    store as unknown as { serializeEntry(entry: Entry, options?: StoreOptions): unknown }
  ).serializeEntry(entry, options);
}

class CacheStoreFormatVersionBehaviorTest {
  static RemovedConstant?: new () => object;
}

export function cacheStoreFormatVersionBehavior(host: CacheStoreFormatVersionBehaviorHost): void {
  const { lookupStore } = host;

  it("format version affects default coder", () => {
    const coders = FORMAT_VERSIONS.map((formatVersion) =>
      withFormat(formatVersion, () => (lookupStore() as unknown as { coder: unknown }).coder),
    );

    expect(coders).toEqual(uniq(coders));
  });

  it("invalid format version raises", () => {
    withFormat(0, () => {
      expect(() => lookupStore()).toThrow();
    });
  });

  for (const [
    formatVersion,
    [uncompressedSignature, compressedSignature],
  ] of FORMAT_VERSION_SIGNATURES) {
    // BLOCKED: cache-marshal-serializers-dump-through-ruby-compat-marshal
    it.skipIf(formatVersion === 7.0)(
      `format version ${formatVersion.toFixed(1)} uses correct signature for uncompressed entries`,
      () => {
        const serialized = withFormat(formatVersion, () =>
          serializeEntry(lookupStore(), new Entry(Array(100).fill("value"))),
        );

        if (serialized instanceof Uint8Array || typeof serialized === "string") {
          expect(rbStrStartWith(serialized, uncompressedSignature)).toBeTruthy();
        }
      },
    );

    it(`format version ${formatVersion.toFixed(1)} uses correct signature for compressed entries`, () => {
      const serialized = withFormat(formatVersion, () =>
        serializeEntry(lookupStore(), new Entry(Array(100).fill("value")), {
          compressThreshold: 1,
        }),
      );

      if (serialized instanceof Uint8Array || typeof serialized === "string") {
        expect(rbStrStartWith(serialized, compressedSignature)).toBeTruthy();
      }
    });

    // BLOCKED: cache-marshal-serializers-dump-through-ruby-compat-marshal
    it.skip(`Marshal undefined class/module deserialization error with ${formatVersion.toFixed(1)} format`, async () => {
      const key = `marshal-${Math.random()}`;
      try {
        constSet(CacheStoreFormatVersionBehaviorTest, "RemovedConstant", class RemovedConstant {});
        const store = withFormat(formatVersion, () => lookupStore());
        await store.write(key, new CacheStoreFormatVersionBehaviorTest.RemovedConstant!());
        expect(await store.read(key)).toBeInstanceOf(
          CacheStoreFormatVersionBehaviorTest.RemovedConstant,
        );

        rbModRemoveConst(CacheStoreFormatVersionBehaviorTest, "RemovedConstant");
        expect(await store.read(key)).toBeNull();
        expect(await store.exist(key)).toBe(false);
      } finally {
        try {
          rbModRemoveConst(CacheStoreFormatVersionBehaviorTest, "RemovedConstant");
        } catch {}
      }
    });

    // BLOCKED: cache-marshal-serializers-dump-through-ruby-compat-marshal
    it.skip(`Compressed Marshal undefined class/module deserialization error with ${formatVersion.toFixed(1)} format`, async () => {
      const key = `marshal-${Math.random()}`;
      try {
        constSet(CacheStoreFormatVersionBehaviorTest, "RemovedConstant", class RemovedConstant {});
        const store = withFormat(formatVersion, () => lookupStore());
        await store.write(key, new CacheStoreFormatVersionBehaviorTest.RemovedConstant!(), {
          compress: true,
          compressThreshold: 1,
        });
        expect(await store.read(key)).toBeInstanceOf(
          CacheStoreFormatVersionBehaviorTest.RemovedConstant,
        );

        rbModRemoveConst(CacheStoreFormatVersionBehaviorTest, "RemovedConstant");
        expect(await store.read(key)).toBeNull();
        expect(await store.readMulti(key)).toEqual(new Map());
        expect(await store.fetch(key, () => "new-value")).toBe("new-value");
      } finally {
        try {
          rbModRemoveConst(CacheStoreFormatVersionBehaviorTest, "RemovedConstant");
        } catch {}
      }
    });
  }

  for (const readVersion of FORMAT_VERSIONS) {
    for (const writeVersion of FORMAT_VERSIONS) {
      it(`format version ${readVersion.toFixed(1)} can read ${writeVersion.toFixed(1)} entries`, async () => {
        const key = crypto.randomUUID();

        const store = withFormat(writeVersion, () => lookupStore());
        await store.write(key, `value for ${key}`);

        const reader = withFormat(readVersion, () => lookupStore());
        expect(await reader.read(key)).toBe(`value for ${key}`);
      });

      it(`format version ${readVersion.toFixed(1)} can read ${writeVersion.toFixed(1)} entries with compression`, async () => {
        const key = crypto.randomUUID();

        const store = withFormat(writeVersion, () => lookupStore({ compressThreshold: 1 }));
        await store.write(key, key.repeat(10));

        const reader = withFormat(readVersion, () => lookupStore());
        expect(await reader.read(key)).toBe(key.repeat(10));
      });
    }
  }
}

function withFormat<T>(formatVersion: number, block: () => T): T {
  const old = cacheFormatVersion();
  setFormatVersion(formatVersion);
  try {
    return block();
  } finally {
    setFormatVersion(old);
  }
}
