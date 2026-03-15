import { describe, it } from "vitest";

describe("RedisCacheStoreCommonBehaviorTest", () => {
  it.skip("fetch multi uses redis mget");
  it.skip("fetch multi with namespace");
  it.skip("write expires at");
  it.skip("write with unless exist");
  it.skip("increment ttl");
  it.skip("increment expires in");
  it.skip("decrement ttl");
  it.skip("decrement expires in");
  it.skip("fetch caches nil");
  it.skip("skip_nil is passed to ActiveSupport::Cache");
});

describe("LookupTest", () => {
  it.skip("may be looked up as :redis_cache_store");
});

describe("InitializationTest", () => {
  it.skip("omitted URL uses Redis client with default settings");

  it.skip("no URLs uses Redis client with default settings");

  it.skip("singular URL uses Redis client");

  it.skip("one URL uses Redis client");

  it.skip("multiple URLs uses Redis::Distributed client");

  it.skip("block argument uses yielded client");

  it.skip("instance of Redis uses given instance");

  it.skip("validate pool arguments");

  it.skip("instantiating the store doesn't connect to Redis");
});

describe("ClearTest", () => {
  it.skip("clear all cache key");

  it.skip("only clear namespace cache key");

  it.skip("clear all cache key with Redis::Distributed");
});

describe("MemCacheStoreTest", () => {
  it.skip("pool options work");

  it.skip("connection pooling by default");
});

describe("DeleteMatchedTest", () => {
  it.skip("deletes keys matching glob");

  it.skip("fails with regexp matchers");
});

describe("RawTest", () => {
  it.skip('does not compress values read with "raw" enabled');
});
