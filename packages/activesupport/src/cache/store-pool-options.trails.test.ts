import { describe, expect, it } from "vitest";
import { Store } from "./store.js";

// trails-only coverage for `Cache::Store.retrieve_pool_options`
// (cache.rb:200-220); Rails reaches it through MemCacheStore/RedisCacheStore,
// neither of which is ported.
describe("Store.retrievePoolOptions", () => {
  it("defaults to the default pool options when :pool is absent", () => {
    expect(Store.retrievePoolOptions({})).toEqual({ size: 5, timeout: 5 });
  });

  it("returns false for pool: false and for a stored nil", () => {
    expect(Store.retrievePoolOptions({ pool: false })).toBe(false);
    // `options.key?(:pool)` sees the key, so the `when false, nil` arm runs
    // rather than the absent-key `true` default.
    expect(Store.retrievePoolOptions({ pool: null })).toBe(false);
  });

  it("merges a Hash over the default pool options, coercing size and timeout", () => {
    expect(Store.retrievePoolOptions({ pool: { size: "12", timeout: "1.5" } })).toEqual({
      size: 12,
      timeout: 1.5,
    });
  });

  it("raises for a non-Hash :pool argument", () => {
    expect(() => Store.retrievePoolOptions({ pool: "12" })).toThrow(
      'Invalid :pool argument, expected Hash, got: "12"',
    );
  });

  it("raises for pool size and timeout that cannot be converted", () => {
    expect(() => Store.retrievePoolOptions({ pool: { size: [] } })).toThrow(
      "can't convert object into Integer",
    );
    expect(() => Store.retrievePoolOptions({ pool: { timeout: [] } })).toThrow(
      "can't convert object into Float",
    );
  });

  it("deletes the :pool key from the options it is given", () => {
    const options = { pool: false, namespace: "foo" };
    Store.retrievePoolOptions(options);
    expect("pool" in options).toBe(false);
  });
});
