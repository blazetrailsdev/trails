import { cacheInstrumentationBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-instrumentation-behavior";
import { cacheLoggingBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-logging-behavior";
import { cacheStoreCompressionBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-compression-behavior";
import { cacheStoreFormatVersionBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-format-version-behavior";
import { cacheIncrementDecrementBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-increment-decrement-behavior";
import { cacheStoreBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-behavior";
import { cacheStoreCoderBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-coder-behavior";
import { cacheStoreVersionBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-version-behavior";
import { describe, expect, it } from "vitest";
import { useSolidCache } from "../support/test-helper.js";

describe("SolidCacheTest", () => {
  const host = useSolidCache();

  cacheStoreBehavior(host);
  cacheStoreVersionBehavior(host);
  cacheStoreCoderBehavior(host);
  cacheStoreCompressionBehavior(host);
  cacheStoreFormatVersionBehavior(host);
  cacheIncrementDecrementBehavior(host);
  cacheInstrumentationBehavior({ ...host, storeName: "Store" });
  cacheLoggingBehavior(host);

  it("max key bytesize", async () => {
    const cache = host.lookupStore({ maxKeyBytesize: 100 }) as unknown as {
      normalizeKey(key: string, options: object): Promise<string>;
    };
    const key = await cache.normalizeKey(
      Array.from(crypto.getRandomValues(new Uint8Array(200)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      {},
    );
    expect(new TextEncoder().encode(key).length).toBe(100);
  });

  it("loads defaults from config/solid_cache.yml", () => {
    const cache = host.lookupStore();
    expect(cache.maxAge).toBe(3600);
  });

  it("cache options override defaults", () => {
    const cache = host.lookupStore({ maxAge: 7200 });
    expect(cache.maxAge).toBe(7200);
  });

  it("write with unless exist", async () => {
    const cache = host.lookupStore({ expiresIn: 60 });
    expect(await cache.write("foo", 1)).toBe(true);
    expect(await cache.write("foo", 1, { unlessExist: true })).toBe(false);
  });
});
