import { it } from "vitest";
import type { Store, StoreOptions } from "../store.js";
import { assert, assertNot } from "../../testing/assertions.js";

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
    assertNot(await cache.exist("foo"));
    assert(await cache.exist("fu"));
    assertNot(await cache.exist("foo/bar"));
    assert(await cache.exist("fu/baz"));
  });
}
