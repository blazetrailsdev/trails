import { Kernel } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Entry, SolidCache } from "../../../../../lib/index.js";
import { Estimate } from "../../../../../lib/entry/size/estimate.js";
import { useSolidCache } from "../../../../support/test-helper.js";

describe("EntrySizeEstimateTest", () => {
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

  it("test larger sample estimates", async () => {
    const valuesLengths = await withFixedSrand(1, () =>
      Array.from({ length: 1000 }, () => Math.trunc((Kernel.rand() as number) ** 2 * 1000)),
    );
    await writeEntries({ valueLengths: valuesLengths });

    expect(await estimate({ samples: 1000 })).toBe(encrypted ? 651257 : 481257);
    expect(await estimate({ samples: 500 })).toBe(encrypted ? 651832 : 481662);
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 100 })).toBe(encrypted ? 680804 : 501624);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 50 })).toBe(encrypted ? 660541 : 477621);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 10 })).toBe(encrypted ? 692368 : 471878);
    });
  });

  it("test with gaps in records estimates", async () => {
    const valuesLengths = await withFixedSrand(1, () =>
      Array.from({ length: 1000 }, () => Math.trunc((Kernel.rand() as number) ** 2 * 1000)),
    );
    await writeEntries({ valueLengths: valuesLengths });
    const firstMod = ((await Entry.first()) as Entry).id % 3;
    await Entry.where(`id % 3 = ${firstMod}`).deleteAll();

    expect(await estimate({ samples: 1000 })).toBe(encrypted ? 437752 : 324532);
    expect(await estimate({ samples: 500 })).toBe(encrypted ? 438131 : 324741);
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 334 })).toBe(encrypted ? 437166 : 323946);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 100 })).toBe(encrypted ? 462859 : 345103);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 50 })).toBe(encrypted ? 453859 : 335770);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 10 })).toBe(encrypted ? 401216 : 281944);
    });
  });

  it("test with more gaps in records estimates", async () => {
    const valuesLengths = await withFixedSrand(1, () =>
      Array.from({ length: 1000 }, () => Math.trunc((Kernel.rand() as number) ** 2 * 1000)),
    );
    await writeEntries({ valueLengths: valuesLengths });
    const firstMod = ((await Entry.first()) as Entry).id % 4;
    await Entry.where(`id % 4 != ${firstMod}`).deleteAll();

    expect(await estimate({ samples: 1000 })).toBe(encrypted ? 162804 : 120304);
    expect(await estimate({ samples: 500 })).toBe(encrypted ? 165348 : 121488);
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 250 })).toBe(encrypted ? 164704 : 121188);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 100 })).toBe(encrypted ? 174266 : 126768);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 50 })).toBe(encrypted ? 179794 : 132657);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 10 })).toBe(encrypted ? 44016 : 25537);
    });
  });

  it("overestimate when all samples sizes are the same", async () => {
    await writeEntries({ valueLengths: new Array(1000).fill(1) });

    expect(await estimate({ samples: 1000 })).toBe(encrypted ? 319000 : 149000);
    expect(await estimate({ samples: 999 })).toBe(encrypted ? 637681 : 297851);
    expect(await estimate({ samples: 500 })).toBe(encrypted ? 478500 : 223500);
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 6 })).toBe(encrypted ? 583238 : 272422);
    });
    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 5 })).toBe(encrypted ? 699886 : 326906);
    });
  });

  async function withFixedSrand<T>(seed: number, block: () => T | Promise<T>): Promise<T> {
    const oldSrand = Kernel.srand(seed);
    try {
      return await block();
    } finally {
      Kernel.srand(oldSrand);
    }
  }

  async function writeEntries({ valueLengths }: { valueLengths: number[] }): Promise<void> {
    await Entry.writeMulti(
      valueLengths.map((valueLength, index) => ({
        key: `key${String(index).padStart(5, "0")}`,
        value: "a".repeat(valueLength),
      })),
    );
  }

  async function estimate({ samples }: { samples: number }): Promise<number> {
    return await (
      await Estimate.new({ samples })
    ).size;
  }
});
