import { describe, expect, it } from "vitest";
import { DataTimezone, TimezoneInfo } from "../lib/index.js";

class TestTimezoneInfo extends TimezoneInfo {}

describe("TCDataTimezone", () => {
  it("identifier", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone"));
    expect(tz.identifier).toBe("Test/Zone");
  });

  it("canonical identifier", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone"));
    expect(tz.canonicalIdentifier).toBe("Test/Zone");
  });

  it("canonical zone", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone"));
    expect(tz.canonicalZone()).toBe(tz);
  });

  it("inspect", () => {
    const tz = new DataTimezone(new TestTimezoneInfo("Test/Zone"));
    expect(tz.inspect()).toBe("#<TZInfo::DataTimezone: Test/Zone>");
  });
});
