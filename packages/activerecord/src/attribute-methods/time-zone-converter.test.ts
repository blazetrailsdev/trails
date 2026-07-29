import { describe, it, expect, afterEach, vi } from "vitest";
import { TimeZoneConverter } from "./time-zone-conversion.js";
import { DateTime } from "../type/date-time.js";
import { getDefaultTimezone, setDefaultTimezone } from "../type/internal/timezone.js";
import { ValueType } from "@blazetrails/activemodel";
import { TimeWithZone, TimeZone, setZone, resetZone } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";

describe("TimeZoneConverterTest", () => {
  afterEach(() => {
    resetZone();
    vi.restoreAllMocks();
  });

  it("comparison with date time type", () => {
    // Two distinct DateTime instances (mirrors Rails' Marshal round-trip producing
    // a new object) — verifies ValueType.equals compares by shape, not reference.
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
    // 14:00 UTC = 10:00 EDT (UTC-4 in summer)
    expect(twz.hour).toBe(10);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
  });

  it("cast wraps Temporal.ZonedDateTime in current zone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // ZonedDateTime in UTC at 14:00
    const zdt = Temporal.Instant.from("2024-06-15T14:00:00Z").toZonedDateTimeISO("UTC");
    const result = converter.cast(zdt);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 14:00 UTC = 10:00 EDT (UTC-4 in summer)
    expect(twz.hour).toBe(10);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
    expect(twz.toI()).toBe(zdt.toInstant().epochMilliseconds / 1000);
  });

  it("cast moves existing TimeWithZone to current zone", () => {
    const pacific = TimeZone.find("Pacific Time (US & Canada)");
    const eastern = TimeZone.find("Eastern Time (US & Canada)");
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const pacificTime = new TimeWithZone(instant, pacific);

    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast(pacificTime);
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    expect(twz.timeZone.name).toBe(eastern.name);
    expect(twz.toI()).toBe(pacificTime.toI()); // same instant
  });

  it("cast parses offset-less string as local to current zone (not default_timezone)", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // "10:30:00" with no offset → should be 10:30 local Eastern, not 10:30 UTC
    const result = converter.cast("2024-06-15 10:30:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // Wall-clock in the zone must be 10:30 (not 06:30 as wrong UTC-then-display would give)
    expect(twz.hour).toBe(10);
    expect(twz.min).toBe(30);
    expect(twz.timeZone.name).toBe("Eastern Time (US & Canada)");
    // UTC instant should be 14:30 (10:30 EDT = UTC-4, so UTC = 10:30 + 4h)
    expect(twz.utc().epochMilliseconds).toBe(
      Temporal.Instant.from("2024-06-15T14:30:00Z").epochMilliseconds,
    );
  });

  it("cast parses string with offset as absolute instant then wraps in zone", () => {
    setZone("UTC");
    const converter = new TimeZoneConverter(new DateTime());
    const result = converter.cast("2024-06-15T10:30:00-04:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 10:30 EDT = 14:30 UTC, displayed in UTC zone
    expect(twz.hour).toBe(14);
    expect(twz.min).toBe(30);
  });

  it("cast returns raw subtype result when no zone is configured", () => {
    resetZone();
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const result = converter.cast(instant);
    // No zone set — value passes through unchanged
    expect(result).toBeInstanceOf(Temporal.Instant);
  });

  it("cast raises for plain object with non-multiparameter keys", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // Rails: the Hash branch delegates to DateTime#value_from_multiparameter_assignment,
    // which raises when keys 1/2/3 are missing.
    expect(() => converter.cast({ date: "2024-06-15" })).toThrow("doesn't contain necessary keys");
  });

  it("deserialize wraps Temporal.Instant from subtype in TimeWithZone", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    // DB value: "2024-06-15 14:00:00" (UTC stored value)
    const result = converter.deserialize("2024-06-15 14:00:00");
    expect(result).toBeInstanceOf(TimeWithZone);
    const twz = result as TimeWithZone;
    // 14:00 UTC = 10:00 EDT
    expect(twz.hour).toBe(10);
  });

  it("serialize extracts UTC from TimeWithZone before delegating to subtype", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const instant = Temporal.Instant.from("2024-06-15T14:00:00Z");
    const eastern = TimeZone.find("Eastern Time (US & Canada)");
    const twz = new TimeWithZone(instant, eastern);
    // 14:00 UTC displayed as 10:00 EDT; serialize (value_for_database) returns the
    // cast UTC Temporal.Instant — the adapter renders the SQL literal downstream.
    const result = converter.serialize(twz);
    expect(result).toBeInstanceOf(Temporal.Instant);
    expect((result as Temporal.Instant).toString()).toBe("2024-06-15T14:00:00Z");
  });

  it("serialize round-trips: deserialize then serialize returns the cast UTC value", () => {
    setZone("Eastern Time (US & Canada)");
    const converter = new TimeZoneConverter(new DateTime());
    const deserialized = converter.deserialize("2024-06-15 14:00:00");
    expect(deserialized).toBeInstanceOf(TimeWithZone);
    const serialized = converter.serialize(deserialized);
    // value_for_database is the cast UTC Temporal.Instant, not a SQL string.
    expect(serialized).toBeInstanceOf(Temporal.Instant);
    expect((serialized as Temporal.Instant).toString()).toBe("2024-06-15T14:00:00Z");
  });

  it("falls back to ActiveRecord.default_timezone when the subtype has no is_utc?", () => {
    // Rails resolves is_utc? for the wrapped type through
    // ActiveRecord::Type::Internal::Timezone (ActiveRecord.default_timezone), not
    // through ActiveModel's Time.zone_default-derived helper. The two diverge only
    // when default_timezone is :local while Time.zone_default stays UTC.
    const previous = getDefaultTimezone();
    // The is_utc? = false branch resolves to the host zone; pin it so the
    // assertion doesn't depend on the machine running the suite.
    vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("America/New_York");
    setZone("UTC"); // Time.zone (and Time.zone_default) stay UTC
    setDefaultTimezone("local");
    try {
      // A subtype exposing no is_utc? — the only case where the fallback fires.
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
      // 14:00Z read as wall-clock in the host zone is 10:00, re-interpreted in
      // Time.zone (UTC) as 10:00Z. Under the ActiveModel fallback the components
      // would be read as 14:00 UTC and the instant would come back unchanged.
      expect((result as TimeWithZone).utc().toString()).toBe("2024-06-15T10:00:00Z");
    } finally {
      setDefaultTimezone(previous);
    }
  });
});
