import { beforeEach, expect, it as vitestIt } from "vitest";
import { Time } from "@blazetrails/date";
import { NotImplementedError, rbModName } from "@blazetrails/ruby-compat";
import type { Store, StoreOptions } from "../../../lib/cache/store.js";
import type { LocalStore } from "../../../lib/cache/strategy/local-cache.js";
import type { Middleware } from "../../../lib/cache/strategy/local-cache-middleware.js";
import { plusWithDuration } from "../../../lib/core-ext/time/calculations.js";
import { Notifications } from "../../../lib/notifications.js";
import type { Event } from "../../../lib/notifications/instrumenter.js";
import { assert, assertNil, assertNot } from "../../../lib/testing/assertions.js";
import { travelTo } from "../../../lib/testing/time-helpers.js";

/** @internal */
export interface LocalCacheBehaviorHost {
  lookupStore(options?: StoreOptions): Store;
  overriddenTests?: string[];
}

interface LocalCacheStore {
  withLocalCache<T>(block: () => T | Promise<T>): Promise<T>;
  localCache(): LocalStore | null | undefined;
  bypassLocalCache<T>(block: () => T | Promise<T>): Promise<T>;
  middleware(): Middleware;
}

function alphanumeric(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export function localCacheBehavior(host?: LocalCacheBehaviorHost): void {
  const base = host ? vitestIt : vitestIt.skip;
  const it = (name: string, fn: () => Promise<void>) =>
    host?.overriddenTests?.includes(name) ? undefined : base(name, fn);
  let cache: Store & LocalCacheStore;
  let peek: Store;

  beforeEach(() => {
    if (!host) return;
    cache = host.lookupStore({ expiresIn: 60 }) as Store & LocalCacheStore;
    peek = host.lookupStore({ expiresIn: 60 });
  });

  async function withInstrumentation(method: string, block: () => unknown): Promise<Event[]> {
    const eventName = `cache_${method}.active_support`;
    const events: Event[] = [];
    try {
      Notifications.subscribe(eventName, (event) => events.push(event));
      await block();
      return events;
    } finally {
      Notifications.unsubscribe(eventName);
    }
  }

  it("instrumentation with local cache", async () => {
    const key = crypto.randomUUID();
    let events = await withInstrumentation("write", () => cache.write(key, crypto.randomUUID()));
    expect(events[0].payload.store).toBe(cache.constructor.name);

    await cache.withLocalCache(async () => {
      events = await withInstrumentation("read", async () => {
        await cache.read(key);
        await cache.read(key);
      });

      const expected = [cache.constructor.name, rbModName(cache.localCache()!.constructor)];
      expect(events.map((p) => p.payload.store)).toEqual(expected);
    });
  });

  it("local writes are persistent on the remote cache", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    const retval = await cache.withLocalCache(() => cache.write(key, value));
    assert(retval);
    expect(await cache.read(key)).toBe(value);
  });

  it("clear also clears local cache", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.write(key, alphanumeric());
      await cache.clear();
      assertNil(await cache.read(key));
    });

    assertNil(await cache.read(key));
  });

  it("clear with nil options", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.write(key, alphanumeric());
      await cache.clear(null as unknown as undefined);
      assertNil(await cache.read(key));
    });

    assertNil(await cache.read(key));
  });

  it("cleanup clears local cache but not remote cache", async () => {
    try {
      await cache.cleanup();
    } catch (error) {
      if (error instanceof NotImplementedError) return;
      throw error;
    }

    const key = crypto.randomUUID();
    const value = alphanumeric();
    const otherValue = alphanumeric();

    await cache.withLocalCache(async () => {
      await cache.write(key, value);
      expect(await cache.read(key)).toBe(value);

      await cache.bypassLocalCache(() => cache.write(key, otherValue));
      expect(await cache.read(key)).toBe(value);

      await cache.cleanup();
      expect(await cache.read(key)).toBe(otherValue);
    });
  });

  it("local cache of write", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      await cache.write(key, value);
      await peek.delete(key);
      expect(await cache.read(key)).toBe(value);
    });
  });

  it("local cache of read returns a copy of the entry", async () => {
    const key = alphanumeric();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      await cache.write(key, { type: value });
      const localValue = (await cache.read(key)) as { type?: string };
      expect(localValue.type).toBe(value);
      delete localValue.type;
      expect(await cache.read(key)).toEqual({ type: value });
    });
  });

  it("local cache of read", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.write(key, value);
    await cache.withLocalCache(async () => {
      expect(await cache.read(key)).toBe(value);
    });
  });

  it("local cache of read nil", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      assertNil(await cache.read(key));
      await cache.bypassLocalCache(() => cache.write(key, value));
      assertNil(await cache.read(key));
    });
  });

  it("local cache fetch", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      cache.localCache()!.writeEntry(key, value);
      expect(await cache.localCache()!.fetchEntry(key)).toBe(value);
    });
  });

  it("local cache fetch on miss", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      expect(await cache.exist(key)).toBe(false);
      const value = await cache.fetch(key, () => "fetch-yielded");
      expect(value).toBe("fetch-yielded");

      expect(await peek.read(key)).toBe("fetch-yielded");
    });
  });

  it("local cache of write nil", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      assert(await cache.write(key, null));
      assertNil(await cache.read(key));
      await peek.write(key, value);
      assertNil(await cache.read(key));
    });
  });

  it("local cache of write with unless exist", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      await cache.write(key, value);
      await cache.write(key, alphanumeric(), { unlessExist: true });
      expect(await cache.read(key)).toBe(await peek.read(key));
    });
  });

  it("local cache of delete", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.write(key, alphanumeric());
      await cache.delete(key);
      assertNil(await cache.read(key));
    });
  });

  it("local cache of delete matched", async () => {
    try {
      await cache.deleteMatched("*");
    } catch (error) {
      if (error instanceof NotImplementedError) return;
      throw error;
    }

    const prefix = alphanumeric();
    const key = `${prefix}${crypto.randomUUID()}`;
    const otherKey = `${prefix}${crypto.randomUUID()}`;
    const thirdKey = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      await cache.write(key, alphanumeric());
      await cache.write(otherKey, alphanumeric());
      await cache.write(thirdKey, value);
      await cache.deleteMatched(`${prefix}*`);
      assertNot(await cache.exist(key));
      assertNot(await cache.exist(otherKey));
      expect(await cache.read(thirdKey)).toBe(value);
    });
  });

  it("local cache of exist", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.write(key, alphanumeric());
      await peek.delete(key);
      assert(await cache.exist(key));
    });
  });

  it("local cache of increment", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.write(key, 1, { raw: true });
      await peek.write(key, 2, { raw: true });

      await cache.increment(key);

      const expected = await peek.read(key, { raw: true });
      expect(Number(expected)).toBe(3);
      expect(await cache.read(key, { raw: true })).toEqual(expected);
    });
  });

  it("local cache of decrement", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      await cache.write(key, 1, { raw: true });
      await peek.write(key, 3, { raw: true });

      await cache.decrement(key);

      const expected = await peek.read(key, { raw: true });
      expect(Number(expected)).toBe(2);
      expect(await cache.read(key, { raw: true })).toEqual(expected);
    });
  });

  it("local cache of fetch multi", async () => {
    const existingKey = crypto.randomUUID();
    const knownMissingKey = crypto.randomUUID();
    const unknownKey = crypto.randomUUID();

    await cache.withLocalCache(async () => {
      await cache.fetch(existingKey, () => "exist");
      expect(await cache.exist("known-missing")).toBe(false);

      let results = await cache.fetchMulti(
        knownMissingKey,
        existingKey,
        unknownKey,
        () => "fetch-yielded",
      );
      const expected = {
        [knownMissingKey]: "fetch-yielded",
        [existingKey]: "exist",
        [unknownKey]: "fetch-yielded",
      };
      expect(Object.fromEntries(results)).toEqual(expected);

      results = await peek.readMulti(knownMissingKey, existingKey, unknownKey);
      expect(Object.fromEntries(results)).toEqual(expected);
    });
  });

  it("local cache of read multi", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    const otherKey = crypto.randomUUID();
    const otherValue = alphanumeric();
    await cache.withLocalCache(async () => {
      await cache.write(key, value, { raw: true });
      await peek.write(otherKey, otherValue, { raw: true });
      const values = await cache.readMulti(key, otherKey, { raw: true });
      expect(await cache.read(key, { raw: true })).toBe(value);
      expect(await cache.read(otherKey, { raw: true })).toBe(otherValue);
      expect(values.get(key)).toBe(value);
      expect(values.get(otherKey)).toBe(otherValue);
    });
  });

  it("local cache of read multi with expiry", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    await cache.withLocalCache(async () => {
      const time = Time.now();
      await cache.write(key, value, { expiresIn: 60 });
      expect((await cache.readMulti(key)).get(key)).toBe(value);
      await travelTo(plusWithDuration.call(time, 61), {}, async () => {
        assertNil((await cache.readMulti(key)).get(key));
      });
    });
  });

  it("local cache of read multi with versions", async () => {
    await cache.withLocalCache(async () => {
      const thing = { toParam: () => "1", cacheVersion: "1" as string };
      const key = ["foo", thing];

      await cache.write(key, "contents");

      expect(await cache.read(key)).toBe("contents");
      expect((await cache.readMulti(key)).get(key)).toBe("contents");

      thing.cacheVersion = "002";
      assertNil(await cache.read(key));
      assertNil((await cache.readMulti(key)).get(key));
    });
  });

  it("local cache of read multi prioritizes local entries", async () => {
    const key = `key${Math.random()}`;
    await cache.withLocalCache(async () => {
      await cache.write(key, "foo");
      await cache.bypassLocalCache(() => cache.write(key, "bar"));

      expect(Object.fromEntries(await cache.readMulti(key))).toEqual({ [key]: "foo" });
    });
  });

  it("initial object mutation after write", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      const initial = ["bar"];
      await cache.write(key, initial);
      initial.push("baz");
      expect(await cache.read(key)).toEqual(["bar"]);
    });
  });

  it("initial object mutation after fetch", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      const initial = ["bar"];
      await cache.fetch(key, () => initial);
      initial.push("baz");
      expect(await cache.read(key)).toEqual(["bar"]);
      expect(await cache.fetch(key)).toEqual(["bar"]);
    });
  });

  it("middleware", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    let app: Parameters<Middleware["new"]>[0] = async () => {
      const result = await cache.write(key, value);
      expect(await cache.read(key)).toBe(value);
      expect(result).toBeTruthy();
      return [200, {}, []];
    };
    app = cache.middleware().new(app);
    await app.call({});
  });

  it("local race condition protection", async () => {
    const key = crypto.randomUUID();
    const value = alphanumeric();
    const otherValue = alphanumeric();
    await cache.withLocalCache(async () => {
      const time = Time.now();
      await cache.write(key, value, { expiresIn: 60 });
      await travelTo(plusWithDuration.call(time, 61), {}, async () => {
        const result = await cache.fetch(key, { raceConditionTtl: 10 }, async () => {
          expect(await cache.read(key)).toBe(value);
          return otherValue;
        });
        expect(result).toBe(otherValue);
      });
    });
  });

  it("local cache should read and write false", async () => {
    const key = crypto.randomUUID();
    await cache.withLocalCache(async () => {
      assert(await cache.write(key, false));
      expect(await cache.read(key)).toBe(false);
    });
  });

  it("local cache should deserialize entries on multi get", async () => {
    const keys = Array.from({ length: 5 }, () => crypto.randomUUID());
    const values = Object.fromEntries(keys.map((k) => [k, true]));
    await cache.withLocalCache(async () => {
      assert(await cache.writeMulti(values));
      expect(Object.fromEntries(await cache.readMulti(...keys))).toEqual(values);
    });
  });
}
