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

  for (const [name, method] of [
    ["equality", "equals"],
    ["eql", "eql"],
  ] as const) {
    it(name, () => {
      const o1 = new TimezoneOffset(18000, 0, "TEST");
      const o2 = new TimezoneOffset(18000, 0, "TEST");
      const o3 = new TimezoneOffset(18001, 0, "TEST");
      const o4 = new TimezoneOffset(18000, 1, "TEST");
      const o5 = new TimezoneOffset(18000, 0, "TEST2");

      expect([o1, o2, o3, o4, o5, {}].map((o) => o1[method](o))).toEqual([
        true,
        true,
        false,
        false,
        false,
        false,
      ]);
    });
  }

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
