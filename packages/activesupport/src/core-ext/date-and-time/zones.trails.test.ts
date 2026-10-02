import { describe, expect, it } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { NoMethodError, rbFSend } from "@blazetrails/ruby-compat";
import { inTimeZone } from "./zones.js";
import { setZone, useZone } from "../../time-zone-config.js";
import { TimeWithZone } from "../../time-with-zone.js";
import "../../index.js";

describe("DateAndTime::Zones", () => {
  it("returns self when no zone is configured", () => {
    setZone(null);
    const time = RubyTime.utc(2000, 1, 1, 0, 0, 0);
    expect(inTimeZone(time)).toBe(time);

    const date = new Date(Date.UTC(2000, 0, 1));
    expect(inTimeZone(date)).toBe(date);

    const plain = new Temporal.PlainDateTime(2000, 1, 1);
    expect(inTimeZone(plain)).toBe(plain);
  });

  it("does not convert a non-utc time to utc when no zone is configured", () => {
    setZone(null);
    const time = RubyTime.new(2000, 1, 1, 0, 0, 0, -18000);
    const result = inTimeZone(time);
    expect(result).toBe(time);
    expect((result as RubyTime).isUtc()).toBe(false);
  });

  it("answers an in_time_zone send for every class that includes it, and for String", () => {
    setZone(null);
    const time = RubyTime.utc(2000, 1, 1, 0, 0, 0);
    const instant = Temporal.Instant.from("2000-01-01T00:00:00Z");
    const zoned = Temporal.ZonedDateTime.from("2000-01-01T00:00:00[UTC]");
    expect(rbFSend(time, "inTimeZone")).toBe(time);
    expect(rbFSend(instant, "inTimeZone")).toBe(instant);
    expect(rbFSend(zoned, "inTimeZone")).toBe(zoned);
    expect(rbFSend("", "inTimeZone")).toBe(null);
    expect(() => rbFSend(null, "inTimeZone")).toThrow(NoMethodError);

    useZone("Eastern Time (US & Canada)", () => {
      for (const receiver of [time, instant, zoned, new Temporal.PlainDate(2000, 1, 1)]) {
        const result = rbFSend(receiver, "inTimeZone") as TimeWithZone;
        expect(result).toBeInstanceOf(TimeWithZone);
        expect(result.timeZone.name).toBe("Eastern Time (US & Canada)");
      }
      expect((time.inTimeZone() as TimeWithZone).hour).toBe(19);
      expect((rbFSend("2000-01-01 12:00:00", "inTimeZone") as TimeWithZone).hour).toBe(12);
      expect((rbFSend(time, "inTimeZone", "Hawaii") as TimeWithZone).hour).toBe(14);
    });
  });
});
