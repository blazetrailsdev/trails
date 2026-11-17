import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Time } from "@blazetrails/date";
import { Store, ArgumentError, type StoreOptions } from "../../lib/cache/store.js";
import { Entry } from "../../lib/cache/entry.js";

class TestStore extends Store {
  declare protected normalizeKey: (key: unknown, options?: StoreOptions) => Promise<string>;
  private _data = new Map<string, Entry>();
  protected async readEntry(key: string, _o: Record<string, unknown>): Promise<Entry | null> {
    return this._data.get(key) ?? null;
  }
  protected async writeEntry(
    key: string,
    entry: Entry,
    _o: Record<string, unknown>,
  ): Promise<boolean> {
    this._data.set(key, entry);
    return true;
  }
  protected async deleteEntry(key: string, _o: Record<string, unknown>): Promise<boolean> {
    return this._data.delete(key);
  }
  override async clear(): Promise<void> {
    this._data.clear();
  }
  override async cleanup(): Promise<void> {
    for (const [k, e] of this._data) {
      if (e.isExpired()) this._data.delete(k);
    }
  }
  override async increment(name: string, amount = 1): Promise<number | null> {
    const key = await this.normalizeKey(name, {});
    const entry = await this.readEntry(key, {});
    if (!entry) return null;
    const n = Number(entry.value);
    if (isNaN(n)) return null;
    const next = n + amount;
    await this.writeEntry(key, new Entry(next), {});
    return next;
  }
  override async decrement(name: string, amount = 1): Promise<number | null> {
    return await this.increment(name, -amount);
  }
  override async deleteMatched(matcher: string | RegExp): Promise<void> {
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
    const result = Store.normalizeOptions({ expireIn: 5000 });
    expect(result.expiresIn).toBe(5000);
    expect(result.expireIn).toBeUndefined();
  });

  it("expired_in is aliased to expires_in", () => {
    const result = Store.normalizeOptions({ expiredIn: 3000 });
    expect(result.expiresIn).toBe(3000);
    expect(result.expiredIn).toBeUndefined();
  });

  it("alias does not override an explicit expires_in", () => {
    const result = Store.normalizeOptions({ expiresIn: 1000, expireIn: 5000 });
    expect(result.expiresIn).toBe(1000);
    expect(result.expireIn).toBeUndefined();
  });

  it("expires_at is converted to expires_in", () => {
    const future = Time.at(Time.now().toF() + 10);
    const result = store.callMergedOptions({}, { expiresAt: future });
    expect(result.expiresIn).toBeGreaterThan(0);
    expect(result.expiresIn).toBeLessThanOrEqual(10);
    expect(result.expiresAt).toBeUndefined();
  });

  it("raises when both expires_in and expires_at are supplied", () => {
    expect(() =>
      store.callMergedOptions({}, { expiresIn: 1000, expiresAt: Time.at(Time.now().toF() + 5) }),
    ).toThrow("Either :expires_in or :expires_at can be supplied, but not both");
  });

  it("raises when expires_in is a Date object", () => {
    expect(() =>
      store.callMergedOptions({}, { expiresIn: Time.now() as unknown as number }),
    ).toThrow("expires_in parameter should not be a Time. Did you mean to use expires_at?");
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
    const result = store.callMergedOptions({}, { expireIn: 2000 });
    expect(result.expiresIn).toBe(2000);
    expect(result.expireIn).toBeUndefined();
  });

  it("past expires_at results in negative expires_in which is removed and logged", () => {
    const errors: string[] = [];
    Store.logger = { warn: () => {}, error: (msg) => errors.push(msg) };
    const past = Time.at(Time.now().toF() - 5);
    const result = store.callMergedOptions({}, { expiresAt: past });
    expect(result.expiresIn).toBeUndefined();
    expect(errors.length).toBe(1);
  });

  it("handleInvalidExpiresIn raises when raiseOnInvalidCacheExpirationTime is true", () => {
    Store.raiseOnInvalidCacheExpirationTime = true;
    expect(() => store.callMergedOptions({}, { expiresAt: Time.at(Time.now().toF() - 5) })).toThrow(
      ArgumentError,
    );
  });
});
