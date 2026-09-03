import { it } from "vitest";
import type { Store, StoreOptions } from "../store.js";
import { assert, assertNot } from "../../testing/assertions.js";

/** @internal */
export interface CacheDeleteMatchedBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

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
