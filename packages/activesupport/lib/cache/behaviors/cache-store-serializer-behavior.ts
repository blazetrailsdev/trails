import { b } from "@blazetrails/ruby-compat";
import { afterEach, expect, it } from "vitest";
import "../../message-pack.js";
import * as Cache from "../../cache.js";
import { UnserializableObjectError } from "../../message-pack/extensions.js";
import type { Store, StoreOptions } from "../store.js";

class UnserializableObject {}

/** @internal */
export interface CacheStoreSerializerBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheStoreSerializerBehavior(host: CacheStoreSerializerBehaviorHost): void {
  afterEach(async () => {
    Cache.setFormatVersion(7.0);
  });

  function withFormat<T>(formatVersion: number, block: () => T): T {
    const previous = Cache.formatVersion();
    Cache.setFormatVersion(formatVersion);
    try {
      return block();
    } finally {
      Cache.setFormatVersion(previous);
    }
  }

  it("serializer can be specified", async () => {
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

    await cache.write(key, 123);
    expect(await cache.read(key)).toEqual(b("Number"));
  });

  it("serializer can be :message_pack", async () => {
    const cache = withFormat(7.1, () => host.lookupStore({ serializer: ":message_pack" }));
    const key = `key${Math.random()}`;

    await cache.write(key, 123);
    expect(await cache.read(key)).toBe(123);

    await expect(cache.write(key, new UnserializableObject())).rejects.toThrow(
      UnserializableObjectError,
    );
  });

  it("specifying a serializer raises when also specifying a coder", async () => {
    withFormat(7.1, () => {
      expect(() => host.lookupStore({ serializer: ":marshal_7_1", coder: null })).toThrow(
        /serializer/i,
      );
    });
  });
}
