import { afterEach, expect, it } from "vitest";
import { getFormatVersion, setFormatVersion } from "../format-version-slot.js";
import { UnserializableObjectError } from "../../message-pack/extensions.js";
import type { Store, StoreOptions } from "../store.js";

// Mirrors Rails `CacheStoreSerializerBehavior`
// (activesupport/test/cache/behaviors/cache_store_serializer_behavior.rb).
// Ruby's `include CacheStoreSerializerBehavior` is spelled here as a function
// the store test file calls inside its own describe, the trails spelling of a
// test-behavior mixin (see cache-store-compression-behavior.ts).

// Ruby writes `Object.new`, which MessagePack has no extension for.
class UnserializableObject {}

/** @internal */
export interface CacheStoreSerializerBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheStoreSerializerBehavior(host: CacheStoreSerializerBehaviorHost): void {
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

  it("serializer can be specified", () => {
    const serializer = {
      dump(value: unknown): string {
        return (value as object).constructor.name;
      },
      load(dumped: string): unknown {
        return dumped;
      },
    };

    const cache = withFormat(7.1, () => host.lookupStore({ serializer }));
    const key = `key${Math.random()}`;

    cache.write(key, 123);
    expect(cache.read(key)).toBe("Number");
  });

  it("serializer can be :message_pack", () => {
    const cache = withFormat(7.1, () => host.lookupStore({ serializer: ":message_pack" }));
    const key = `key${Math.random()}`;

    cache.write(key, 123);
    expect(cache.read(key)).toBe(123);

    expect(() => cache.write(key, new UnserializableObject())).toThrow(UnserializableObjectError);
  });

  it("specifying a serializer raises when also specifying a coder", () => {
    withFormat(7.1, () => {
      expect(() => host.lookupStore({ serializer: ":marshal_7_1", coder: null })).toThrow(
        /serializer/i,
      );
    });
  });
}
