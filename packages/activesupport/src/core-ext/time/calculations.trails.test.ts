import { describe, expect, it } from "vitest";
import { Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import "./calculations.js";

function withEnvTz<T>(tz: string, fn: () => T): T {
  const orig = process.env.TZ;
  process.env.TZ = tz;
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    if (orig === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = orig;
    }
    resetLocalTimeZoneId();
  }
}

describe("TimeExtCalculationsTest (trails)", () => {
  it("advance floors a negative fractional weeks like Ruby's divmod", () => {
    withEnvTz("US/Eastern", () => {
      const advanced = RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ weeks: -1.5 });
      expect(advanced.strftime("%Y-%m-%d %H:%M:%S")).toBe("2005-02-18 03:15:10");
    });
  });

  it("advance floors a negative fractional days like Ruby's divmod", () => {
    withEnvTz("US/Eastern", () => {
      const advanced = RubyTime.local(2005, 2, 28, 15, 15, 10).advance({ days: -5.5 });
      expect(advanced.strftime("%Y-%m-%d %H:%M:%S")).toBe("2005-02-23 03:15:10");
    });
  });
});
