import { it } from "vitest";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";
import { assert, assertNot } from "../../../lib/testing/assertions.js";

/** @internal */
export interface CacheDeleteMatchedBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheDeleteMatchedBehavior(host: CacheDeleteMatchedBehaviorHost): void {
  it("delete matched", async () => {
    const cache = host.lookupStore();
    await cache.write("foo", "bar");
    await cache.write("fu", "baz");
    await cache.write("foo/bar", "baz");
    await cache.write("fu/baz", "bar");
    await cache.deleteMatched(/oo/);
    assertNot(await cache.isExist("foo"));
    assert(await cache.isExist("fu"));
    assertNot(await cache.isExist("foo/bar"));
    assert(await cache.isExist("fu/baz"));
  });
}
