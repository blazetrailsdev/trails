import { describe, it, expect, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeZone, TimeWithZone, setZone } from "@blazetrails/activesupport";
import { Time, Value } from "./time.js";
import { setDefaultTimezone } from "../active-record.js";

afterEach(() => {
  setDefaultTimezone("utc");
  setZone(null);
});

describe("ActiveRecord::Type::Time serialize_cast_value normalization", () => {
  const pacific = () => TimeZone.find("America/Los_Angeles")!;

  it("getutc's a time zone-aware value when is_utc?", () => {
    const type = new Time();
    const value = new TimeWithZone(Temporal.Instant.from("2000-01-01T10:30:00Z"), pacific());
    const obj = (type.serializeCastValue(value) as Value).__getobj__();
    expect(obj).toBeInstanceOf(RubyTime);
    expect(obj.isUtc()).toBe(true);
    expect(obj.strftime("%H:%M:%S")).toBe("10:30:00");
  });

  it("getlocal's a time zone-aware value when default_timezone is :local", () => {
    setDefaultTimezone("local");
    const type = new Time();
    const value = new TimeWithZone(Temporal.Instant.from("2000-01-01T10:30:00Z"), pacific());
    const obj = (type.serializeCastValue(value) as Value).__getobj__();
    expect(obj).toBeInstanceOf(RubyTime);
    expect(obj.isUtc()).toBe(false);
  });
});

describe("TimeTest", () => {
  it("serialize wraps the cast time in Type::Time::Value", () => {
    const type = new Time();
    const serialized = type.serialize("10:30:00");
    expect(serialized).toBeInstanceOf(Value);
    expect((serialized as Value).__getobj__().getutc().xmlschema()).toBe("2000-01-01T10:30:00Z");
    expect(type.serialize(null)).toBe(null);
  });

  it("cast unwraps a Type::Time::Value", () => {
    const type = new Time();
    const value = type.serialize("10:30:00") as Value;
    expect(type.cast(value)).toEqual(value.__getobj__());
  });
});
