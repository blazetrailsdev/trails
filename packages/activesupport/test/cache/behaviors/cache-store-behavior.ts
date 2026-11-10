import { beforeEach, expect, it, vi } from "vitest";
import {
  ArgumentError,
  Store as CacheStore,
  type Store,
  type StoreOptions,
} from "../../../lib/cache/store.js";
import { assertErrorReported } from "../../../lib/testing/error-reporter-assertions.js";
import { assertCalled } from "../../../lib/testing/method-call-assertions.js";
import { travel, travelTo } from "../../../lib/testing/time-helpers.js";
import { plusWithDuration } from "../../../lib/core-ext/time/calculations.js";
import { Duration } from "../../../lib/duration.js";
import { Time } from "@blazetrails/date";
import {
  assert,
  assertIncludes,
  assertNot,
  assertRaises,
  assertSame,
  assertNil,
  assertNothingRaised,
} from "../../../lib/testing/assertions.js";

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

  it("fetch with cache miss passes key to block", async () => {
    let cacheMiss = false;
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 10);
    expect(
      await cache.fetch(key, (key) => {
        cacheMiss = true;
        return key.length;
      }),
    ).toBe(10);
    assert(cacheMiss);

    cacheMiss = false;
    expect(
      await cache.fetch(key, (fetchKey) => {
        cacheMiss = true;
        return fetchKey.length;
      }),
    ).toBe(10);
    assertNot(cacheMiss);
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

  it("read multi with expires", async () => {
    const time = Time.now();
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.write(key, "bar", { expiresIn: 10 });
    await cache.write(otherKey, "baz");
    await cache.write(crypto.randomUUID(), "biz");
    await travelTo(plusWithDuration.call(time, 11), {}, async () => {
      expect(Object.fromEntries(await cache.readMulti(otherKey, crypto.randomUUID()))).toEqual({
        [otherKey]: "baz",
      });
    });
  });

  it("write multi", async () => {
    const key = crypto.randomUUID();
    await cache.writeMulti({ [`${key}1`]: 1, [`${key}2`]: 2 });
    expect(await cache.read(`${key}1`)).toBe(1);
    expect(await cache.read(`${key}2`)).toBe(2);
  });

  it("write multi empty hash", async () => {
    assert(await cache.writeMulti({}));
  });

  it("write multi expires in", async () => {
    const key = crypto.randomUUID();
    await cache.writeMulti({ [key]: 1 }, { expiresIn: 10 });

    await travel(Duration.seconds(11), {}, async () => {
      assertNil(await cache.read(key));
    });
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

  it("fetch multi empty hash", async () => {
    expect(
      Object.fromEntries(
        await cache.fetchMulti(() => {
          throw new Error("Not called");
        }),
      ),
    ).toEqual({});
  });

  it("fetch multi without expires in", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    const thirdKey = crypto.randomUUID();
    await cache.write(key, "bar");
    await cache.write(otherKey, "biz");

    const values = await cache.fetchMulti(
      key,
      thirdKey,
      otherKey,
      { expiresIn: null },
      (value) => `${value}${value}`,
    );

    expect(Object.fromEntries(values)).toEqual({
      [key]: "bar",
      [thirdKey]: thirdKey + thirdKey,
      [otherKey]: "biz",
    });
    expect(await cache.read(thirdKey)).toBe(thirdKey + thirdKey);
  });

  it("fetch multi with objects", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    class CacheStruct {
      constructor(
        private _cacheKey: string,
        private _title: string | null = null,
      ) {}
      cacheKey() {
        return this._cacheKey;
      }
      title() {
        return this._title;
      }
    }
    const foo = new CacheStruct(key, "FOO!");
    const bar = new CacheStruct(otherKey);

    await cache.write(otherKey, "BAM!");

    const values = await cache.fetchMulti(foo, bar, (object) => (object as CacheStruct).title());

    expect(values).toEqual(
      new Map<unknown, unknown>([
        [foo, "FOO!"],
        [bar, "BAM!"],
      ]),
    );
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

  it("fetch multi without block", async () => {
    await assertRaises([ArgumentError], {}, async () => {
      await (cache.fetchMulti as (...args: unknown[]) => Promise<unknown>)(crypto.randomUUID());
    });
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

  it("fetch multi with skip nil", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();

    const values = await cache.fetchMulti(key, otherKey, { skipNil: true }, (k) =>
      k === key ? k : null,
    );

    expect(Object.fromEntries(values)).toEqual({ [key]: key, [otherKey]: null });
    expect(await cache.exist(otherKey)).toBe(false);
  });

  it("fetch multi uses write multi entries store provider interface", async () => {
    await assertCalled(
      cache as unknown as { writeMultiEntries: unknown },
      "writeMultiEntries",
      null,
      {},
      async () => {
        await cache.fetchMulti("a", "b", "c", (key) => `${key}${key}`);
      },
    );
  });

  it("cache key", async () => {
    const key = crypto.randomUUID();
    const klass = class {
      constructor(private key: string) {}
      cacheKey() {
        return this.key;
      }
    };
    await cache.write(new klass(key), "bar");
    expect(await cache.read(key)).toBe("bar");
  });

  it("param as cache key", async () => {
    const key = crypto.randomUUID();
    const klass = class {
      constructor(private key: string) {}
      toParam() {
        return this.key;
      }
    };
    await cache.write(new klass(key), "bar");
    expect(await cache.read(key)).toBe("bar");
  });

  it("unversioned cache key", async () => {
    const key = crypto.randomUUID();
    const klass = class {
      constructor(private key: string) {}
      cacheKey() {
        return this.key;
      }
      cacheKeyWithVersion() {
        return `${this.key}-v1`;
      }
    };
    await cache.write(new klass(key), "bar");
    expect(await cache.read(key)).toBe("bar");
  });

  it("array as cache key", async () => {
    const key = crypto.randomUUID();
    await cache.write([key, "foo"], "bar");
    expect(await cache.read(`${key}/foo`)).toBe("bar");
  });

  it("array with single instance as cache key uses cache key method", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    const testInstanceOne = new InstanceTest(key, 1);
    const testInstanceTwo = new InstanceTest(otherKey, 2);

    await cache.write([testInstanceOne], "one");
    await cache.write([testInstanceTwo], "two");

    expect(await cache.read([testInstanceOne])).toBe("one");
    expect(await cache.read([testInstanceTwo])).toBe("two");
  });

  it("array with multiple instances as cache key uses cache key method", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    const thirdKey = crypto.randomUUID();
    const testInstanceOne = new InstanceTest(key, 1);
    const testInstanceTwo = new InstanceTest(otherKey, 2);
    const testInstanceThree = new InstanceTest(thirdKey, 3);

    await cache.write([testInstanceOne, testInstanceThree], "one");
    await cache.write([testInstanceTwo, testInstanceThree], "two");

    expect(await cache.read([testInstanceOne, testInstanceThree])).toBe("one");
    expect(await cache.read([testInstanceTwo, testInstanceThree])).toBe("two");
  });

  it("format of expanded key for single instance", async () => {
    const key = crypto.randomUUID();
    const testInstanceOne = new InstanceTest(key, 1);

    const expandedKey = await cache["expandedKey"](testInstanceOne);

    expect(expandedKey).toEqual(testInstanceOne.cacheKey());
  });

  it("format of expanded key for single instance in array", async () => {
    const key = crypto.randomUUID();
    const testInstanceOne = new InstanceTest(key, 1);

    const expandedKey = await cache["expandedKey"]([testInstanceOne]);

    expect(expandedKey).toEqual(testInstanceOne.cacheKey());
  });

  it("hash as cache key", async () => {
    const key = crypto.randomUUID();
    const otherKey = crypto.randomUUID();
    await cache.write({ [key]: 1, [otherKey]: 2 }, "bar");
    expect(await cache.read({ [key]: 1, [otherKey]: 2 })).toBe("bar");
  });

  it("keys are case sensitive", async () => {
    const key = "case_sensitive_key";
    await cache.write(key, "bar");
    assertNil(await cache.read(key.toUpperCase()));
  });

  it("blank key", async () => {
    const invalidKeys = [null, "", [], {}];
    for (const key of invalidKeys) {
      await assertRaises([ArgumentError], {}, () => cache.write(key, "bar"));
      await assertRaises([ArgumentError], {}, () => cache.read(key));
      await assertRaises([ArgumentError], {}, () => cache.delete(key));
    }

    const validKeys = ["foo", ["bar"], { foo: "bar" }, 0, 1, new InstanceTest("foo", 2)];
    for (const key of validKeys) {
      await assertNothingRaised(() => cache.write(key, "bar"));
      await assertNothingRaised(() => cache.read(key));
      await assertNothingRaised(() => cache.delete(key));
    }
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

class InstanceTest {
  constructor(
    public name: string,
    public id: number,
  ) {}

  cacheKey(): string {
    return `${this.name}/${this.id}`;
  }

  toParam(): string {
    return "hello";
  }
}
