import { describe, expect, it } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { inTimeZone } from "./zones.js";
import { setZone } from "../../time-zone-config.js";

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
});
