import { describe, expect, it } from "vitest";
import { rbHash } from "@blazetrails/ruby-compat";
import { TimezoneOffset } from "../lib/index.js";

describe("TCTimezoneOffset", () => {
  for (const method of ["baseUtcOffset", "utcOffset"] as const) {
    const rubyName = method === "baseUtcOffset" ? "base_utc_offset" : "utc_offset";
    it(rubyName.replaceAll("_", " "), () => {
      const o1 = new TimezoneOffset(18000, 0, "TEST");
      const o2 = new TimezoneOffset(-3600, 3600, "TEST2");

      expect(o1[method]).toBe(18000);
      expect(o2[method]).toBe(-3600);
    });
  }

  it("std offset", () => {
    const o1 = new TimezoneOffset(18000, 0, "TEST");
    const o2 = new TimezoneOffset(-3600, 3600, "TEST2");

    expect(o1.stdOffset).toBe(0);
    expect(o2.stdOffset).toBe(3600);
  });

  for (const [method, rubyName] of [
    ["observedUtcOffset", "observed_utc_offset"],
    ["utcTotalOffset", "utc_total_offset"],
  ] as const) {
    it(rubyName.replaceAll("_", " "), () => {
      const o1 = new TimezoneOffset(18000, 0, "TEST");
      const o2 = new TimezoneOffset(-3600, 3600, "TEST2");

      expect(o1[method]).toBe(18000);
      expect(o2[method]).toBe(0);
    });
  }

  for (const method of ["abbreviation", "abbr"] as const) {
    it(method, () => {
      const o1 = new TimezoneOffset(18000, 0, "TEST");
      const o2 = new TimezoneOffset(-3600, 3600, "TEST2");

      expect(o1[method]).toBe("TEST");
      expect(o2[method]).toBe("TEST2");
    });
  }

  it("dst", () => {
    const o1 = new TimezoneOffset(18000, 0, "TEST");
    const o2 = new TimezoneOffset(-3600, 3600, "TEST2");

    expect(o1.isDst()).toBe(false);
    expect(o2.isDst()).toBe(true);
  });

  it("equality", () => {
    const o1 = new TimezoneOffset(18000, 0, "TEST");
    const o2 = new TimezoneOffset(18000, 0, "TEST");
    const o3 = new TimezoneOffset(18001, 0, "TEST");
    const o4 = new TimezoneOffset(18000, 1, "TEST");
    const o5 = new TimezoneOffset(18000, 0, "TEST2");

    expect(o1.equals(o1)).toBe(true);
    expect(o1.equals(o2)).toBe(true);
    expect(o1.equals(o3)).toBe(false);
    expect(o1.equals(o4)).toBe(false);
    expect(o1.equals(o5)).toBe(false);
    expect(o1.equals({})).toBe(false);
  });

  it("eql", () => {
    const o1 = new TimezoneOffset(18000, 0, "TEST");
    const o2 = new TimezoneOffset(18000, 0, "TEST");
    const o3 = new TimezoneOffset(18001, 0, "TEST");
    const o4 = new TimezoneOffset(18000, 1, "TEST");
    const o5 = new TimezoneOffset(18000, 0, "TEST2");

    expect(o1.eql(o1)).toBe(true);
    expect(o1.eql(o2)).toBe(true);
    expect(o1.eql(o3)).toBe(false);
    expect(o1.eql(o4)).toBe(false);
    expect(o1.eql(o5)).toBe(false);
    expect(o1.eql({})).toBe(false);
  });

  it("hash", () => {
    const o1 = new TimezoneOffset(18000, 0, "TEST");
    const o2 = new TimezoneOffset(-3600, 3600, "TEST2");

    expect(o1.hash()).toBe(rbHash([18000, 0, "TEST"]));
    expect(o2.hash()).toBe(rbHash([-3600, 3600, "TEST2"]));
  });

  it("inspect", () => {
    const o = new TimezoneOffset(18000, 0, "TEST");
    expect(o.inspect()).toBe(
      "#<TZInfo::TimezoneOffset: @base_utc_offset=18000, @std_offset=0, @abbreviation=TEST>",
    );
  });
});
