import { it } from "vitest";
import type { Store, StoreOptions } from "../store.js";
import { assert, assertNot } from "../../testing/assertions.js";

// Mirrors Rails `CacheDeleteMatchedBehavior`
// (activesupport/test/cache/behaviors/cache_delete_matched_behavior.rb).
// Ruby's `include CacheDeleteMatchedBehavior` is spelled here as a function
// the store test file calls inside its own describe, which is the trails
// spelling of a test-behavior mixin.

/** @internal */
export interface CacheDeleteMatchedBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT Ruby spells this `include CacheDeleteMatchedBehavior`
 * (activesupport/test/cache/behaviors/cache_delete_matched_behavior.rb); TS has no `include` for a test
 * mixin, so the module is a function the including describe calls. Rails TEST
 * code is outside the Ruby extractor's population, so no manifest can back it.
 */
export function cacheDeleteMatchedBehavior(host: CacheDeleteMatchedBehaviorHost): void {
  it("delete matched", () => {
    const cache = host.lookupStore();
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.write("foo/bar", "baz");
    cache.write("fu/baz", "bar");
    cache.deleteMatched(/oo/);
    assertNot(cache.exist("foo"));
    assert(cache.exist("fu"));
    assertNot(cache.exist("foo/bar"));
    assert(cache.exist("fu/baz"));
  });
}
