import { Kernel } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Entry, SolidCache } from "../../../../lib/index.js";
import { useSolidCache } from "../../../support/test-helper.js";

describe("EntrySizeTest", () => {
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

  it("test larger sample estimates", async () => {
    const valuesLengths = await withFixedSrand(1, () =>
      Array.from({ length: 1000 }, () => Math.trunc((Kernel.rand() as number) ** 2 * 1000)),
    );
    await writeEntries({ valueLengths: valuesLengths });

    expect(await Entry.estimatedSize({ samples: 1000 })).toBe(encrypted ? 651257 : 481257);
    expect(await Entry.estimatedSize({ samples: 501 })).toBe(encrypted ? 652772 : 482262);
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 100 })).toBe(encrypted ? 681425 : 502065);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 50 })).toBe(encrypted ? 661170 : 478066);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 10 })).toBe(encrypted ? 693054 : 472343);
    });
  });

  it("test with gaps in records estimates", async () => {
    const valuesLengths = await withFixedSrand(1, () =>
      Array.from({ length: 1000 }, () => Math.trunc((Kernel.rand() as number) ** 2 * 1000)),
    );
    await writeEntries({ valueLengths: valuesLengths });
    const firstMod = ((await Entry.first()) as Entry).id % 3;
    await Entry.where(`id % 3 = ${firstMod}`).deleteAll();

    expect(await Entry.estimatedSize({ samples: 1000 })).toBe(encrypted ? 437752 : 324532);
    expect(await Entry.estimatedSize({ samples: 500 })).toBe(encrypted ? 438496 : 324936);
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 334 })).toBe(encrypted ? 438296 : 324567);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 100 })).toBe(encrypted ? 463629 : 345649);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 50 })).toBe(encrypted ? 454686 : 336366);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 10 })).toBe(encrypted ? 402002 : 282492);
    });
  });

  it("test with more gaps in records estimates", async () => {
    const valuesLengths = await withFixedSrand(1, () =>
      Array.from({ length: 1000 }, () => Math.trunc((Kernel.rand() as number) ** 2 * 1000)),
    );
    await writeEntries({ valueLengths: valuesLengths });
    const firstMod = ((await Entry.first()) as Entry).id % 4;
    await Entry.where(`id % 4 != ${firstMod}`).deleteAll();

    expect(await Entry.estimatedSize({ samples: 1000 })).toBe(encrypted ? 162804 : 120304);
    expect(await Entry.estimatedSize({ samples: 501 })).toBe(encrypted ? 165713 : 121683);
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 250 })).toBe(encrypted ? 164762 : 121240);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 100 })).toBe(encrypted ? 174610 : 126976);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 50 })).toBe(encrypted ? 180315 : 133014);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 10 })).toBe(encrypted ? 44143 : 25596);
    });
  });

  it("overestimate when all samples sizes are the same", async () => {
    await writeEntries({ valueLengths: new Array(1000).fill(1) });

    expect(await Entry.estimatedSize({ samples: 1000 })).toBe(encrypted ? 319000 : 149000);
    expect(await Entry.estimatedSize({ samples: 999 })).toBe(encrypted ? 637727 : 297897);
    expect(await Entry.estimatedSize({ samples: 501 })).toBe(encrypted ? 478865 : 223695);
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 6 })).toBe(encrypted ? 583869 : 272741);
    });
    await withFixedSrand(1, async () => {
      expect(await Entry.estimatedSize({ samples: 5 })).toBe(encrypted ? 700634 : 327280);
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
});
