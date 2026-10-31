import { beforeEach, describe, expect, it } from "vitest";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { CpuCounter } from "./cpu-counter.js";

describe("TestRakeCpuCounter", () => {
  let cpuCounter: CpuCounter;

  beforeEach(() => {
    cpuCounter = new CpuCounter();
  });

  it("count", () => {
    const num = cpuCounter.count();
    expect(num).toBeTypeOf("number");
    expect(num).toBeGreaterThanOrEqual(1);
  });

  it("count with default nil", () => {
    cpuCounter.count = () => null as unknown as number;
    expect(cpuCounter.countWithDefault(8)).toEqual(8);
    expect(cpuCounter.countWithDefault()).toEqual(4);
  });

  it("count with default raise", () => {
    cpuCounter.count = () => {
      throw new RuntimeError();
    };
    expect(cpuCounter.countWithDefault(8)).toEqual(8);
    expect(cpuCounter.countWithDefault()).toEqual(4);
  });

  describe("TestClassMethod", () => {
    it("count", () => {
      class Klass extends CpuCounter {
        count(): number {
          return 8;
        }
      }
      expect(Klass.count()).toEqual(8);
    });

    it("count nil", () => {
      let counted = false;
      class Klass extends CpuCounter {
        count(): number {
          counted = true;
          return null as unknown as number;
        }
      }
      expect(Klass.count()).toEqual(4);
      expect(counted).toEqual(true);
    });

    it("count raise", () => {
      let counted = false;
      class Klass extends CpuCounter {
        count(): number {
          counted = true;
          throw new RuntimeError();
        }
      }
      expect(Klass.count()).toEqual(4);
      expect(counted).toEqual(true);
    });
  });
});
