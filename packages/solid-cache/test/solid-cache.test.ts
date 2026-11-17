import { cacheInstrumentationBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-instrumentation-behavior";
import { cacheLoggingBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-logging-behavior";
import { cacheStoreCompressionBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-compression-behavior";
import { cacheStoreFormatVersionBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-format-version-behavior";
import { cacheIncrementDecrementBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-increment-decrement-behavior";
import { cacheStoreBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-behavior";
import { cacheStoreCoderBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-coder-behavior";
import { cacheStoreSerializerBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-serializer-behavior";
import { encodedKeyCacheBehavior } from "@blazetrails/activesupport/test/cache/behaviors/encoded-key-cache-behavior";
import { failureRaisingBehavior } from "@blazetrails/activesupport/test/cache/behaviors/failure-raising-behavior";
import { failureSafetyBehavior } from "@blazetrails/activesupport/test/cache/behaviors/failure-safety-behavior";
import { localCacheBehavior } from "@blazetrails/activesupport/test/cache/behaviors/local-cache-behavior";
import { cacheStoreVersionBehavior } from "@blazetrails/activesupport/test/cache/behaviors/cache-store-version-behavior";
import { seconds } from "@blazetrails/activesupport";
import { travel, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { afterEach, describe, expect, it } from "vitest";
import { StatementTimeout } from "@blazetrails/activerecord";
import { emulatingTimeouts, useSolidCache, waitForBackgroundTasks } from "./support/test-helper.js";

describe("SolidCacheTest", () => {
  const host = useSolidCache();

  afterEach(() => {
    travelBack();
  });

  cacheStoreBehavior(host);
  cacheStoreVersionBehavior(host);
  cacheStoreCoderBehavior(host);
  cacheStoreCompressionBehavior(host);
  cacheStoreFormatVersionBehavior(host);
  cacheStoreSerializerBehavior(host);
  localCacheBehavior(host);
  cacheIncrementDecrementBehavior(host);
  cacheInstrumentationBehavior({ ...host, storeName: "Store" });
  cacheLoggingBehavior(host);
  encodedKeyCacheBehavior(host);

  it("max key bytesize", async () => {
    const cache = host.lookupStore({ maxKeyBytesize: 100 }) as unknown as {
      normalizeKey(key: string, options: object): Promise<Uint8Array>;
    };
    const key = await cache.normalizeKey(
      Array.from(crypto.getRandomValues(new Uint8Array(200)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      {},
    );
    expect(key.length).toBe(100);
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

  it("write expired value with unless exist", async () => {
    const cache = host.lookupStore({ expiresIn: 60 });
    expect(await cache.write(1, "aaaa", { expiresIn: seconds(1) })).toBe(true);
    travel(seconds(2));
    expect(await cache.write(1, "bbbb", { expiresIn: seconds(1), unlessExist: true })).toBe(true);
  });
});

describe("SolidCacheFailsafeTest", () => {
  const host = useSolidCache();

  failureSafetyBehavior({
    lookupStore: host.lookupStore,
    async emulatingUnavailability(block) {
      await waitForBackgroundTasks(host.allStores[0]);
      await emulatingTimeouts(() => block(host.lookupStore({ namespace: host.namespace() })));
    },
  });
});

describe("SolidCacheRaisingTest", () => {
  const host = useSolidCache();

  failureRaisingBehavior({
    lookupStore: host.lookupStore,
    unavailableError: StatementTimeout,
    async emulatingUnavailability(block) {
      await waitForBackgroundTasks(host.allStores[0]);
      await emulatingTimeouts(() =>
        block(
          host.lookupStore({
            namespace: host.namespace(),
            errorHandler: ({ exception }: { exception: Error }) => {
              throw exception;
            },
          }),
        ),
      );
    },
  });
});
