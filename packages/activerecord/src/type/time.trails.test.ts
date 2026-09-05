import { describe, it, expect, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeZone, TimeWithZone, setZone } from "@blazetrails/activesupport";
import { Time, Value } from "./time.js";
import { ActiveRecord } from "../ar-config.js";

afterEach(() => {
  ActiveRecord.defaultTimezone = "utc";
  setZone(null);
});

describe("ActiveRecord::Type::Time serialize_cast_value normalization", () => {
  const pacific = () => TimeZone.find("America/Los_Angeles")!;

  it("getutc's a time zone-aware value when is_utc?", () => {
    const type = new Time();
    const value = new TimeWithZone(Temporal.Instant.from("2000-01-01T10:30:00Z"), pacific());
    const obj = (type.serializeCastValue(value) as Value).getobj() as RubyTime;
    expect(obj).toBeInstanceOf(RubyTime);
    expect(obj.isUtc()).toBe(true);
    expect(obj.strftime("%H:%M:%S")).toBe("10:30:00");
  });

  it("getlocal's a time zone-aware value when default_timezone is :local", () => {
    ActiveRecord.defaultTimezone = "local";
    const type = new Time();
    const value = new TimeWithZone(Temporal.Instant.from("2000-01-01T10:30:00Z"), pacific());
    const obj = (type.serializeCastValue(value) as Value).getobj() as RubyTime;
    expect(obj).toBeInstanceOf(RubyTime);
    expect(obj.isUtc()).toBe(false);
  });
});
