import { describe, it } from "vitest";

describe("QueryCacheTest", () => {
  it.skip("execute clear cache", () => {});
  it.skip("exec query clear cache", () => {});
  it.skip("writes should always clear cache", () => {});
  it.skip("reads dont clear disabled cache", () => {});
  it.skip("exceptional middleware clears and disables cache on error", () => {});
  it.skip("query cache is applied to all connections", () => {});
  it.skip("cache is not applied when config is false", () => {});
  it.skip("cache is applied when config is string", () => {});
  it.skip("cache is applied when config is integer", () => {});
  it.skip("cache is applied when config is nil", () => {});
  it.skip("query cache with forked processes", () => {});
  it.skip("query cache across threads", () => {});
  it.skip("middleware delegates", () => {});
  it.skip("middleware caches", () => {});
  it.skip("cache enabled during call", () => {});
  it.skip("cache passing a relation", () => {});
  it.skip("find queries", () => {});
  it.skip("find queries with cache", () => {});
  it.skip("find queries with cache multi record", () => {});
  it.skip("find queries with multi cache blocks", () => {});
  it.skip("count queries with cache", () => {});
  it.skip("exists queries with cache", () => {});
  it.skip("select all with cache", () => {});
  it.skip("select one with cache", () => {});
  it.skip("select value with cache", () => {});
  it.skip("select values with cache", () => {});
  it.skip("select rows with cache", () => {});
  it.skip("query cache dups results correctly", () => {});
  it.skip("cache notifications can be overridden", () => {});
  it.skip("cache does not raise exceptions", () => {});
  it.skip("query cache does not allow sql key mutation", () => {});
  it.skip("cache is flat", () => {});
  it.skip("cache does not wrap results in arrays", () => {});
  it.skip("cache is ignored for locked relations", () => {});
  it.skip("cache is available when connection is connected", () => {});
  it.skip("cache is available when using a not connected connection", () => {});
  it.skip("query cache executes new queries within block", () => {});
  it.skip("query cache doesnt leak cached results of rolled back queries", () => {});
  it.skip("query cached even when types are reset", () => {});
  it.skip("query cache does not establish connection if unconnected", () => {});
  it.skip("query cache is enabled on connections established after middleware runs", () => {});
  it.skip("query caching is local to the current thread", () => {});
  it.skip("query cache is enabled on all connection pools", () => {});
  it.skip("clear query cache is called on all connections", () => {});
  it.skip("query cache is enabled in threads with shared connection", () => {});
  it.skip("query cache is cleared for all thread when a connection is shared", () => {});
  it.skip("query cache uncached dirties", () => {});
  it.skip("query cache connection uncached dirties", () => {});
  it.skip("query cache uncached dirties disabled with nested cache", () => {});
});

describe("QueryCacheMutableParamTest", () => {
  it.skip("query cache handles mutated binds", () => {});
});

describe("QuerySerializedParamTest", () => {
  it.skip("query serialized active record", () => {});
  it.skip("query serialized string", () => {});
});

describe("QueryCacheExpiryTest", () => {
  it.skip("cache gets cleared after migration", () => {});
  it.skip("enable disable", () => {});
  it.skip("insert all bang", () => {});
  it.skip("upsert all", () => {});
  it.skip("cache is expired by habtm update", () => {});
  it.skip("cache is expired by habtm delete", () => {});
  it.skip("query cache lru eviction", () => {});
  it.skip("threads use the same connection", () => {});
});

describe("TransactionInCachedSqlActiveRecordPayloadTest", () => {
  it.skip("payload without open transaction", () => {});
  it.skip("payload with open transaction", () => {});
});
