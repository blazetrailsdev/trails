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

  it("equality", () => {
    const o1 = new TimezoneOffset(0, 3600, "TEST");
    const o2 = new TimezoneOffset(0, 0, "TEST");

    const p1 = new OffsetTimezonePeriod(o1);
    const p2 = new OffsetTimezonePeriod(o1);
    const p3 = new OffsetTimezonePeriod(o2);
    const p4 = new TimezonePeriod(o1);

    expect(p1.equals(p1)).toBe(true);
    expect(p1.equals(p2)).toBe(true);
    expect(p1.equals(p3)).toBe(false);
    expect(p1.equals(p4)).toBe(false);
    expect(p1.equals({})).toBe(false);
  });

  it("eql", () => {
    const o1 = new TimezoneOffset(0, 3600, "TEST");
    const o2 = new TimezoneOffset(0, 0, "TEST");

    const p1 = new OffsetTimezonePeriod(o1);
    const p2 = new OffsetTimezonePeriod(o1);
    const p3 = new OffsetTimezonePeriod(o2);
    const p4 = new TimezonePeriod(o1);

    expect(p1.eql(p1)).toBe(true);
    expect(p1.eql(p2)).toBe(true);
    expect(p1.eql(p3)).toBe(false);
    expect(p1.eql(p4)).toBe(false);
    expect(p1.eql({})).toBe(false);
  });

  it("hash", () => {
    const o = new TimezoneOffset(0, 3600, "TEST");
    const p = new OffsetTimezonePeriod(o);
    expect(p.hash()).toBe(o.hash());
  });
});
