import { beforeEach, expect, it } from "vitest";
import type { useSolidCache } from "../support/test-helper.js";
import type { Store } from "../../lib/index.js";

export function localCacheBehavior(host: ReturnType<typeof useSolidCache>): void {
  let cache: Store;
  let peek: Store;

  beforeEach(() => {
    cache = host.lookupStore({ expiresIn: 60 });
    peek = host.lookupStore({ expiresIn: 60 });
  });

  it("local cache of fetch multi", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.fetchMulti(key, otherKey, () => true);
      await peek.delete(key);
      await peek.delete(otherKey);
      expect(await cache.read(key)).toBe(true);
      expect(await cache.read(otherKey)).toBe(true);
    });
  });
}
