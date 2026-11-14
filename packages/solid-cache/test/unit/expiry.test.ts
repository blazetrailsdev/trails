import { TestCase as ActiveJobTestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { weeks } from "@blazetrails/activesupport";
import { Kernel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Entry, ExpiryJob, Record, type Store } from "../../lib/index.js";
import { useSolidCache, waitForBackgroundTasks } from "../support/test-helper.js";

class ExpiryTest extends ActiveJobTestCase {
  expiry(): void {}
}

describe("SolidCache::ExpiryTest", () => {
  const host = useSolidCache();
  const firstShardKey = "default";
  let cache: Store;
  let t: ActiveJobTestHelper;

  beforeEach(async () => {
    t = new ExpiryTest("expiry") as unknown as ActiveJobTestHelper;
    await t.beforeSetup();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await t.afterTeardown();
  });

  function stubRand(...values: number[]): void {
    let i = 0;
    vi.spyOn(Kernel, "rand").mockImplementation(() => values[Math.min(i++, values.length - 1)]);
  }

  async function shardKeys(cache: Store, shard: string): Promise<string[]> {
    const namespacedKeys: string[] = [];
    for (let i = 0; i < 100; i++) {
      namespacedKeys.push(
        await (
          cache as unknown as { normalizeKey(k: string, o: object): Promise<string> }
        ).normalizeKey(`key${i}`, {}),
      );
    }
    const keys = cache.connections().assign(namespacedKeys).get(shard)!;
    return keys.map((key) => key.replace(`${host.namespace()}:`, ""));
  }

  async function sendEntriesBackInTime(distance: ReturnType<typeof weeks>): Promise<void> {
    await cache.withEachConnection({}, async () => {
      await Entry.uncached(async () => {
        for (const entry of await Entry.all().toArray()) {
          await entry.updateColumns({
            created_at: distance.ago(entry.readAttribute("created_at") as Date),
          });
        }
      });
    });
  }

  async function entryCount(): Promise<number> {
    let count = 0;
    await Record.eachShard(async () => {
      count += await Entry.count();
    });
    return count;
  }

  for (const expiryMethod of ["thread", "job"]) {
    it(`expires old records (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({ expiryBatchSize: 3, maxAge: weeks(2).toI(), expiryMethod });
      const defaultShardKeys = await shardKeys(cache, firstShardKey);
      await cache.write(defaultShardKeys[0], 1);
      await cache.write(defaultShardKeys[1], 2);
      expect(await cache.read(defaultShardKeys[0])).toBe(1);
      expect(await cache.read(defaultShardKeys[1])).toBe(2);

      await sendEntriesBackInTime(weeks(3));

      await cache.write(defaultShardKeys[2], 3);
      await cache.write(defaultShardKeys[3], 4);

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      expect(await cache.read(defaultShardKeys[0])).toBeNull();
      expect(await cache.read(defaultShardKeys[1])).toBeNull();
      expect(await cache.read(defaultShardKeys[2])).toBe(3);
      expect(await cache.read(defaultShardKeys[3])).toBe(4);
    });

    it(`expires records when the cache is full (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({ expiryBatchSize: 3, maxAge: null, maxEntries: 2, expiryMethod });
      const defaultShardKeys = await shardKeys(cache, firstShardKey);
      await cache.write(defaultShardKeys[0], 1);
      await cache.write(defaultShardKeys[1], 2);

      await waitForBackgroundTasks(cache);

      await cache.write(defaultShardKeys[2], 3);
      await cache.write(defaultShardKeys[3], 4);

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      expect(await entryCount()).toBe(1);
    });

    it(`expires records when the cache is full via max_size (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({ expiryBatchSize: 3, maxAge: null, maxSize: 1000, expiryMethod });
      const defaultShardKeys = await shardKeys(cache, firstShardKey);
      await cache.write(defaultShardKeys[0], "a".repeat(350));
      await cache.write(defaultShardKeys[1], "a".repeat(350));

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      await cache.write(defaultShardKeys[2], "a".repeat(350));
      await cache.write(defaultShardKeys[3], "a".repeat(350));

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      expect(await entryCount()).toBeLessThan(4);
    });

    it(`expires records no shards (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({ expiryBatchSize: 3, maxEntries: 2, expiryMethod });
      const defaultShardKeys = await shardKeys(cache, firstShardKey);

      await cache.write(defaultShardKeys[0], 1);
      await cache.write(defaultShardKeys[1], 2);

      await waitForBackgroundTasks(cache);

      await cache.write(defaultShardKeys[2], 3);
      await cache.write(defaultShardKeys[3], 4);

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      expect(await entryCount()).toBe(1);
    });

    it(`expires when random number is below threshold (${expiryMethod})`, async () => {
      stubRand(0.416);

      cache = host.lookupStore({ expiryBatchSize: 3, maxEntries: 1, expiryMethod });
      const defaultShardKeys = await shardKeys(cache, firstShardKey);

      await cache.write(defaultShardKeys[0], 1);
      await cache.write(defaultShardKeys[1], 2);

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      expect(await entryCount()).toBe(0);
    });

    it(`doesn't expire when random number is above threshold (${expiryMethod})`, async () => {
      stubRand(0.417);

      cache = host.lookupStore({ expiryBatchSize: 6, maxEntries: 1, expiryMethod });
      const defaultShardKeys = await shardKeys(cache, firstShardKey);

      await cache.write(defaultShardKeys[0], 1);
      await cache.write(defaultShardKeys[1], 2);

      await waitForBackgroundTasks(cache);
      await t.performEnqueuedJobs();

      expect(await entryCount()).toBe(2);
    });
  }

  it("expires old records with a custom queue", async () => {
    stubRand(0, 1, 0, 1);

    cache = host.lookupStore({
      expiryBatchSize: 3,
      maxEntries: 2,
      expiryMethod: "job",
      expiryQueue: "cache_expiry",
    });

    const defaultShardKeys = await shardKeys(cache, firstShardKey);

    await t.assertEnqueuedJobs(2, { only: ExpiryJob, queue: "cache_expiry" }, async () => {
      await cache.write(defaultShardKeys[0], 1);
      await cache.write(defaultShardKeys[1], 2);
      await cache.write(defaultShardKeys[2], 3);
      await cache.write(defaultShardKeys[2], 4);
    });

    await t.performEnqueuedJobs();
    expect(await entryCount()).toBe(0);
  });

  it("triggers multiple expiry tasks when there are many writes", async () => {
    cache = host.lookupStore({ expiryBatchSize: 20, maxEntries: 2, expiryQueue: "cache_expiry" });
    const background = cache._background;
    const writeMulti = (n: number) =>
      cache.writeMulti(Object.fromEntries(Array.from({ length: n }, (_, i) => [`key${i}`, i])));
    const difference = async (block: () => Promise<void>) => {
      const before = background.scheduledTaskCount;
      await block();
      return background.scheduledTaskCount - before;
    };

    stubRand(0.25, 0.24);
    expect(
      await difference(async () => {
        await writeMulti(8);
        await waitForBackgroundTasks(cache);
      }),
    ).toBe(1);

    expect(
      await difference(async () => {
        await writeMulti(24);
        await waitForBackgroundTasks(cache);
      }),
    ).toBe(3);

    vi.restoreAllMocks();
    stubRand(0.25, 0.24);
    expect(
      await difference(async () => {
        await writeMulti(10);
        await waitForBackgroundTasks(cache);
      }),
    ).toBe(1);

    expect(
      await difference(async () => {
        await writeMulti(10);
        await waitForBackgroundTasks(cache);
      }),
    ).toBe(1);
  });

  it("triggers multiple expiry jobs when there are many writes", async () => {
    cache = host.lookupStore({
      expiryBatchSize: 10,
      maxEntries: 4,
      expiryQueue: "cache_expiry",
      expiryMethod: "job",
    });
    const writeMulti = (n: number) =>
      cache.writeMulti(Object.fromEntries(Array.from({ length: n }, (_, i) => [`key${i}`, i])));

    stubRand(0.25, 0.24);
    await t.assertEnqueuedJobs(2, { only: ExpiryJob }, () => writeMulti(8));

    await t.assertEnqueuedJobs(5, { only: ExpiryJob }, () => writeMulti(24));

    vi.restoreAllMocks();
    stubRand(0.125, 0.124);
    await t.assertEnqueuedJobs(2, { only: ExpiryJob }, () => writeMulti(10));

    await t.assertEnqueuedJobs(2, { only: ExpiryJob }, () => writeMulti(10));
  });
});
