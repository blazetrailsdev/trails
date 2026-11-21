import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { TestCase as ActiveJobTestCase } from "@blazetrails/activejob/test-case";
import type { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { weeks } from "@blazetrails/activesupport";
import { Kernel } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Entry, ExpiryJob, Record, type Store } from "../lib/index.js";
import {
  firstShardKey,
  isDefaultDatabase,
  isSingleDatabase,
  secondShardKey,
  useSolidCache,
  waitForBackgroundTasks,
} from "./support/test-helper.js";

class ExpiryTest extends ActiveJobTestCase {
  expiry(): void {}
}

describe("SolidCache::ExpiryTest", () => {
  const host = useSolidCache();
  let cache: Store;
  let t: ActiveJobTestHelper;
  let singleShardCluster: { shards?: string[] };

  beforeEach(async () => {
    singleShardCluster = isDefaultDatabase() ? {} : { shards: [firstShardKey()] };
    t = new ExpiryTest("expiry");
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

  async function write(keys: string[], ...pairs: [number, unknown][]): Promise<void> {
    for (const [i, value] of pairs) await cache.write(keys[i], value);
  }

  function writeMulti(n: number): Promise<unknown> {
    return cache.writeMulti(
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`key${i}`, i])),
    );
  }

  async function drain(): Promise<void> {
    await waitForBackgroundTasks(cache);
    await t.performEnqueuedJobs();
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
      const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
      await write(defaultShardKeys, [0, 1], [1, 2]);
      expect(await cache.read(defaultShardKeys[0])).toBe(1);
      expect(await cache.read(defaultShardKeys[1])).toBe(2);

      await sendEntriesBackInTime(weeks(3));
      await write(defaultShardKeys, [2, 3], [3, 4]);

      await drain();

      expect(await cache.read(defaultShardKeys[0])).toBeNull();
      expect(await cache.read(defaultShardKeys[1])).toBeNull();
      expect(await cache.read(defaultShardKeys[2])).toBe(3);
      expect(await cache.read(defaultShardKeys[3])).toBe(4);
    });

    it(`expires records when the cache is full (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({ expiryBatchSize: 3, maxAge: null, maxEntries: 2, expiryMethod });
      const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
      await write(defaultShardKeys, [0, 1], [1, 2]);

      await waitForBackgroundTasks(cache);
      await write(defaultShardKeys, [2, 3], [3, 4]);

      await drain();

      expect(await entryCount()).toBe(1);
    });

    it(`expires records when the cache is full via max_size (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({ expiryBatchSize: 3, maxAge: null, maxSize: 1000, expiryMethod });
      const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
      await write(defaultShardKeys, [0, "a".repeat(350)], [1, "a".repeat(350)]);

      await drain();
      await write(defaultShardKeys, [2, "a".repeat(350)], [3, "a".repeat(350)]);

      await drain();

      expect(await entryCount()).toBeLessThan(4);
    });

    it(`expires records no shards (${expiryMethod})`, async () => {
      stubRand(0);

      cache = host.lookupStore({
        expiryBatchSize: 3,
        maxEntries: 2,
        expiryMethod,
        ...singleShardCluster,
      });
      const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
      await write(defaultShardKeys, [0, 1], [1, 2]);

      await waitForBackgroundTasks(cache);
      await write(defaultShardKeys, [2, 3], [3, 4]);

      await drain();

      expect(await entryCount()).toBe(1);
    });

    it(`expires when random number is below threshold (${expiryMethod})`, async () => {
      stubRand(0.416);

      cache = host.lookupStore({ expiryBatchSize: 3, maxEntries: 1, expiryMethod });
      const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
      await write(defaultShardKeys, [0, 1], [1, 2]);

      await drain();

      expect(await entryCount()).toBe(0);
    });

    it(`doesn't expire when random number is above threshold (${expiryMethod})`, async () => {
      stubRand(0.417);

      cache = host.lookupStore({ expiryBatchSize: 6, maxEntries: 1, expiryMethod });
      const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
      await write(defaultShardKeys, [0, 1], [1, 2]);

      await drain();

      expect(await entryCount()).toBe(2);
    });

    it.skipIf(isSingleDatabase())(
      `expires old records multiple shards (${expiryMethod})`,
      async () => {
        stubRand(0, 1, 0, 1, 0, 1, 0, 1);
        cache = host.lookupStore({
          expiryBatchSize: 2,
          shards: [firstShardKey(), secondShardKey()],
          expiryMethod,
        });
        const defaultShardKeys = await host.shardKeys(cache, firstShardKey());
        const shardOneKeys = await host.shardKeys(cache, secondShardKey());

        await write(defaultShardKeys, [0, 1], [1, 2]);
        await write(shardOneKeys, [0, 3], [1, 4]);

        expect(await cache.read(defaultShardKeys[0])).toBe(1);
        expect(await cache.read(defaultShardKeys[1])).toBe(2);
        expect(await cache.read(shardOneKeys[0])).toBe(3);
        expect(await cache.read(shardOneKeys[1])).toBe(4);

        await waitForBackgroundTasks(cache);
        await sendEntriesBackInTime(weeks(3));

        await write(defaultShardKeys, [2, 5], [3, 6]);
        await write(shardOneKeys, [2, 7], [3, 8]);

        await drain();

        expect(await cache.read(defaultShardKeys[0])).toBeNull();
        expect(await cache.read(defaultShardKeys[1])).toBeNull();
        expect(await cache.read(shardOneKeys[0])).toBeNull();
        expect(await cache.read(shardOneKeys[1])).toBeNull();
        expect(await cache.read(defaultShardKeys[2])).toBe(5);
        expect(await cache.read(defaultShardKeys[3])).toBe(6);
        expect(await cache.read(shardOneKeys[2])).toBe(7);
        expect(await cache.read(shardOneKeys[3])).toBe(8);

        for (const shard of [firstShardKey(), "primary_shard_one"]) {
          await Record.connectedTo({ shard }, async () => {
            expect(await Entry.count()).toBe(2);
          });
        }
      },
    );
  }

  it("expires old records with a custom queue", async () => {
    stubRand(0, 1, 0, 1);

    cache = host.lookupStore({
      expiryBatchSize: 3,
      maxEntries: 2,
      expiryMethod: "job",
      expiryQueue: "cache_expiry",
    });

    const defaultShardKeys = await host.shardKeys(cache, firstShardKey());

    await t.assertEnqueuedJobs(2, { only: ExpiryJob, queue: "cache_expiry" }, async () => {
      await write(defaultShardKeys, [0, 1], [1, 2], [2, 3], [2, 4]);
    });

    await t.performEnqueuedJobs();
    expect(await entryCount()).toBe(0);
  });

  it("triggers multiple expiry tasks when there are many writes", async () => {
    cache = host.lookupStore({
      expiryBatchSize: 20,
      maxEntries: 2,
      expiryQueue: "cache_expiry",
      ...singleShardCluster,
    });
    const background = cache._background;

    stubRand(0.25, 0.24);
    await assertDifference(
      () => background.scheduledTaskCount,
      1,
      null,
      async () => {
        await writeMulti(8);
        await waitForBackgroundTasks(cache);
      },
    );

    await assertDifference(
      () => background.scheduledTaskCount,
      3,
      null,
      async () => {
        await writeMulti(24);
        await waitForBackgroundTasks(cache);
      },
    );

    vi.restoreAllMocks();
    stubRand(0.25, 0.24);
    await assertDifference(
      () => background.scheduledTaskCount,
      1,
      null,
      async () => {
        await writeMulti(10);
        await waitForBackgroundTasks(cache);
      },
    );

    await assertDifference(
      () => background.scheduledTaskCount,
      1,
      null,
      async () => {
        await writeMulti(10);
        await waitForBackgroundTasks(cache);
      },
    );
  });

  it("triggers multiple expiry jobs when there are many writes", async () => {
    cache = host.lookupStore({
      expiryBatchSize: 10,
      maxEntries: 4,
      expiryQueue: "cache_expiry",
      expiryMethod: "job",
      ...singleShardCluster,
    });
    stubRand(0.25, 0.24);
    await t.assertEnqueuedJobs(2, { only: ExpiryJob }, () => writeMulti(8));

    await t.assertEnqueuedJobs(5, { only: ExpiryJob }, () => writeMulti(24));

    vi.restoreAllMocks();
    stubRand(0.125, 0.124);
    await t.assertEnqueuedJobs(2, { only: ExpiryJob }, () => writeMulti(10));

    await t.assertEnqueuedJobs(2, { only: ExpiryJob }, () => writeMulti(10));
  });
});
