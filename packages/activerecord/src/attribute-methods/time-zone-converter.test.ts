import { describe, it, expect } from "vitest";
import { TimeZoneConverter } from "./time-zone-conversion.js";
import { DateTime } from "../type/date-time.js";

describe("TimeZoneConverterTest", () => {
  it("comparison with date time type", () => {
    // Two distinct DateTime instances (mirrors Rails' Marshal round-trip producing
    // a new object) — verifies ValueType.equals compares by shape, not reference.
    const value = new TimeZoneConverter(new DateTime());
    const valueFromCache = new TimeZoneConverter(new DateTime());

    expect(value.equals(valueFromCache)).toBe(true);
    expect(value.equals("foo" as any)).toBe(false);
  });
});
