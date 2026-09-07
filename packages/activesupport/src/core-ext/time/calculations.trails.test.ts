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
  it("change rebuilds in the receiver's own zone, not the process-local one", () => {
    withEnvTz("UTC", () => {
      const recv = RubyTime.at(1710003600).getlocal("America/New_York");
      expect(recv.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2024-03-09 12:00:00 -0500 EST");
      expect(recv.change({ day: 10 }).strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe(
        "2024-03-10 12:00:00 -0400 EDT",
      );
    });
  });

  it("advance keeps the receiver's own zone across a DST boundary", () => {
    withEnvTz("UTC", () => {
      const recv = RubyTime.at(1710003600).getlocal("America/New_York");
      expect(recv.advance({ days: 1 }).strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe(
        "2024-03-10 12:00:00 -0400 EDT",
      );
    });
  });

  it("change picks the occurrence matching the receiver's utc_offset when DST ends", () => {
    withEnvTz("UTC", () => {
      const edt = RubyTime.at(1225603800).getlocal("America/New_York");
      const est = RubyTime.at(1225607400).getlocal("America/New_York");
      expect(edt.change({ min: 45 }).strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2008-11-02 01:45:00 -0400",
      );
      expect(est.change({ min: 45 }).strftime("%Y-%m-%d %H:%M:%S %z")).toBe(
        "2008-11-02 01:45:00 -0500",
      );
    });
  });
});
