import { describe, it, expect, beforeEach } from "vitest";
import { Store, WriteOptions } from "./cache/store.js";
import { Entry } from "./cache/entry.js";
import { Notifications } from "./notifications.js";
import type { Event } from "./notifications/instrumenter.js";

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
    return this.instrument("increment", name, { amount }, () => this.modifyValue(name, amount));
  }
  override decrement(name: string, amount = 1): number | null {
    return this.instrument("decrement", name, { amount }, () => this.modifyValue(name, -amount));
  }
  private modifyValue(name: string, amount: number): number | null {
    const key = this.normalizeKey(name, {});
    const entry = this.readEntry(key, {});
    if (!entry) return null;
    const n = Number(entry.value);
    if (isNaN(n)) return null;
    const next = n + amount;
    this.writeEntry(key, new Entry(next), {});
    return next;
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
    let calls = 0;
    cache.fetch("foo", () => {
      calls++;
      return "bar";
    });
    expect(calls).toBe(0);
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
    cache.fetch("foo", (_key, opts) => ((capturedOpts = opts), "v"));
    expect(capturedOpts).toBeInstanceOf(WriteOptions);
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

  it("read multi with namespace option", () => {
    const cache = new TestStore();
    cache.write("foo", "bar", { namespace: "tester" });
    cache.write("fu", "baz", { namespace: "tester" });
    expect(cache.readMulti("foo", "fu", { namespace: "tester" })).toEqual({
      foo: "bar",
      fu: "baz",
    });
  });

  it("fetch multi with namespace option", () => {
    const cache = new TestStore();
    cache.write("foo", "bar", { namespace: "tester" });
    cache.write("fu", "baz", { namespace: "tester" });
    const values = cache.fetchMulti("foo", "fu", { namespace: "tester" }, (key) => key + " block");
    expect(values).toEqual({ foo: "bar", fu: "baz" });
    expect(cache.read("foo", { namespace: "tester" })).toBe("bar");
  });

  it("fetch multi with force option", () => {
    const cache = new TestStore();
    cache.write("foo", "bar");
    const values = cache.fetchMulti("foo", "fu", { force: true }, (key) => key + " block");
    expect(values).toEqual({ foo: "foo block", fu: "fu block" });
    expect(cache.read("foo")).toBe("foo block");
  });

  it("fetch multi with expires in option", () => {
    const cache = new TestStore();
    const values = cache.fetchMulti("foo", { expiresIn: 10 }, (key) => key + " block");
    expect(values).toEqual({ foo: "foo block" });
    expect(cache.read("foo")).toBe("foo block");
  });
});

describe("CacheInstrumentationBehavior", () => {
  let cache: TestStore;
  beforeEach(() => {
    cache = new TestStore();
  });

  function withInstrumentation(operation: string, block: () => void): Event[] {
    return Notifications.collectEvents(`cache_${operation}.active_support`, block);
  }

  const normalizedKey = (key: string, options?: Record<string, unknown>) =>
    (
      cache as unknown as { normalizeKey(k: unknown, o?: Record<string, unknown>): string }
    ).normalizeKey(key, options);

  it("test_read_instrumentation", () => {
    cache.write("1", "aaaaaaaaaa");
    const events = withInstrumentation("read", () => {
      cache.read("1");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_read.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1"));
    expect(events[0].payload.hit).toBe(true);
    expect(events[0].payload.store).toBe("TestStore");
  });

  it("test_write_instrumentation", () => {
    const events = withInstrumentation("write", () => {
      cache.write("1", "aaaaaaaaaa");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_write.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1"));
    expect(events[0].payload.store).toBe("TestStore");
  });

  it("test_delete_instrumentation", () => {
    const options = { namespace: "foo" };
    const events = withInstrumentation("delete", () => {
      cache.delete("1", options);
    });
    expect(events.map((e) => e.name)).toEqual(["cache_delete.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1", options));
    expect(events[0].payload.store).toBe("TestStore");
    expect(events[0].payload.namespace).toBe("foo");
  });

  it("test_write_multi_instrumentation", () => {
    const writes = { a: "aa", b: "bb" };
    let returned: unknown;
    const events = withInstrumentation("write_multi", () => {
      returned = cache.writeMulti(writes);
    });
    expect(events.map((e) => e.name)).toEqual(["cache_write_multi.active_support"]);
    expect(events[0].payload.super_operation).toBeUndefined();
    expect(events[0].payload.key).toEqual({
      [normalizedKey("a")]: "aa",
      [normalizedKey("b")]: "bb",
    });
    // Rails write_multi returns the write_multi_entries result (the normalized
    // entries hash), not the input hash (cache.rb:551-563, 842-846).
    expect(Object.keys(returned as Record<string, unknown>)).toEqual([
      normalizedKey("a"),
      normalizedKey("b"),
    ]);
  });

  it("test_fetch_multi_instrumentation_order_of_operations", () => {
    const operations: string[] = [];
    const sub = Notifications.subscribe(/^cache_(read_multi|write_multi)\.active_support$/, (e) =>
      operations.push(e.name),
    );
    try {
      cache.fetchMulti("a", "b", (key: string) => key + key);
    } finally {
      Notifications.unsubscribe(sub);
    }
    expect(operations).toEqual([
      "cache_read_multi.active_support",
      "cache_write_multi.active_support",
    ]);
  });

  it("test_delete_multi_instrumentation", () => {
    const options = { namespace: "foo" };
    const events = withInstrumentation("delete_multi", () => {
      cache.deleteMulti(["b", "a"], options);
    });
    expect(events.map((e) => e.name)).toEqual(["cache_delete_multi.active_support"]);
    expect(events[0].payload.key).toEqual([
      normalizedKey("b", options),
      normalizedKey("a", options),
    ]);
    expect(events[0].payload.store).toBe("TestStore");
  });

  it("test_read_multi_instrumentation", () => {
    cache.write("b", "bb");
    const events = withInstrumentation("read_multi", () => {
      cache.readMulti("a", "b");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_read_multi.active_support"]);
    expect(events[0].payload.key).toEqual([normalizedKey("a"), normalizedKey("b")]);
    expect(events[0].payload.hits).toEqual([normalizedKey("b")]);
    expect(events[0].payload.store).toBe("TestStore");
  });

  it("test_instrumentation_with_fetch_multi_as_super_operation", () => {
    cache.write("b", "bb");
    const events = withInstrumentation("read_multi", () => {
      cache.fetchMulti("a", "b", (key: string) => key + key);
    });
    expect(events.map((e) => e.name)).toEqual(["cache_read_multi.active_support"]);
    expect(events[0].payload.super_operation).toBe("fetch_multi");
    expect(events[0].payload.key).toEqual([normalizedKey("a"), normalizedKey("b")]);
    expect(events[0].payload.hits).toEqual([normalizedKey("b")]);
    expect(events[0].payload.store).toBe("TestStore");
  });

  it("fetchMulti extracts a trailing options hash before instrumenting", () => {
    const events = withInstrumentation("read_multi", () => {
      cache.fetchMulti("a", "b", { namespace: "foo" }, (key: string) => key + key);
    });
    const opts = { namespace: "foo" };
    expect(events[0].payload.key).toEqual([normalizedKey("a", opts), normalizedKey("b", opts)]);
    expect(events[0].payload.namespace).toBe("foo");
    // The options hash must not be treated as a cache name.
    expect(cache.read("a", opts)).toBe("aa");
    expect(cache.read("[object Object]")).toBeNull();
  });

  // Cache::Store has no Rails instrumentation test for exist?/fetch (no public
  // behavior beyond the wrapped read), so these cover the remaining wrapped
  // operations our port adds: the exist? event, and fetch's read/fetch_hit/generate.
  it("exist? fires cache_exist?.active_support with the normalized key", () => {
    cache.write("1", "aaaaaaaaaa");
    const events = withInstrumentation("exist?", () => {
      cache.exist("1");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_exist?.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1"));
  });

  it("fetch miss fires cache_read (super_operation fetch) then cache_generate", () => {
    const read = withInstrumentation("read", () => {
      cache.fetch("1", () => "aaaaaaaaaa");
    });
    expect(read[0].payload.super_operation).toBe("fetch");
    expect(read[0].payload.hit).toBe(false);

    const generate = withInstrumentation("generate", () => {
      cache.fetch("2", () => "bbbbbbbbbb");
    });
    expect(generate.map((e) => e.name)).toEqual(["cache_generate.active_support"]);
    expect(generate[0].payload.key).toBe(normalizedKey("2"));
  });

  it("fetch hit fires cache_fetch_hit.active_support with the raw name", () => {
    cache.write("1", "aaaaaaaaaa");
    const events = withInstrumentation("fetch_hit", () => {
      cache.fetch("1", () => "bbbbbbbbbb");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_fetch_hit.active_support"]);
    expect(events[0].payload.key).toBe("1");
  });

  it("test_increment_instrumentation", () => {
    cache.write("1", 0);
    const events = withInstrumentation("increment", () => {
      cache.increment("1");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_increment.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1"));
    expect(events[0].payload.store).toBe("TestStore");
  });

  it("test_decrement_instrumentation", () => {
    cache.write("1", 0);
    const events = withInstrumentation("decrement", () => {
      cache.decrement("1");
    });
    expect(events.map((e) => e.name)).toEqual(["cache_decrement.active_support"]);
    expect(events[0].payload.key).toBe(normalizedKey("1"));
    expect(events[0].payload.store).toBe("TestStore");
  });
});
