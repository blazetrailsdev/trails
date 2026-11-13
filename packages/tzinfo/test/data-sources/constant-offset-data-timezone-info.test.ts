import { describe, expect, it } from "vitest";
import { ArgumentError, rbEqual } from "@blazetrails/ruby-compat";
import {
  ConstantOffsetDataTimezoneInfo,
  OffsetTimezonePeriod,
  Timestamp,
  TimezoneOffset,
} from "../../lib/index.js";
import { assertRaises } from "../test-utils.js";

const T2017 = Date.UTC(2017, 0, 1) / 1000;

describe("TCConstantOffsetDataTimezoneInfo", () => {
  it("initialize", () => {
    const offset = new TimezoneOffset(-17900, 0, "TESTLMT");
    const identifier = "Test/Zone";
    const i = new ConstantOffsetDataTimezoneInfo(identifier, offset);

    expect(i.identifier).toBe(identifier);
    expect(i.constantOffset).toBe(offset);
    expect(Object.isFrozen(identifier)).toBe(true);
  });

  it("initialize nil identifier", () => {
    const o = new TimezoneOffset(-17900, 0, "TESTLMT");

    const error = assertRaises(
      ArgumentError,
      () => new ConstantOffsetDataTimezoneInfo(null as unknown as string, o),
    );
    expect(error.message).toMatch(/\bidentifier\b/);
  });

  it("initialize nil constant offset", () => {
    const error = assertRaises(
      ArgumentError,
      () => new ConstantOffsetDataTimezoneInfo("Test/Zone", null as unknown as TimezoneOffset),
    );
    expect(error.message).toMatch(/\bconstant_offset\b/);
  });

  it("period for", () => {
    const o = new TimezoneOffset(-17900, 0, "TESTLMT");
    const i = new ConstantOffsetDataTimezoneInfo("Test/Zone", o);

    expect(i.periodFor(new Timestamp(T2017, 0, "utc")).equals(new OffsetTimezonePeriod(o))).toBe(
      true,
    );
    expect(i.periodFor(new Timestamp(T2017, 0, 0)).equals(new OffsetTimezonePeriod(o))).toBe(true);
    expect(i.periodFor(new Timestamp(T2017, 0, 3600)).equals(new OffsetTimezonePeriod(o))).toBe(
      true,
    );
  });

  it("periods for local", () => {
    const o = new TimezoneOffset(-17900, 0, "TESTLMT");
    const i = new ConstantOffsetDataTimezoneInfo("Test/Zone", o);

    expect(rbEqual([new OffsetTimezonePeriod(o)], i.periodsForLocal(new Timestamp(T2017)))).toBe(
      true,
    );
  });

  it("transitions up to", () => {
    const i = new ConstantOffsetDataTimezoneInfo(
      "Test/Zone",
      new TimezoneOffset(-17900, 0, "TESTLMT"),
    );

    expect(i.transitionsUpTo(new Timestamp(T2017, 0, "utc"))).toEqual([]);
  });

  it("inspect", () => {
    const i = new ConstantOffsetDataTimezoneInfo("Test/Zone", new TimezoneOffset(0, 0, "TEST"));
    expect(i.inspect()).toBe("#<TZInfo::DataSources::ConstantOffsetDataTimezoneInfo: Test/Zone>");
  });
});
