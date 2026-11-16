import { beforeEach, describe, expect, it } from "vitest";
import { Entry, type Store } from "../lib/index.js";
import { firstShardKey, isSingleDatabase, useSolidCache } from "./support/test-helper.js";

describe("QueryCacheTest", () => {
  const host = useSolidCache();
  let cache: Store;

  beforeEach(() => {
    if (isSingleDatabase()) {
      cache = host.lookupStore({ expiresIn: 60 });
      host.lookupStore({ expiresIn: 60 });
    } else {
      cache = host.lookupStore({ expiresIn: 60, shards: [firstShardKey()] });
      host.lookupStore({ expiresIn: 60, shards: [firstShardKey()] });
    }
  });

  it("writes don't clear the AR cache", async () => {
    await Entry.cache(async () => {
      await cache.write(1, "foo");
      expect(await Entry.count()).toBe(1);
      await cache.write(2, "bar");
      expect(await Entry.count()).toBe(1);
    });
    await Entry.uncached(async () => {
      expect(await Entry.count()).toBe(2);
    });
  });

  it("write_multi doesn't clear the AR cache", async () => {
    await Entry.cache(async () => {
      await cache.write(1, "foo");
      expect(await Entry.count()).toBe(1);
      await cache.writeMulti({ "1": "bar", "2": "baz" });
      expect(await Entry.count()).toBe(1);
    });
    await Entry.uncached(async () => {
      expect(await Entry.count()).toBe(2);
    });
  });

  it("deletes don't clear the AR cache", async () => {
    await Entry.cache(async () => {
      await cache.write(1, "foo");
      expect(await Entry.count()).toBe(1);
      await cache.delete(1);
      expect(await Entry.count()).toBe(1);
    });
    await Entry.uncached(async () => {
      expect(await Entry.count()).toBe(0);
    });
  });
});
