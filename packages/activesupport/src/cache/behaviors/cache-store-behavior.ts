import { beforeEach, expect, it, vi } from "vitest";
import { ArgumentError, Store as CacheStore, type Store, type StoreOptions } from "../store.js";
import { assertErrorReported } from "../../testing/error-reporter-assertions.js";
import { assert, assertNot, assertRaises, assertSame } from "../../testing/assertions.js";

/** @internal */
export interface CacheStoreBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheStoreBehavior(host: CacheStoreBehaviorHost): void {
  let cache: Store;

  beforeEach(() => {
    cache = host.lookupStore();
  });

  it("should read and write strings", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, "bar")).toBe(true);
    expect(cache.read(key)).toBe("bar");
  });

  it("should overwrite", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, "bar")).toBe(true);
    expect(cache.write(key, "baz")).toBe(true);
    expect(cache.read(key)).toBe("baz");
  });

  it("fetch without cache miss", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, () => "baz")).toBe("bar");
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with cache miss", () => {
    const key = crypto.randomUUID();
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, () => "baz")).toBe("baz");
      expect(write).toHaveBeenCalledWith(key, "baz", cache.options);
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with forced cache miss", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    const read = vi.spyOn(cache, "read");
    const write = vi.spyOn(cache, "write");
    try {
      cache.fetch(key, { force: true }, () => "bar");
      expect(read).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith(key, "bar", { ...cache.options, force: true });
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("fetch with cached nil", () => {
    const key = crypto.randomUUID();
    cache.write(key, null);
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, () => "baz")).toBeNull();
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch cache miss with skip nil", () => {
    const key = crypto.randomUUID();
    const write = vi.spyOn(cache, "write");
    try {
      expect(cache.fetch(key, { skipNil: true }, () => null)).toBeNull();
      expect(cache.exist("foo")).toBe(false);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with forced cache miss with block", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    expect(cache.fetch(key, { force: true }, () => "foo_bar")).toBe("foo_bar");
  });

  it("fetch with forced cache miss without block", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    expect(() => cache.fetch(key, { force: true })).toThrow(ArgumentError);
    expect(cache.read(key)).toBe("bar");
  });

  it("should read and write hash", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, { a: "b" })).toBe(true);
    expect(cache.read(key)).toEqual({ a: "b" });
  });

  it("should read and write integer", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, 1)).toBe(true);
    expect(cache.read(key)).toBe(1);
  });

  it("should read and write nil", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, null)).toBe(true);
    expect(cache.read(key)).toBeNull();
  });

  it("should read and write false", () => {
    const key = crypto.randomUUID();
    expect(cache.write(key, false)).toBe(true);
    expect(cache.read(key)).toBe(false);
  });

  it("read multi", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    const otherKey = crypto.randomUUID();
    cache.write(otherKey, "baz");
    cache.write(crypto.randomUUID(), "biz");
    expect(cache.readMulti(key, otherKey)).toEqual({ [key]: "bar", [otherKey]: "baz" });
  });

  it("read multi empty list", () => {
    expect(cache.readMulti()).toEqual({});
  });

  it("write multi", () => {
    const key = crypto.randomUUID();
    cache.writeMulti({ [`${key}1`]: 1, [`${key}2`]: 2 });
    expect(cache.read(`${key}1`)).toBe(1);
    expect(cache.read(`${key}2`)).toBe(2);
  });

  it("fetch multi", () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    const thirdKey = crypto.randomUUID();
    cache.write(key, "bar");
    cache.write(otherKey, "biz");

    const values = cache.fetchMulti(key, otherKey, thirdKey, (value: string) => value + value);

    expect(values).toEqual({ [key]: "bar", [otherKey]: "biz", [thirdKey]: thirdKey + thirdKey });
    expect(cache.read(thirdKey)).toBe(thirdKey + thirdKey);
  });

  it("fetch multi returns ordered names", () => {
    const key = crypto.randomUUID().toLowerCase();
    const otherKey = crypto.randomUUID().toLowerCase();
    const thirdKey = crypto.randomUUID().toLowerCase();
    cache.write(key, "BAM");

    const values = cache.fetchMulti(otherKey, thirdKey, key, (k: string) => k.toUpperCase());

    expect(Object.keys(values)).toEqual([otherKey, thirdKey, key]);
    expect(Object.values(values)).toEqual([otherKey.toUpperCase(), thirdKey.toUpperCase(), "BAM"]);
  });

  it("fetch multi with forced cache miss", () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    cache.write(key, "bar");

    const values = cache.fetchMulti(key, otherKey, { force: true }, (value: string) =>
      value.concat(value),
    );

    expect(values).toEqual({ [key]: key + key, [otherKey]: otherKey + otherKey });
    expect(cache.read(key)).toEqual(key + key);
    expect(cache.read(otherKey)).toEqual(otherKey + otherKey);
  });

  it("exist", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    expect(cache.exist(key)).toBe(true);
    expect(cache.exist(crypto.randomUUID())).toBe(false);
  });

  it("nil exist", () => {
    const key = crypto.randomUUID();
    cache.write(key, null);
    assert(cache.exist(key));
  });

  it("delete", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    assert(cache.exist(key));
    assertSame(true, cache.delete(key));
    assertNot(cache.exist(key));
  });

  it("delete returns false if not exist", () => {
    const key = crypto.randomUUID();
    assertSame(false, cache.delete(key));
  });

  it("delete multi", () => {
    const key = crypto.randomUUID();
    cache.write(key, "bar");
    assert(cache.exist(key));
    const otherKey = crypto.randomUUID();
    cache.write(otherKey, "world");
    assert(cache.exist(otherKey));
    expect(cache.deleteMulti([key, crypto.randomUUID(), otherKey])).toEqual(2);
    assertNot(cache.exist(key));
    assertNot(cache.exist(otherKey));
  });

  it("delete multi empty list", () => {
    expect(cache.deleteMulti([])).toBe(0);
  });

  it("invalid expiration time raises an error when raise on invalid cache expiration time is true", async () => {
    await withRaiseOnInvalidCacheExpirationTime(true, async () => {
      const key = crypto.randomUUID();
      const error = await assertRaises([ArgumentError], {}, () => {
        cache.write(key, "bar", { expiresIn: -60 });
      });
      assertSame("Cache expiration time is invalid, cannot be negative: -60", error.message);
      assert(cache.read(key) == null);
    });
  });

  it("invalid expiration time reports and logs when raise on invalid cache expiration time is false", async () => {
    await withRaiseOnInvalidCacheExpirationTime(false, async () => {
      const errorMessage = "Cache expiration time is invalid, cannot be negative: -60";
      const report = await assertErrorReported(ArgumentError, () => {
        const logs = captureLogs(() => {
          const key = crypto.randomUUID();
          cache.write(key, "bar", { expiresIn: -60 });
          assertSame("bar", cache.read(key));
        });
        assert(logs.includes(`ArgumentError: ${errorMessage}`));
      });
      assert(report!.error.message.includes(errorMessage));
    });
  });
}

function withRaiseOnInvalidCacheExpirationTime<T>(newValue: boolean, block: () => T): T {
  const oldValue = CacheStore.raiseOnInvalidCacheExpirationTime;
  CacheStore.raiseOnInvalidCacheExpirationTime = newValue;
  try {
    return block();
  } finally {
    CacheStore.raiseOnInvalidCacheExpirationTime = oldValue;
  }
}

function captureLogs(block: () => void): string {
  const oldLogger = CacheStore.logger;
  const log: string[] = [];
  CacheStore.logger = {
    warn: (message) => log.push(message),
    error: (message) => log.push(message),
  };
  try {
    block();
    return log.join("\n");
  } finally {
    CacheStore.logger = oldLogger;
  }
}
