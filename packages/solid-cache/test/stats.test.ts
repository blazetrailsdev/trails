import { minutes, weeks } from "@blazetrails/activesupport";
import { freezeTime, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { Time } from "@blazetrails/date";
import { afterEach, describe, expect, it } from "vitest";
import { Entry, Record } from "../lib/index.js";
import {
  SOLID_CACHE_CONFIG,
  firstShardKey,
  isDefaultDatabase,
  secondShardKey,
  useSolidCache,
} from "./support/test-helper.js";

type StatsValue = { oldestAge: number | null; entries: number | null };

describe("SolidCache::StatsTest", () => {
  const host = useSolidCache();

  afterEach(() => {
    travelBack();
  });

  it.skipIf(!isDefaultDatabase())("stats with entries no shards", async () => {
    const cache = host.lookupStore({
      expiryBatchSize: 2,
      maxAge: weeks(2).toI(),
      maxEntries: 1000,
    });

    const expectedEmpty = {
      connections: 1,
      connectionStats: {
        default: { maxAge: weeks(2).toI(), oldestAge: null, maxEntries: 1000, entries: 0 },
      },
    };

    expect(await cache.stats()).toEqual(expectedEmpty);

    freezeTime();
    await cache.write("foo", 1);
    await cache.write("bar", 1);

    await Record.eachShard(async () => {
      await Entry.updateAll({ created_at: Time.now().minus(minutes(20).toI()) });
    });

    const expectedNotEmpty = {
      connections: 1,
      connectionStats: {
        default: {
          maxAge: weeks(2).toI(),
          oldestAge: minutes(20).toI(),
          maxEntries: 1000,
          entries: 2,
        },
      },
    };
    expect(await cache.stats()).toEqual(expectedNotEmpty);
  });

  it.skipIf(SOLID_CACHE_CONFIG != null)("stats with entries", async () => {
    const cache = host.lookupStore({
      expiryBatchSize: 2,
      maxAge: weeks(2).toI(),
      maxEntries: 1000,
    });

    const emptyStats = { maxAge: weeks(2).toI(), oldestAge: null, maxEntries: 1000, entries: 0 };
    const expectedEmpty = {
      connections: 4,
      connectionStats: {
        primary_shard_one: emptyStats,
        primary_shard_two: emptyStats,
        secondary_shard_one: emptyStats,
        secondary_shard_two: emptyStats,
      },
    };

    expect(await cache.stats()).toEqual(expectedEmpty);

    freezeTime();
    await cache.write("foo", 1);
    await cache.write("bar", 1);

    await Record.eachShard(async () => {
      await Entry.updateAll({ created_at: Time.now().minus(minutes(20).toI()) });
    });

    const stats = await cache.stats();
    const values = Object.values(stats.connectionStats as { [shard: string]: StatsValue });

    expect(Math.min(...values.map((value) => value.oldestAge).filter((age) => age != null))).toBe(
      minutes(20).toI(),
    );
    expect(
      values
        .map((value) => value.entries)
        .filter((entries) => entries != null)
        .reduce((sum, entries) => sum + entries, 0),
    ).toBe(2);
  });

  it.skipIf(SOLID_CACHE_CONFIG != null)("stats one shard", async () => {
    const cache = host.lookupStore({
      expiryBatchSize: 2,
      maxAge: weeks(2).toI(),
      maxEntries: 1000,
      shards: [firstShardKey()],
    });

    const expected = {
      connections: 1,
      connectionStats: {
        [firstShardKey()]: {
          maxAge: weeks(2).toI(),
          oldestAge: null,
          maxEntries: 1000,
          entries: 0,
        },
      },
    };

    expect(await cache.stats()).toEqual(expected);
  });

  it.skipIf(SOLID_CACHE_CONFIG != null)("stats multiple shards", async () => {
    const cache = host.lookupStore({
      expiryBatchSize: 2,
      maxAge: weeks(2).toI(),
      maxEntries: 1000,
      shards: [firstShardKey(), secondShardKey()],
    });

    const shardStats = { maxAge: weeks(2).toI(), oldestAge: null, maxEntries: 1000, entries: 0 };
    const expected = {
      connections: 2,
      connectionStats: { [firstShardKey()]: shardStats, [secondShardKey()]: shardStats },
    };

    expect(await cache.stats()).toEqual(expected);
  });
});
