import { expect, it } from "vitest";
import type { Store, StoreOptions } from "../store.js";

// Mirrors Rails `CacheIncrementDecrementBehavior`
// (activesupport/test/cache/behaviors/cache_increment_decrement_behavior.rb).
// Ruby's `include CacheIncrementDecrementBehavior` is spelled here as a
// function the store test file calls inside its own describe, which is the
// trails spelling of a test-behavior mixin.

// Ruby seeds each test with `SecureRandom.uuid` / `SecureRandom.alphanumeric`
// so the keys can't collide across a shared backend; SecureRandom is not
// ported, and `cache_store_serializer_behavior` already spells this as a
// random suffix.
function uniqueKey(): string {
  return `key${Math.random()}`;
}

/** @internal */
export interface CacheIncrementDecrementBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT Ruby spells this `include CacheIncrementDecrementBehavior`
 * (activesupport/test/cache/behaviors/cache_increment_decrement_behavior.rb); TS has no `include` for a test
 * mixin, so the module is a function the including describe calls. Rails TEST
 * code is outside the Ruby extractor's population, so no manifest can back it.
 */
export function cacheIncrementDecrementBehavior(host: CacheIncrementDecrementBehaviorHost): void {
  it("increment", () => {
    const cache = host.lookupStore();
    const key = uniqueKey();
    cache.write(key, 1, { raw: true });
    expect(Number(cache.read(key, { raw: true }))).toBe(1);
    expect(cache.increment(key)).toBe(2);
    expect(Number(cache.read(key, { raw: true }))).toBe(2);
    expect(cache.increment(key)).toBe(3);
    expect(Number(cache.read(key, { raw: true }))).toBe(3);

    let missing = cache.increment(uniqueKey());
    expect(missing).toBe(1);
    missing = cache.increment(uniqueKey(), 100);
    expect(missing).toBe(100);
  });

  it("decrement", () => {
    const cache = host.lookupStore();
    const key = uniqueKey();
    cache.write(key, 3, { raw: true });
    expect(Number(cache.read(key, { raw: true }))).toBe(3);
    expect(cache.decrement(key)).toBe(2);
    expect(Number(cache.read(key, { raw: true }))).toBe(2);
    expect(cache.decrement(key)).toBe(1);
    expect(Number(cache.read(key, { raw: true }))).toBe(1);

    // Ruby branches on `@cache.is_a?(ActiveSupport::Cache::MemCacheStore)`;
    // MemCacheStore is not ported, so only the non-MemCacheStore arm exists.
    let missing = cache.decrement(uniqueKey());
    expect(missing).toBe(-1);
    missing = cache.decrement(uniqueKey(), 100);
    expect(missing).toBe(-100);
  });

  it("ttl isnt updated", async () => {
    const cache = host.lookupStore();
    const key = uniqueKey();

    expect(cache.increment(key, 1, { expiresIn: 0.1 })).toBe(1);
    expect(cache.increment(key, 1, { expiresIn: 5000 })).toBe(2);

    // Ruby sleeps 2s because it covers backends without subsecond TTL
    // granularity; every ported store expires on a float clock, so the
    // 0.1s TTL above only needs to elapse.
    await new Promise((r) => setTimeout(r, 150));

    expect(cache.read(key, { raw: true })).toBeNull();
  });
}
