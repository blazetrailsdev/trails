import { beforeEach, expect, it as vitestIt } from "vitest";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";

/** @internal */
export interface EncodedKeyCacheBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function encodedKeyCacheBehavior(host?: EncodedKeyCacheBehaviorHost): void {
  const it = host ? vitestIt : vitestIt.skip;
  let cache: Store;

  beforeEach(() => {
    if (!host) return;
    cache = host.lookupStore({ expiresIn: 60 });
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the

  it("common utf8 values", async () => {
    const key = "ümlaut";
    expect(await cache.write(key, "1", { raw: true })).toBeTruthy();
    expect(await cache.read(key, { raw: true })).toBe("1");
    expect(await cache.fetch(key, { raw: true })).toBe("1");
    expect(await cache.delete(key)).toBeTruthy();
    expect(await cache.fetch(key, { raw: true }, () => "2")).toBe("2");
    expect(await cache.increment(key)).toBe(3);
    expect(await cache.decrement(key)).toBe(2);
  });

  // PERMANENT-SKIP: CLAUDE.md, "A String has no encoding tag either" — the
  it.skip("retains encoding", async () => {
    const key = "ümlaut";
    expect(await cache.write(key, "1", { raw: true })).toBeTruthy();
  });
}
