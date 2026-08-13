import { expect, it } from "vitest";
import type { Store, StoreOptions } from "../store.js";

// Mirrors Rails `CacheDeleteMatchedBehavior`
// (activesupport/test/cache/behaviors/cache_delete_matched_behavior.rb).
// Ruby's `include CacheDeleteMatchedBehavior` is spelled here as a function
// the store test file calls inside its own describe, which is the trails
// spelling of a test-behavior mixin.

/** @internal */
export interface CacheDeleteMatchedBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

/** @internal */
export function cacheDeleteMatchedBehavior(host: CacheDeleteMatchedBehaviorHost): void {
  it("delete matched", () => {
    const cache = host.lookupStore();
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.write("foo/bar", "baz");
    cache.write("fu/baz", "bar");
    cache.deleteMatched(/oo/);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
    expect(cache.exist("foo/bar")).toBe(false);
    expect(cache.exist("fu/baz")).toBe(true);
  });
}
