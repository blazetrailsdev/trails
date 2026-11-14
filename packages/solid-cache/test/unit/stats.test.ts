import { minutes, weeks } from "@blazetrails/activesupport";
import { freezeTime, travelBack } from "@blazetrails/activesupport/testing/time-helpers";
import { Time } from "@blazetrails/date";
import { afterEach, describe, expect, it } from "vitest";
import { Entry, Record } from "../../lib/index.js";
import { useSolidCache } from "../support/test-helper.js";

describe("SolidCache::StatsTest", () => {
  const host = useSolidCache();

  afterEach(() => {
    travelBack();
  });

  it("stats with entries no shards", async () => {
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
});
