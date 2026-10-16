import { beforeEach, expect, it, vi } from "vitest";
import { ArgumentError, Store as CacheStore, type Store, type StoreOptions } from "../store.js";
import { assertErrorReported } from "../../testing/error-reporter-assertions.js";
import {
  assert,
  assertIncludes,
  assertNot,
  assertRaises,
  assertSame,
  assertNil,
} from "../../testing/assertions.js";

/** @internal */
export interface CacheStoreBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
}

export function cacheStoreBehavior(host: CacheStoreBehaviorHost): void {
  let cache: Store;

  beforeEach(async () => {
    cache = host.lookupStore();
  });

  it("should read and write strings", async () => {
    const key = crypto.randomUUID();
    expect(await cache.write(key, "bar")).toBe(true);
    expect(await cache.read(key)).toBe("bar");
  });

  it("should overwrite", async () => {
    const key = crypto.randomUUID();
    expect(await cache.write(key, "bar")).toBe(true);
    expect(await cache.write(key, "baz")).toBe(true);
    expect(await cache.read(key)).toBe("baz");
  });

  it("fetch without cache miss", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    const write = vi.spyOn(cache, "write");
    try {
      expect(await cache.fetch(key, () => "baz")).toBe("bar");
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with cache miss", async () => {
    const key = crypto.randomUUID();
    const write = vi.spyOn(cache, "write");
    try {
      expect(await cache.fetch(key, () => "baz")).toBe("baz");
      expect(write).toHaveBeenCalledWith(key, "baz", cache.options);
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with forced cache miss", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    const read = vi.spyOn(cache, "read");
    const write = vi.spyOn(cache, "write");
    try {
      await cache.fetch(key, { force: true }, () => "bar");
      expect(read).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith(key, "bar", { ...cache.options, force: true });
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it("fetch with cached nil", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, null);
    const write = vi.spyOn(cache, "write");
    try {
      assertNil(await cache.fetch(key, () => "baz"));
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch cache miss with skip nil", async () => {
    const key = crypto.randomUUID();
    const write = vi.spyOn(cache, "write");
    try {
      assertNil(await cache.fetch(key, { skipNil: true }, () => null));
      expect(await cache.exist("foo")).toBe(false);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });

  it("fetch with forced cache miss with block", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    expect(await cache.fetch(key, { force: true }, () => "foo_bar")).toBe("foo_bar");
  });

  it("fetch with forced cache miss without block", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    await expect(cache.fetch(key, { force: true })).rejects.toThrow(ArgumentError);
    expect(await cache.read(key)).toBe("bar");
  });

  it("should read and write hash", async () => {
    const key = crypto.randomUUID();
    expect(await cache.write(key, { a: "b" })).toBe(true);
    expect(await cache.read(key)).toEqual({ a: "b" });
  });

  it("should read and write integer", async () => {
    const key = crypto.randomUUID();
    expect(await cache.write(key, 1)).toBe(true);
    expect(await cache.read(key)).toBe(1);
  });

  it("should read and write nil", async () => {
    const key = crypto.randomUUID();
    expect(await cache.write(key, null)).toBe(true);
    assertNil(await cache.read(key));
  });

  it("should read and write false", async () => {
    const key = crypto.randomUUID();
    expect(await cache.write(key, false)).toBe(true);
    expect(await cache.read(key)).toBe(false);
  });

  it("read multi", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    const otherKey = crypto.randomUUID();
    await cache.write(otherKey, "baz");
    await cache.write(crypto.randomUUID(), "biz");
    expect(Object.fromEntries(await cache.readMulti(key, otherKey))).toEqual({
      [key]: "bar",
      [otherKey]: "baz",
    });
  });

  it("read multi empty list", async () => {
    expect(Object.fromEntries(await cache.readMulti())).toEqual({});
  });

  it("write multi", async () => {
    const key = crypto.randomUUID();
    await cache.writeMulti({ [`${key}1`]: 1, [`${key}2`]: 2 });
    expect(await cache.read(`${key}1`)).toBe(1);
    expect(await cache.read(`${key}2`)).toBe(2);
  });

  it("fetch multi", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    const thirdKey = crypto.randomUUID();
    await cache.write(key, "bar");
    await cache.write(otherKey, "biz");

    const values = await cache.fetchMulti(key, otherKey, thirdKey, (value) => `${value}${value}`);

    expect(Object.fromEntries(values)).toEqual({
      [key]: "bar",
      [otherKey]: "biz",
      [thirdKey]: thirdKey + thirdKey,
    });
    expect(await cache.read(thirdKey)).toBe(thirdKey + thirdKey);
  });

  it("fetch multi returns ordered names", async () => {
    const key = crypto.randomUUID().toLowerCase();
    const otherKey = crypto.randomUUID().toLowerCase();
    const thirdKey = crypto.randomUUID().toLowerCase();
    await cache.write(key, "BAM");

    const values = await cache.fetchMulti(otherKey, thirdKey, key, (k) =>
      (k as string).toUpperCase(),
    );

    expect([...values.keys()]).toEqual([otherKey, thirdKey, key]);
    expect([...values.values()]).toEqual([otherKey.toUpperCase(), thirdKey.toUpperCase(), "BAM"]);
  });

  it("fetch multi with forced cache miss", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.write(key, "bar");

    const values = await cache.fetchMulti(key, otherKey, { force: true }, (value) =>
      (value as string).concat(value as string),
    );

    expect(Object.fromEntries(values)).toEqual({
      [key]: key + key,
      [otherKey]: otherKey + otherKey,
    });
    expect(await cache.read(key)).toEqual(key + key);
    expect(await cache.read(otherKey)).toEqual(otherKey + otherKey);
  });

  it("exist", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    expect(await cache.exist(key)).toBe(true);
    expect(await cache.exist(crypto.randomUUID())).toBe(false);
  });

  it("nil exist", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, null);
    assert(await cache.exist(key));
  });

  it("delete", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    assert(await cache.exist(key));
    assertSame(true, await cache.delete(key));
    assertNot(await cache.exist(key));
  });

  it("delete returns false if not exist", async () => {
    const key = crypto.randomUUID();
    assertSame(false, await cache.delete(key));
  });

  it("delete multi", async () => {
    const key = crypto.randomUUID();
    await cache.write(key, "bar");
    assert(await cache.exist(key));
    const otherKey = crypto.randomUUID();
    await cache.write(otherKey, "world");
    assert(await cache.exist(otherKey));
    expect(await cache.deleteMulti([key, crypto.randomUUID(), otherKey])).toEqual(2);
    assertNot(await cache.exist(key));
    assertNot(await cache.exist(otherKey));
  });

  it("delete multi empty list", async () => {
    expect(await cache.deleteMulti([])).toBe(0);
  });

  it("invalid expiration time raises an error when raise on invalid cache expiration time is true", async () => {
    await withRaiseOnInvalidCacheExpirationTime(true, async () => {
      const key = crypto.randomUUID();
      const error = await assertRaises([ArgumentError], {}, async () => {
        await cache.write(key, "bar", { expiresIn: -60 });
      });
      assertSame("Cache expiration time is invalid, cannot be negative: -60", error.message);
      assertNil(await cache.read(key));
    });
  });

  it("invalid expiration time reports and logs when raise on invalid cache expiration time is false", async () => {
    await withRaiseOnInvalidCacheExpirationTime(false, async () => {
      const errorMessage = "Cache expiration time is invalid, cannot be negative: -60";
      const report = await assertErrorReported(ArgumentError, async () => {
        const logs = await captureLogs(async () => {
          const key = crypto.randomUUID();
          await cache.write(key, "bar", { expiresIn: -60 });
          assertSame("bar", await cache.read(key));
        });
        assertIncludes(logs, `ArgumentError: ${errorMessage}`);
      });
      assertIncludes(report!.error.message, errorMessage);
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

async function captureLogs(block: () => unknown): Promise<string> {
  const oldLogger = CacheStore.logger;
  const log: string[] = [];
  CacheStore.logger = {
    warn: (message) => log.push(message),
    error: (message) => log.push(message),
  };
  try {
    await block();
    return log.join("\n");
  } finally {
    CacheStore.logger = oldLogger;
  }
}
