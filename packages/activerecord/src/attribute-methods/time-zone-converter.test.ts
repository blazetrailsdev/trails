import { describe, it, expect, afterEach, vi } from "vitest";
import { TimeZoneConverter } from "./time-zone-conversion.js";
import { DateTime } from "../type/date-time.js";
import { ActiveRecord } from "../ar-config.js";
import { ValueType } from "@blazetrails/activemodel";
import { TimeWithZone, TimeZone, setZone } from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";

describe("TimeZoneConverterTest", () => {
  afterEach(() => {
    setZone(null);
    vi.restoreAllMocks();
    resetLocalTimeZoneId();
  });

  it("comparison with date time type", () => {
    const value = new TimeZoneConverter(new DateTime());
    const valueFromCache = new TimeZoneConverter(new DateTime());

    expect(value.equals(valueFromCache)).toBe(true);
    expect(value.equals("foo" as any)).toBe(false);
  });

  it("cast returns null for null/undefined", () => {
    const converter = new TimeZoneConverter(new DateTime());
    expect(converter.cast(null)).toBeNull();
    expect(converter.cast(undefined)).toBeNull();
  });

  it("cast wraps Temporal.Instant in TimeWithZone for current zone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const result = converter.cast(instant);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.hour).toBe(10);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
  });

  it("cast wraps Temporal.ZonedDateTime in current zone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const zdt = Temporal.Instant.from("2024-06-15T14:00:00Z").toZonedDateTimeISO("UTC");
    const result = converter.cast(zdt);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.hour).toBe(10);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
    expect(twz.toI()).toBe(zdt.toInstant().epochMilliseconds / 1000);
  });

  it("cast moves existing TimeWithZone to current zone", () => {
    const pacific = TimeZone.find("Pacific Time (US & Canada)")!;
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const pacificTime = new TimeWithZone(instant, pacific);

    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast(pacificTime);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.timeZone.name).toBe(eastern.name);
    expect(twz.toI()).toBe(pacificTime.toI());
  });

  it("cast parses offset-less string as local to current zone (not default_timezone)", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast("2024-06-15 10:30:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.hour).toBe(10);
    expect(twz.min).toBe(30);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
    expect(twz.utc().toTime().epochMilliseconds).toBe(
      Temporal.Instant.from("2024-06-15T14:30:00Z").epochMilliseconds,
    );
  });

  it("cast parses string with offset as absolute instant then wraps in zone", () => {
    setZone("UTC");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast("2024-06-15T10:30:00-04:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.hour).toBe(14);
    expect(twz.min).toBe(30);
  });

  it("cast returns raw subtype result when no zone is configured", () => {
    setZone(null);
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const result = converter.cast(instant);
    expect(result).toBeInstanceOf(RubyTime);
  });

  it("cast raises for plain object with non-multiparameter keys", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    expect(() => converter.cast({ date: "2024-06-15" })).toThrow("doesn't contain necessary keys");
  });

  it("deserialize wraps Temporal.Instant from subtype in TimeWithZone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.deserialize("2024-06-15 14:00:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.hour).toBe(10);
  });

  it("serialize forwards the TimeWithZone to the subtype untouched", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = new TimeWithZone(instant, eastern);
    const result = converter.serialize(twz);
    expect(result).toBeInstanceOf(RubyTime);
    expect((result as RubyTime).toTime().toInstant().toString()).toBe("2024-06-15T14:00:00Z");
  });

  it("serialize round-trips: deserialize then serialize returns the cast value", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const deserialized = converter.deserialize("2024-06-15 14:00:00");
    expect(deserialized).toBeInstanceOf(TimeWithZone);
    const serialized = converter.serialize(deserialized);
    expect(serialized).toBeInstanceOf(RubyTime);
    expect((serialized as RubyTime).toTime().toInstant().toString()).toBe("2024-06-15T14:00:00Z");
  });

  it("falls back to ActiveRecord.default_timezone when the subtype has no is_utc?", () => {
    const previous = ActiveRecord.defaultTimezone;
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    resetLocalTimeZoneId();
    setZone("UTC");
    ActiveRecord.defaultTimezone = "local";
    try {
      class ZonelessDateTime extends ValueType<unknown> {
        override type(): string {
          return "datetime";
        }
        override cast(): unknown {
          return Temporal.Instant.from("2024-06-15T14:00:00Z");
        }
      }
      const converter = new TimeZoneConverter(new ZonelessDateTime());
      const result = converter.cast({ 1: 2024, 2: 6, 3: 15, 4: 10, 5: 0 });
      expect(result).toBeInstanceOf(TimeWithZone);
      expect((result as TimeWithZone).utc().toTime().toInstant().toString()).toBe(
        "2024-06-15T10:00:00Z",
      );
    } finally {
      ActiveRecord.defaultTimezone = previous;
    }
  });
});
