import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store, ArgumentError } from "./store.js";
import { Entry } from "./entry.js";

class TestStore extends Store {
  private _data = new Map<string, Entry>();
  protected readEntry(key: string, _o: Record<string, unknown>): Entry | null {
    return this._data.get(key) ?? null;
  }
  protected writeEntry(key: string, entry: Entry, _o: Record<string, unknown>): boolean {
    this._data.set(key, entry);
    return true;
  }
  protected deleteEntry(key: string, _o: Record<string, unknown>): boolean {
    return this._data.delete(key);
  }
  override clear(): void {
    this._data.clear();
  }
  override cleanup(): void {
    for (const [k, e] of this._data) {
      if (e.isExpired()) this._data.delete(k);
    }
  }
  override increment(name: string, amount = 1): number | null {
    const key = this.normalizeKey(name, {});
    const entry = this.readEntry(key, {});
    if (!entry) return null;
    const n = Number(entry.value);
    if (isNaN(n)) return null;
    const next = n + amount;
    this.writeEntry(key, new Entry(next), {});
    return next;
  }
  override decrement(name: string, amount = 1): number | null {
    return this.increment(name, -amount);
  }
  override deleteMatched(matcher: string | RegExp): void {
    const re = typeof matcher === "string" ? new RegExp(matcher) : matcher;
    for (const k of this._data.keys()) {
      if (re.test(k)) this._data.delete(k);
    }
  }
  callMergedOptions(storeOpts: Record<string, unknown>, callOpts?: Record<string, unknown>) {
    const s = new TestStore(storeOpts);
    return s.mergedOptions(callOpts);
  }
}

describe("CacheStoreTest", () => {
  let store: TestStore;
  let prevRaise: boolean;
  let prevLogger: typeof Store.logger;

  beforeEach(() => {
    store = new TestStore();
    prevRaise = Store.raiseOnInvalidCacheExpirationTime;
    prevLogger = Store.logger;
    Store.raiseOnInvalidCacheExpirationTime = false;
    Store.logger = null;
  });

  afterEach(() => {
    Store.raiseOnInvalidCacheExpirationTime = prevRaise;
    Store.logger = prevLogger;
  });

  it("expire_in is aliased to expires_in", () => {
    const result = Store.normalizeOptions({ expire_in: 5000 });
    expect(result.expiresIn).toBe(5000);
    expect(result.expire_in).toBeUndefined();
  });

  it("expired_in is aliased to expires_in", () => {
    const result = Store.normalizeOptions({ expired_in: 3000 });
    expect(result.expiresIn).toBe(3000);
    expect(result.expired_in).toBeUndefined();
  });

  it("alias does not override an explicit expires_in", () => {
    const result = Store.normalizeOptions({ expiresIn: 1000, expire_in: 5000 });
    expect(result.expiresIn).toBe(1000);
    expect(result.expire_in).toBeUndefined();
  });

  it("expires_at is converted to expires_in", () => {
    const future = Date.now() + 10_000;
    const result = store.callMergedOptions({}, { expiresAt: future });
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(result.expiresIn).toBeLessThanOrEqual(10_000);
    expect(result.expiresAt).toBeUndefined();
  });

  it("raises when both expires_in and expires_at are supplied", () => {
    expect(() =>
      store.callMergedOptions({}, { expiresIn: 1000, expiresAt: Date.now() + 5000 }),
    ).toThrow("Either :expires_in or :expires_at can be supplied, but not both");
  });

  it("raises when expires_in is a Date object", () => {
    expect(() =>
      store.callMergedOptions({}, { expiresIn: new Date() as unknown as number }),
    ).toThrow("expires_in parameter should not be a Date. Did you mean to use expiresAt?");
  });

  it("raises on negative expires_in when raiseOnInvalidCacheExpirationTime is true", () => {
    Store.raiseOnInvalidCacheExpirationTime = true;
    expect(() => store.callMergedOptions({}, { expiresIn: -1 })).toThrow(
      "Cache expiration time is invalid, cannot be negative",
    );
  });

  it("logs on negative expires_in and removes it when raiseOnInvalidCacheExpirationTime is false", () => {
    const errors: string[] = [];
    Store.logger = { warn: () => {}, error: (msg) => errors.push(msg) };
    const result = store.callMergedOptions({}, { expiresIn: -1 });
    expect(result.expiresIn).toBeUndefined();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Cache expiration time is invalid");
  });

  it("mergedOptions merges store and call options", () => {
    const result = store.callMergedOptions({ namespace: "ns" }, { expiresIn: 1000 });
    expect(result.namespace).toBe("ns");
    expect(result.expiresIn).toBe(1000);
  });

  it("mergedOptions call options override store options", () => {
    const result = store.callMergedOptions({ expiresIn: 500 }, { expiresIn: 1000 });
    expect(result.expiresIn).toBe(1000);
  });

  it("mergedOptions normalizes aliases from call options", () => {
    const result = store.callMergedOptions({}, { expire_in: 2000 });
    expect(result.expiresIn).toBe(2000);
    expect(result.expire_in).toBeUndefined();
  });

  it("past expires_at results in negative expires_in which is removed and logged", () => {
    const errors: string[] = [];
    Store.logger = { warn: () => {}, error: (msg) => errors.push(msg) };
    const past = Date.now() - 5000;
    const result = store.callMergedOptions({}, { expiresAt: past });
    expect(result.expiresIn).toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it("handleInvalidExpiresIn raises when raiseOnInvalidCacheExpirationTime is true", () => {
    Store.raiseOnInvalidCacheExpirationTime = true;
    expect(() => Store.handleInvalidExpiresIn("bad ttl")).toThrow(ArgumentError);
  });
});
