import { describe, it, expect } from "vitest";
import { TimeZoneConverter } from "../../../lib/attribute-methods/time-zone-conversion.js";
import { DateTime } from "../../../lib/type/date-time.js";

describe("TimeZoneConverterTest", () => {
  it("comparison with date time type", () => {
    const value = new TimeZoneConverter(new DateTime());
    const valueFromCache = new TimeZoneConverter(new DateTime());

    expect(value.equals(valueFromCache)).toBe(true);
    expect(value.equals("foo" as any)).not.toBe(true);
  });
});
