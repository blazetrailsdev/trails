import { describe, expect, it } from "vitest";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { OffsetTimezonePeriod, TimezoneOffset, TimezonePeriod } from "../lib/index.js";

describe("TCOffsetTimezonePeriod", () => {
  it("initialize", () => {
    const o = new TimezoneOffset(-7200, 3600, "SPECIAL");
    const p = new OffsetTimezonePeriod(o);
    expect(p.offset).toBe(o);
  });

  it("initialize nil", () => {
    expect(() => new OffsetTimezonePeriod(null)).toThrow(ArgumentError);
    expect(() => new OffsetTimezonePeriod(null)).toThrow(/\boffset\b/);
  });

  it("start transition", () => {
    const p = new OffsetTimezonePeriod(new TimezoneOffset(-7200, 3600, "SPECIAL"));
    expect(p.startTransition).toBeNull();
  });

  it("end transition", () => {
    const p = new OffsetTimezonePeriod(new TimezoneOffset(-7200, 3600, "SPECIAL"));
    expect(p.endTransition).toBeNull();
  });

  for (const [name, method] of [
    ["equality", "equals"],
    ["eql", "eql"],
  ] as const) {
    it(name, () => {
      const o1 = new TimezoneOffset(0, 3600, "TEST");
      const o2 = new TimezoneOffset(0, 0, "TEST");

      const p1 = new OffsetTimezonePeriod(o1);
      const p2 = new OffsetTimezonePeriod(o1);
      const p3 = new OffsetTimezonePeriod(o2);
      const p4 = new TimezonePeriod(o1);

      expect([p1, p2, p3, p4, {}].map((p) => p1[method](p))).toEqual([
        true,
        true,
        false,
        false,
        false,
      ]);
    });
  }

  it("hash", () => {
    const o = new TimezoneOffset(0, 3600, "TEST");
    const p = new OffsetTimezonePeriod(o);
    expect(p.hash()).toBe(o.hash());
  });
});
