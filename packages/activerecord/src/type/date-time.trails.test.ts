import { describe, it, expect, afterEach } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeZone, TimeWithZone, setZone } from "@blazetrails/activesupport";
import { TimeZoneConverter } from "../attribute-methods/time-zone-conversion.js";
import { RangeType } from "../connection-adapters/postgresql/oid/range.js";
import { DateTime } from "./date-time.js";
import { ActiveRecord } from "../ar-config.js";
import { Range } from "@blazetrails/ruby-compat";

afterEach(() => {
  ActiveRecord.defaultTimezone = "utc";
  setZone(null);
});

describe("ActiveRecord::Type::DateTime serialize_cast_value normalization", () => {
  it("leaves an already-UTC value alone when is_utc?", () => {
    const type = new DateTime();
    const value = type.cast("1999-12-31 12:34:56") as RubyTime;
    expect(type.serializeCastValue(value)).toBe(value);
  });

  it("getlocal's the value when default_timezone is :local", () => {
    ActiveRecord.defaultTimezone = "local";
    const type = new DateTime();
    const value = type.cast("1999-12-31 12:34:56") as RubyTime;
    const serialized = type.serializeCastValue(value) as RubyTime;
    expect(serialized).toBeInstanceOf(RubyTime);
    expect(serialized.isUtc()).toBe(false);
    expect(serialized.strftime("%Y-%m-%d %H:%M:%S")).toBe("1999-12-31 12:34:56");
  });
});

describe("ActiveRecord::Type::DateTime timezone dispatch", () => {
  it("is_utc? follows ActiveRecord.default_timezone", () => {
    ActiveRecord.defaultTimezone = "local";
    expect(new DateTime().isUtc).toBe(false);
    ActiveRecord.defaultTimezone = "utc";
    expect(new DateTime().isUtc).toBe(true);
  });

  it("is_utc? follows the per-type timezone override", () => {
    ActiveRecord.defaultTimezone = "utc";
    expect(new DateTime({ timezone: "local" }).isUtc).toBe(false);
    ActiveRecord.defaultTimezone = "local";
    expect(new DateTime({ timezone: "utc" }).isUtc).toBe(true);
  });

  it("casts bare strings in the zone chosen by is_utc?", () => {
    const bare = "2024-01-02T12:00:00";
    const utc = RubyTime.utc(2024, 1, 2, 12, 0, 0);
    const local = RubyTime.local(2024, 1, 2, 12, 0, 0);

    ActiveRecord.defaultTimezone = "utc";
    expect((new DateTime().cast(bare) as RubyTime).toI()).toBe(utc.toI());

    ActiveRecord.defaultTimezone = "local";
    expect((new DateTime().cast(bare) as RubyTime).toI()).toBe(local.toI());

    expect((new DateTime({ timezone: "utc" }).cast(bare) as RubyTime).toI()).toBe(utc.toI());
  });

  it("preserves wall clock through the time zone aware wrapper", () => {
    setZone(TimeZone.find("America/New_York"));
    const converter = TimeZoneConverter.wrap(new DateTime({ timezone: "local" }));

    const casted = converter.cast(Temporal.PlainDateTime.from("2024-01-02T12:00:00"));

    expect(casted).toBeInstanceOf(TimeWithZone);
    expect((casted as TimeWithZone).hour).toBe(12);
    expect((casted as TimeWithZone).day).toBe(2);
  });

  it("resolves is_utc? through a wrapping range subtype", () => {
    setZone(TimeZone.find("America/New_York"));
    const converter = TimeZoneConverter.wrap(
      new RangeType(new DateTime({ timezone: "local" }), "tsrange"),
    );

    const casted = converter.cast(
      new Range(
        Temporal.PlainDateTime.from("2024-01-02T12:00:00"),
        Temporal.PlainDateTime.from("2024-01-03T12:00:00"),
        false,
      ),
    );

    const begin = (casted as { begin: TimeWithZone }).begin;
    expect(begin).toBeInstanceOf(TimeWithZone);
    expect(begin.hour).toBe(12);
    expect(begin.day).toBe(2);
  });
});
