import { beforeEach, describe, expect, it } from "vitest";
import { Entry, SolidCache } from "../../../../../lib/index.js";
import { Estimate } from "../../../../../lib/entry/size/estimate.js";
import { useSolidCache } from "../../../../support/test-helper.js";

describe("SolidCache::EntrySizeEstimateTest", () => {
  useSolidCache();
  let encrypted: boolean;

  beforeEach(() => {
    encrypted = SolidCache.configuration.isEncrypt();
  });

  it("write and read cache entries", async () => {
    expect(await estimate({ samples: 10 })).toBe(0);
  });

  it("gets exact estimate when samples sizes are big enough", async () => {
    await writeEntries({ valueLengths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });

    expect(await estimate({ samples: 12 })).toBe(encrypted ? 3235 : 1535);
    expect(await estimate({ samples: 10 })).toBe(encrypted ? 3235 : 1535);
    expect(await estimate({ samples: 6 })).toBe(encrypted ? 3558 : 1688);
    expect(await estimate({ samples: 5 })).toBe(encrypted ? 3559 : 1689);
  });

  async function writeEntries({ valueLengths }: { valueLengths: number[] }): Promise<void> {
    await Entry.writeMulti(
      valueLengths.map((valueLength, index) => ({
        key: `key${String(index).padStart(5, "0")}`,
        value: "a".repeat(valueLength),
      })),
    );
  }

  async function estimate({ samples }: { samples: number }): Promise<number> {
    return await (await Estimate.new({ samples })).size();
  }
});
