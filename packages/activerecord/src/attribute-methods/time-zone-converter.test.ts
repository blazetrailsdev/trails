import { describe, it, expect } from "vitest";
import { TimeZoneConverter } from "./time-zone-conversion.js";
import { DateTime } from "../type/date-time.js";

describe("TimeZoneConverterTest", () => {
  it("comparison with date time type", () => {
    const subtype = new DateTime();
    const value = new TimeZoneConverter(subtype);
    const valueCopy = new TimeZoneConverter(subtype);

    expect(value.equals(valueCopy)).toBe(true);
    expect(value.equals("foo" as any)).toBe(false);
  });
});
