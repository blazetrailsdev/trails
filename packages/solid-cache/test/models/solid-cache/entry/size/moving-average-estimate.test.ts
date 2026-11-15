import { Kernel } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Entry, SolidCache } from "../../../../../lib/index.js";
import { MovingAverageEstimate } from "../../../../../lib/entry/size/moving-average-estimate.js";
import { useSolidCache } from "../../../../support/test-helper.js";

describe("EntrySizeMovingAverageEstimateTest", () => {
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

    const estimate = await MovingAverageEstimate.new({ samples: 12 });
    expect(await estimate.isExact()).toBeTruthy();
    expect(await estimate.size).toBe(encrypted ? 3235 : 1535);
  });

  it("tracks moving average", async () => {
    await writeEntries({ valueLengths: Array.from({ length: 5000 }, (_, i) => i) });

    await Entry.write(MovingAverageEstimate.ESTIMATES_KEY, "4637774|4754378|7588547");

    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 1 })).toBe(encrypted ? 11016081 : 10449357);
    });

    expect(await readEstimates()).toBe(
      encrypted ? "4754378|7588547|20705317" : "4754378|7588547|19005147",
    );
  }, 60_000);

  it("appends to moving average when less than required items", async () => {
    await writeEntries({ valueLengths: Array.from({ length: 5000 }, (_, i) => i) });

    expect(await Entry.read(MovingAverageEstimate.ESTIMATES_KEY)).toBeNull();

    await withFixedSrand(1, async () => {
      expect(await estimate({ samples: 2 })).toBe(encrypted ? 22691557 : 20991897);
    });

    expect(await readEstimates()).toBe(encrypted ? "22691557" : "20991897");

    await withFixedSrand(2, async () => {
      expect(await estimate({ samples: 2 })).toBe(encrypted ? 13191977 : 11917062);
    });

    expect(await readEstimates()).toBe(encrypted ? "22691557|3692397" : "20991897|2842227");
  }, 60_000);

  async function readEstimates(): Promise<unknown> {
    const value = await Entry.read(MovingAverageEstimate.ESTIMATES_KEY);
    return value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
  }

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
      await MovingAverageEstimate.new({ samples })
    ).size;
  }
});
