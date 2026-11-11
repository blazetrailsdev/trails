import { describe, expect, it } from "vitest";
import { InfoTimezone, TimezoneInfo } from "../lib/index.js";

describe("TCInfoTimezone", () => {
  it("identifier", () => {
    const tz = new InfoTimezone(new TimezoneInfo("Test/Identifier"));
    expect(tz.identifier).toBe("Test/Identifier");
  });

  it("info", () => {
    const i = new TimezoneInfo("Test/Identifier");
    const tz = new InfoTimezone(i);
    expect(tz.info).toBe(i);
  });

  it("inspect", () => {
    const tz = new InfoTimezone(new TimezoneInfo("Test/Identifier"));
    expect(tz.inspect()).toBe("#<TZInfo::InfoTimezone: Test/Identifier>");
  });
});
