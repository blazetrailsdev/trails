import { beforeEach, describe, expect, it } from "vitest";
import { Entry, SolidCache } from "../../../../lib/index.js";
import { useSolidCache } from "../../../support/test-helper.js";

describe("SolidCache::EntrySizeTest", () => {
  useSolidCache();
  let encrypted: boolean;

  beforeEach(() => {
    encrypted = SolidCache.configuration.isEncrypt();
  });

  it("write and read cache entries", async () => {
    expect(await Entry.estimatedSize()).toBe(0);
  });

  it("gets exact estimate when samples sizes are big enough", async () => {
    await writeEntries({ valueLengths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });

    expect(await Entry.estimatedSize({ samples: 12 })).toBe(encrypted ? 3235 : 1535);
    expect(await Entry.estimatedSize({ samples: 10 })).toBe(encrypted ? 3918 : 1878);
    expect(await Entry.estimatedSize({ samples: 6 })).toBe(encrypted ? 3922 : 1882);
  });

  async function writeEntries({ valueLengths }: { valueLengths: number[] }): Promise<void> {
    await Entry.writeMulti(
      valueLengths.map((valueLength, index) => ({
        key: `key${String(index).padStart(5, "0")}`,
        value: "a".repeat(valueLength),
      })),
    );
  }
});
