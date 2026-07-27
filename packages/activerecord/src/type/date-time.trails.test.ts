import { describe, it, expect, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { TimeZone, TimeWithZone, setZone, resetZone } from "@blazetrails/activesupport";
import { TimeZoneConverter } from "../attribute-methods/time-zone-conversion.js";
import { DateTime } from "./date-time.js";
import { setDefaultTimezone } from "./internal/timezone.js";

afterEach(() => {
  setDefaultTimezone("utc");
  resetZone();
});

describe("ActiveRecord::Type::DateTime timezone dispatch", () => {
  it("is_utc? follows ActiveRecord.default_timezone", () => {
    setDefaultTimezone("local");
    expect(new DateTime().isUtc).toBe(false);
    setDefaultTimezone("utc");
    expect(new DateTime().isUtc).toBe(true);
  });

  it("is_utc? follows the per-type timezone override", () => {
    setDefaultTimezone("utc");
    expect(new DateTime({ timezone: "local" }).isUtc).toBe(false);
    setDefaultTimezone("local");
    expect(new DateTime({ timezone: "utc" }).isUtc).toBe(true);
  });

  it("casts bare strings in the zone chosen by is_utc?", () => {
    const bare = "2024-01-02T12:00:00";
    const utc = Temporal.PlainDateTime.from(bare).toZonedDateTime("UTC").toInstant();
    const local = Temporal.PlainDateTime.from(bare)
      .toZonedDateTime(Temporal.Now.timeZoneId())
      .toInstant();

    setDefaultTimezone("utc");
    expect((new DateTime().cast(bare) as Temporal.Instant).epochNanoseconds).toBe(
      utc.epochNanoseconds,
    );

    setDefaultTimezone("local");
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
});
