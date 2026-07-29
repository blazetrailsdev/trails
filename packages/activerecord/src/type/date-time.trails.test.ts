import { describe, it, expect, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { TimeZone, TimeWithZone, setZone, resetZone } from "@blazetrails/activesupport";
import { TimeZoneConverter } from "../attribute-methods/time-zone-conversion.js";
import { Range, RangeType } from "../connection-adapters/postgresql/oid/range.js";
import { DateTime } from "./date-time.js";
import { ActiveRecord } from "../ar-config.js";

afterEach(() => {
  ActiveRecord.defaultTimezone = "utc";
  resetZone();
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
    const utc = Temporal.PlainDateTime.from(bare).toZonedDateTime("UTC").toInstant();
    const local = Temporal.PlainDateTime.from(bare)
      .toZonedDateTime(Temporal.Now.timeZoneId())
      .toInstant();

    ActiveRecord.defaultTimezone = "utc";
    expect((new DateTime().cast(bare) as Temporal.Instant).epochNanoseconds).toBe(
      utc.epochNanoseconds,
    );

    ActiveRecord.defaultTimezone = "local";
    expect((new DateTime().cast(bare) as Temporal.Instant).epochNanoseconds).toBe(
      local.epochNanoseconds,
    );

    expect(
      (new DateTime({ timezone: "utc" }).cast(bare) as Temporal.Instant).epochNanoseconds,
    ).toBe(utc.epochNanoseconds);
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
