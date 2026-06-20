import { describe, it, expect, beforeEach } from "vitest";
import { Store, WriteOptions } from "./cache/store.js";
import { Entry } from "./cache/entry.js";

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
}

describe("CacheBehaviorTest", () => {
  let cache: TestStore;
  beforeEach(() => {
    cache = new TestStore();
  });

  it("should read and write strings", () => {
    cache.write("foo", "bar");
    expect(cache.read("foo")).toBe("bar");
  });

  it("fetch without cache miss", () => {
    cache.write("foo", "bar");
    expect(cache.fetch("foo", () => "fallback")).toBe("bar");
  });

  it("fetch with cache miss", () => {
    expect(cache.fetch("foo", () => "bar")).toBe("bar");
  });

  it("fetch with forced cache miss", () => {
    cache.write("foo", "bar");
    expect(cache.fetch("foo", { force: true }, () => "baz")).toBe("baz");
  });

  it("fetch with cached nil", () => {
    cache.write("foo", null);
    let called = false;
    cache.fetch("foo", () => {
      called = true;
      return "bar";
    });
    expect(called).toBe(false);
  });

  it("read multi", () => {
    cache.write("foo", "bar");
    cache.write("baz", "qux");
    expect(cache.readMulti("foo", "baz", "missing")).toEqual({ foo: "bar", baz: "qux" });
  });

  it("delete", () => {
    cache.write("foo", "bar");
    expect(cache.delete("foo")).toBe(true);
    expect(cache.read("foo")).toBeNull();
  });

  it("exist", () => {
    cache.write("foo", "bar");
    expect(cache.exist("foo")).toBe(true);
    expect(cache.exist("missing")).toBe(false);
  });

  it("fetch with block receiving write options", () => {
    let capturedOpts: WriteOptions | undefined;
    cache.fetch("foo", (_key, opts) => {
      capturedOpts = opts;
      return "v";
    });
    expect(capturedOpts).toBeInstanceOf(WriteOptions);
    expect(capturedOpts!.key).toBe("foo");
  });

  it("fetch raises on blank key", () => {
    expect(() => cache.fetch("", () => "v")).toThrow("key cannot be blank");
  });

  it("increment", () => {
    cache.write("foo", 1);
    expect(cache.increment("foo")).toBe(2);
  });
  it("decrement", () => {
    cache.write("foo", 3);
    expect(cache.decrement("foo")).toBe(2);
  });
});

describe("CacheStoreNamespaceTest", () => {
  it("static namespace", () => {
    const cache = new TestStore({ namespace: "tester" });
    cache.write("foo", "bar");
    expect(cache.read("foo")).toBe("bar");
  });

  it("proc namespace", () => {
    let ns = "tester";
    const cache = new TestStore({ namespace: () => ns });
    cache.write("foo", "bar");
    expect(cache.read("foo")).toBe("bar");
    ns = "other";
    expect(cache.read("foo")).toBeNull();
  });

  it("delete matched key start", () => {
    const cache = new TestStore({ namespace: "tester" });
    cache.write("foo", "bar");
    cache.write("fu", "baz");
    cache.deleteMatched(/^tester:fo/);
    expect(cache.exist("foo")).toBe(false);
    expect(cache.exist("fu")).toBe(true);
  });
});
