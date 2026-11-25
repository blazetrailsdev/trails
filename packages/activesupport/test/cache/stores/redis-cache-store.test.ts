import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pool } from "generic-pool";
import { Redis, ReplyError, type ChainableCommander } from "ioredis";
import PipelineModule from "ioredis/built/Pipeline.js";

const Pipeline = PipelineModule as unknown as { prototype: ChainableCommander };
import { ArgumentError, SecureRandom, regexpEscape } from "@blazetrails/ruby-compat";
import { Duration } from "../../../lib/duration.js";
import { getEnv } from "../../../lib/environment.js";
import { lookupStore as cacheLookupStore } from "../../../lib/cache.js";
import { RedisCacheStore } from "../../../lib/cache/redis-cache-store.js";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";
import { Entry } from "../../../lib/cache/entry.js";
import { cacheStoreBehavior } from "../behaviors/cache-store-behavior.js";
import { cacheStoreVersionBehavior } from "../behaviors/cache-store-version-behavior.js";
import { cacheStoreCoderBehavior } from "../behaviors/cache-store-coder-behavior.js";
import { cacheStoreCompressionBehavior } from "../behaviors/cache-store-compression-behavior.js";
import { cacheStoreFormatVersionBehavior } from "../behaviors/cache-store-format-version-behavior.js";
import { cacheStoreSerializerBehavior } from "../behaviors/cache-store-serializer-behavior.js";
import { localCacheBehavior } from "../behaviors/local-cache-behavior.js";
import { cacheIncrementDecrementBehavior } from "../behaviors/cache-increment-decrement-behavior.js";
import { cacheInstrumentationBehavior } from "../behaviors/cache-instrumentation-behavior.js";
import { cacheLoggingBehavior } from "../behaviors/cache-logging-behavior.js";
import { encodedKeyCacheBehavior } from "../behaviors/encoded-key-cache-behavior.js";
import { connectionPoolBehavior } from "../behaviors/connection-pool-behavior.js";
import { failureRaisingBehavior } from "../behaviors/failure-raising-behavior.js";
import { failureSafetyBehavior } from "../behaviors/failure-safety-behavior.js";

const REDIS_URL = getEnv("REDIS_URL") ?? "redis://localhost:6379/0";

let REDIS_UP: boolean;
{
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0 });
  try {
    await redis.connect();
    await redis.ping();
    REDIS_UP = true;
  } catch {
    REDIS_UP = false;
  } finally {
    redis.disconnect();
  }
}

const sockets: Store[] = [];

async function disconnect(cache: Store): Promise<void> {
  const redis = (cache as RedisCacheStore).redis;
  if (redis instanceof Redis) redis.disconnect();
  else await redis.drain().then(() => redis.clear());
}

afterEach(async () => {
  while (sockets.length > 0) await disconnect(sockets.pop()!);
});

describe("LookupTest", () => {
  it("may be looked up as :redis_cache_store", () => {
    const cache = cacheLookupStore(":redis_cache_store") as Store;
    sockets.push(cache);
    expect(cache).toBeInstanceOf(RedisCacheStore);
  });
});

describe("InitializationTest", () => {
  const build = (options: StoreOptions = {}): RedisCacheStore => {
    const cache = new RedisCacheStore({ pool: false, ...options });
    sockets.push(cache);
    return cache;
  };

  it.skip("omitted URL uses Redis client with default settings");

  it.skip("no URLs uses Redis client with default settings");

  it.skip("singular URL uses Redis client");

  it.skip("one URL uses Redis client");

  it.skip("multiple URLs uses Redis::Distributed client");

  it("block argument uses yielded client", () => {
    const redis = new Redis(REDIS_URL, { lazyConnect: true });
    const block = vi.fn(() => redis);
    build({ redis: block });
    expect(block).toHaveBeenCalledOnce();
  });

  it("instance of Redis uses given instance", () => {
    const redisInstance = new Redis(REDIS_URL, { lazyConnect: true });
    const cache = build({ redis: redisInstance });
    expect(cache.redis).toBe(redisInstance);
  });

  it("validate pool arguments", () => {
    expect(() => build({ url: REDIS_URL, pool: { size: [] } })).toThrow(TypeError);

    expect(() => build({ url: REDIS_URL, pool: { timeout: [] } })).toThrow(TypeError);

    build({ url: REDIS_URL, pool: { size: "12", timeout: "1.5" } });
  });

  it("instantiating the store doesn't connect to Redis", () => {
    expect(() => build({ url: "redis://localhost:1", lazyConnect: true })).not.toThrow();
  });
});

function storeTest(): {
  cache: () => RedisCacheStore;
  cacheNoTtl: () => RedisCacheStore;
  namespace: () => string;
  lookupStore: (options?: StoreOptions) => RedisCacheStore;
} {
  let cache: RedisCacheStore;
  let cacheNoTtl: RedisCacheStore;
  let namespace: string;

  const lookupStore = (options: StoreOptions = {}): RedisCacheStore => {
    const store = cacheLookupStore(":redis_cache_store", {
      timeout: 0.1,
      namespace,
      pool: false,
      url: REDIS_URL,
      ...options,
    }) as RedisCacheStore;
    sockets.push(store);
    return store;
  };

  beforeEach(() => {
    namespace = `test-${SecureRandom.hex()}`;

    cache = lookupStore({ expiresIn: 60 });

    cacheNoTtl = lookupStore();
  });

  afterEach(async () => {
    await cache.clear();
  });

  return {
    cache: () => cache,
    cacheNoTtl: () => cacheNoTtl,
    namespace: () => namespace,
    lookupStore,
  };
}

async function redisBackend(cache: RedisCacheStore): Promise<Redis> {
  return cache.redis as Redis;
}

describe.skipIf(!REDIS_UP)("RedisCacheStoreCommonBehaviorTest", () => {
  const t = storeTest();
  const host = { lookupStore: t.lookupStore };

  cacheStoreBehavior(host);
  cacheStoreVersionBehavior(host);
  cacheStoreCoderBehavior(host);
  cacheStoreCompressionBehavior(host);
  cacheStoreFormatVersionBehavior(host);
  cacheStoreSerializerBehavior(host);
  localCacheBehavior(host);
  cacheIncrementDecrementBehavior(host);
  cacheInstrumentationBehavior({ ...host, storeName: "RedisCacheStore" });
  cacheLoggingBehavior({
    ...host,
    keyPattern: (key, { namespace = t.namespace() } = {}) =>
      new RegExp(
        `${regexpEscape(namespace ?? "")}${namespace != null ? ":" : ""}${regexpEscape(key)}`,
      ),
  });
  encodedKeyCacheBehavior(host);

  it("fetch multi uses redis mget", async () => {
    const mget = vi.spyOn(await redisBackend(t.cache()), "mgetBuffer");
    await t.cache().fetchMulti("a", "b", "c", (key: unknown) => String(key).repeat(2));
    expect(mget).toHaveBeenCalledOnce();
  });

  it("fetch multi with namespace", async () => {
    const mget = vi.spyOn(await redisBackend(t.cache()), "mgetBuffer");
    await t
      .cache()
      .fetchMulti("a", "b", "c", { namespace: "custom-namespace" }, (key: unknown) =>
        String(key).repeat(2),
      );
    expect(mget).toHaveBeenCalledWith(
      ...["custom-namespace:a", "custom-namespace:b", "custom-namespace:c"].map((k) =>
        Buffer.from(k),
      ),
    );
  });

  it("write expires at", async () => {
    await t
      .cache()
      .write("key_with_expires_at", "bar", { expiresAt: Duration.minutes(30).fromNow() });
    const r = await redisBackend(t.cache());
    expect((await r.ttl(`${t.namespace()}:key_with_expires_at`)) > 0).toBeTruthy();
  });

  it("write with unless exist", async () => {
    expect(await t.cache().write("foo", 1)).toBe(true);
    expect(await t.cache().write("foo", 1, { unlessExist: true })).toBe(false);
  });

  it("increment ttl", async () => {
    const r = await redisBackend(t.cacheNoTtl());
    await r.set(`${t.namespace()}:jar`, 10);
    await t.cacheNoTtl().increment("jar", 1);
    expect(Number(await r.get(`${t.namespace()}:jar`)) === 11).toBeTruthy();
    expect((await r.ttl(`${t.namespace()}:jar`)) < 0).toBeTruthy();

    await t.cacheNoTtl().increment("kar", 1);
    expect(Number(await r.get(`${t.namespace()}:kar`)) === 1).toBeTruthy();
    expect((await r.ttl(`${t.namespace()}:kar`)) < 0).toBeTruthy();
  });

  it("increment expires in", async () => {
    const r = await redisBackend(t.cache());
    await t.cache().increment("foo", 1, { expiresIn: 60 });
    expect(await r.exists(`${t.namespace()}:foo`)).toBeTruthy();
    expect((await r.ttl(`${t.namespace()}:foo`)) > 0).toBeTruthy();

    await r.setex(`${t.namespace()}:bar`, 120, 1);
    await t.cache().increment("bar", 1, { expiresIn: 60 });
    expect((await r.ttl(`${t.namespace()}:bar`)) > 60).toBeTruthy();

    const rNoTtl = await redisBackend(t.cacheNoTtl());
    await rNoTtl.set(`${t.namespace()}:dar`, 10);
    await t.cacheNoTtl().increment("dar", 1, { expiresIn: 60 });
    expect((await rNoTtl.ttl(`${t.namespace()}:dar`)) > 0).toBeTruthy();
  });

  it("decrement ttl", async () => {
    const r = await redisBackend(t.cacheNoTtl());
    await r.set(`${t.namespace()}:jar`, 10);
    await t.cacheNoTtl().decrement("jar", 1);
    expect(Number(await r.get(`${t.namespace()}:jar`)) === 9).toBeTruthy();
    expect((await r.ttl(`${t.namespace()}:jar`)) < 0).toBeTruthy();

    await t.cacheNoTtl().decrement("kar", 1);
    expect(Number(await r.get(`${t.namespace()}:kar`)) === -1).toBeTruthy();
    expect((await r.ttl(`${t.namespace()}:kar`)) < 0).toBeTruthy();
  });

  it("decrement expires in", async () => {
    const r = await redisBackend(t.cache());
    await t.cache().decrement("foo", 1, { expiresIn: 60 });
    expect(await r.exists(`${t.namespace()}:foo`)).toBeTruthy();
    expect((await r.ttl(`${t.namespace()}:foo`)) > 0).toBeTruthy();

    await r.setex(`${t.namespace()}:bar`, 120, 1);
    await t.cache().decrement("bar", 1, { expiresIn: 60 });
    expect((await r.ttl(`${t.namespace()}:bar`)) > 60).toBeTruthy();

    const rNoTtl = await redisBackend(t.cacheNoTtl());
    await rNoTtl.set(`${t.namespace()}:dar`, 10);
    await t.cacheNoTtl().decrement("dar", 1, { expiresIn: 60 });
    expect((await rNoTtl.ttl(`${t.namespace()}:dar`)) > 0).toBeTruthy();
  });

  it("fetch caches nil", async () => {
    await t.cache().write("foo", null);
    const write = vi.spyOn(t.cache(), "write");
    expect(await t.cache().fetch("foo", () => "baz")).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it("skip_nil is passed to ActiveSupport::Cache", async () => {
    const cache = t.lookupStore({ skipNil: true });
    const write = vi.spyOn(cache, "write");
    expect(await cache.fetch("foo", () => null)).toBeNull();
    expect(await cache.isExist("foo")).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe.skipIf(!REDIS_UP)("ConnectionPoolBehaviorTest", () => {
  storeTest();
  connectionPoolBehavior({
    store: [":redis_cache_store"],
    storeOptions: () => ({ url: REDIS_URL }),
    emulatingLatency: async (block) => {
      const get = Redis.prototype.get;
      vi.spyOn(Redis.prototype, "get").mockImplementation(async function (
        this: Redis,
        ...args: Parameters<Redis["get"]>
      ) {
        if (/latency/.test(String(args[0]))) await new Promise((r) => setTimeout(r, 200));
        return get.apply(this, args);
      });
      try {
        await block();
      } finally {
        vi.restoreAllMocks();
      }
    },
  });

  it("pool options work", async () => {
    const cache = cacheLookupStore(":redis_cache_store", {
      url: REDIS_URL,
      pool: { size: 2, timeout: 1 },
    }) as RedisCacheStore;
    sockets.push(cache);
    const pool = cache.redis as unknown as {
      max: number;
      _config: { acquireTimeoutMillis: number };
    };
    expect(pool).toBeInstanceOf(Pool);
    expect(pool.max).toBe(2);
    expect(pool._config.acquireTimeoutMillis / 1000).toBe(1);
  });

  it("connection pooling by default", async () => {
    const cache = cacheLookupStore(":redis_cache_store", { url: REDIS_URL }) as RedisCacheStore;
    sockets.push(cache);
    const pool = cache.redis as unknown as {
      max: number;
      _config: { acquireTimeoutMillis: number };
    };
    expect(pool).toBeInstanceOf(Pool);
    expect(pool.max).toBe(5);
    expect(pool._config.acquireTimeoutMillis / 1000).toBe(5);
  });
});

function emulatingUnavailability(
  namespace: () => string,
  client: "unavailable" | "maxClientsReached",
  options: StoreOptions = {},
): (block: (cache: Store) => Promise<unknown>) => Promise<void> {
  return async (block) => {
    if (client === "maxClientsReached") {
      const error = new ReplyError("ERR max number of clients reached");
      vi.spyOn(Redis.prototype, "sendCommand").mockRejectedValue(error);
      vi.spyOn(Pipeline.prototype, "exec").mockRejectedValue(error);
    }
    try {
      const cache = new RedisCacheStore({
        namespace: namespace(),
        url: client === "unavailable" ? "redis://localhost:1" : REDIS_URL,
        pool: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        ...options,
      });
      sockets.push(cache);
      await block(cache);
    } finally {
      vi.restoreAllMocks();
    }
  };
}

const raiseException = {
  errorHandler: ({ exception }: { exception: unknown }) => {
    throw exception;
  },
};

describe.skipIf(!REDIS_UP)("FailureSafetyFromUnavailableClientTest", () => {
  const t = storeTest();
  failureSafetyBehavior({
    lookupStore: t.lookupStore,
    emulatingUnavailability: emulatingUnavailability(t.namespace, "unavailable"),
  });
});

describe.skipIf(!REDIS_UP)("FailureSafetyFromMaxClientsReachedErrorTest", () => {
  const t = storeTest();
  failureSafetyBehavior({
    lookupStore: t.lookupStore,
    emulatingUnavailability: emulatingUnavailability(t.namespace, "maxClientsReached"),
  });
});

describe.skipIf(!REDIS_UP)("FailureRaisingFromUnavailableClientTest", () => {
  const t = storeTest();
  failureRaisingBehavior({
    lookupStore: t.lookupStore,
    emulatingUnavailability: emulatingUnavailability(t.namespace, "unavailable", raiseException),
    unavailableError: Error,
  });
});

describe.skipIf(!REDIS_UP)("FailureRaisingFromMaxClientsReachedErrorTest", () => {
  const t = storeTest();
  failureRaisingBehavior({
    lookupStore: t.lookupStore,
    emulatingUnavailability: emulatingUnavailability(
      t.namespace,
      "maxClientsReached",
      raiseException,
    ),
    unavailableError: ReplyError,
  });
});

describe.skipIf(!REDIS_UP)("DeleteMatchedTest", () => {
  const t = storeTest();

  it("deletes keys matching glob", async () => {
    const prefix = SecureRandom.alphanumeric();
    const key = `${prefix}${SecureRandom.uuid()}`;
    await t.cache().write(key, "bar");

    const otherKey = SecureRandom.uuid();
    await t.cache().write(otherKey, SecureRandom.alphanumeric());
    await t.cache().deleteMatched(`${prefix}*`);
    expect(await t.cache().isExist(key)).toBeFalsy();
    expect(await t.cache().isExist(otherKey)).toBeTruthy();
  });

  it("fails with regexp matchers", async () => {
    await expect(t.cache().deleteMatched(/OO/i)).rejects.toThrow(ArgumentError);
  });
});

describe.skipIf(!REDIS_UP)("ClearTest", () => {
  const t = storeTest();

  it("clear all cache key", async () => {
    const key = SecureRandom.uuid();
    const otherKey = SecureRandom.uuid();
    await t.cache().write(key, SecureRandom.uuid());
    await t.cache().write(otherKey, SecureRandom.uuid());
    await t.cache().clear();
    expect(await t.cache().isExist(key)).toBeFalsy();
    expect(await t.cache().isExist(otherKey)).toBeFalsy();
  });

  it("only clear namespace cache key", async () => {
    const key = SecureRandom.uuid();
    const otherKey = SecureRandom.uuid();
    const redis = await redisBackend(t.cache());

    await t.cache().write(key, SecureRandom.alphanumeric());
    await redis.set(otherKey, SecureRandom.alphanumeric());
    await t.cache().clear();

    expect(await t.cache().isExist(key)).toBeFalsy();
    expect(await redis.exists(otherKey)).toBeTruthy();
    await redis.del(otherKey);
  });

  it.skip("clear all cache key with Redis::Distributed");
});

describe.skipIf(!REDIS_UP)("RawTest", () => {
  const t = storeTest();

  it('does not compress values read with "raw" enabled', async () => {
    await t.cache().write("foo", "bar", { raw: true });

    const compressed = vi.spyOn(Entry.prototype, "compressed");
    await t.cache().read("foo", { raw: true });
    expect(compressed).not.toHaveBeenCalled();
  });
});
