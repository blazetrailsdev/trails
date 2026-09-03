import { expect, it } from "vitest";
import type { Store, StoreOptions } from "../store.js";

function uniqueKey(): string {
  return `key${Math.random()}`;
}

/** @internal */
export interface CacheIncrementDecrementBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

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

    await new Promise((r) => setTimeout(r, 150));

    expect(cache.read(key, { raw: true })).toBeNull();
  });
}
